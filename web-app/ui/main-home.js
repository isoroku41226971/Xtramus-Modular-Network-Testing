/** Home page wiring. No jsdom, so this file has no automated tests. */

import { createStore } from './store.js';
import { createPorts } from './ports.js';
import { createSync, openChannel } from './sync.js';
import { ensurePcId, ensureTabId, writeLease } from './session.js';
import { portKey, lastUsedPorts, stripUnleasedPorts } from './project.js';
import { installChrome } from './chrome.js';
import { mountHome } from './view-home.js';
import { openPortDialog } from './view-port-dialog.js';
import { createFakeGateway } from './fake-gateway.js';
import { canUseFileSystemAccess, openProjectFile, readDroppedFile } from './file-handle.js';
import { parseProjectFile, DEFAULT_PROJECT_NAME } from './project-file.js';
import { saveHandleForTab } from './file-handles-db.js';
import { showLoadingTransition } from './view-loading-transition.js';

// The real channel is not connected yet. Until it is, both are null and simulation mode
// is the only working path, which is why simulation mode must be on the home page.
const fetchStatus = null;
const beginTest = null;

const store = createStore({
  storage: globalThis.localStorage,
  session: globalThis.sessionStorage,
});
const sync = createSync({ channel: openChannel() });
const tabId = ensureTabId(globalThis.sessionStorage);

const simulating = () => store.getState().simulate === true;
const sim = createFakeGateway();

let home = null;
const ports = createPorts({
  fetchStatus: () => (simulating() ? sim.fetchStatus() : fetchStatus?.() ?? null),
  onChange: () => home?.refresh(),
});

// toggling simulation mode switches the port source, so re-query immediately, or the dialog would open with stale state
let lastSimulate = null;
store.subscribe(({ simulate }) => {
  if (simulate !== lastSimulate) { lastSimulate = simulate; ports.refresh(); }
});

store.dispatch({ type: 'set-pc-id', value: ensurePcId(globalThis.localStorage) });

installChrome(document);              // the logo does nothing on the home page; we are already home

const dialogEl = document.getElementById('port-dialog');

/**
 * Shared final steps before entering the workspace: pick ports -> begin_test -> save
 * the handle -> load the store -> navigate.
 *
 * Ports are cleaned up here (stripUnleasedPorts) rather than in the workspace: a
 * project saved on another machine may reference ports that cannot be leased, and the
 * user may pick a different subset. Cleaning up before loading the store means the
 * workspace never has to.
 */
function enterWorkspace({ name, items, queueItemIds, handle }, simulate) {
  openPortDialog(dialogEl, {
    ports: ports.getState(),
    preselect: lastUsedPorts(items),
    onConfirm: async picked => {
      const begin = simulate ? sim.beginTest : beginTest;
      const res = await begin({ pc_id: store.getState().pcId, ports: picked });
      const pidx = Object.fromEntries(res.ports.map(p => [portKey(p.port), p.pidx]));

      await saveHandleForTab(tabId, handle);

      const strippedItems = items.map(it => stripUnleasedPorts(it, picked));
      store.dispatch({ type: 'load-project-file', name, items: strippedItems, queueItemIds });
      store.dispatch({ type: 'open-project', lease: res.lease, ports: picked, pidx });
      writeLease(globalThis.sessionStorage, res.lease);

      sync.notify();               // these ports were just taken; other tabs need to know
      dialogEl.close();

      await showLoadingTransition();
      globalThis.location.href = 'workspace.html';
    },
  });
}

function showHomeError(text) { home?.setError(text); }

async function openFromPicker() {
  home?.setError(null);
  let picked;
  try {
    picked = await openProjectFile();
  } catch (e) {
    showHomeError(e instanceof Error ? e.message : String(e));
    return;
  }
  if (picked === null) return;      // the user cancelled; not an error
  openFromText(picked.text, picked.handle);
}

async function openFromFile(file, handle) {
  home?.setError(null);
  let text;
  try {
    text = await file.text();
  } catch (e) {
    showHomeError(e instanceof Error ? e.message : String(e));
    return;
  }
  openFromText(text, handle);
}

/**
 * Parse once to confirm the file is readable before entering the workspace; if it
 * cannot be parsed, stay on the home page instead of landing in an empty workspace
 * that looks like a successful load.
 */
function openFromText(text, handle) {
  const result = parseProjectFile(text);
  if (!result.ok) { showHomeError(`載不進來:${result.error}`); return; }
  enterWorkspace(
    { name: result.name, items: result.items, queueItemIds: result.queue, handle },
    simulating(),
  );
}

function createNewProject() {
  enterWorkspace(
    { name: DEFAULT_PROJECT_NAME, items: [], queueItemIds: [], handle: null },
    simulating(),
  );
}

home = mountHome(document.getElementById('home'), {
  store, ports,
  canOpenViaPicker: canUseFileSystemAccess(),
  onCreateNew: createNewProject,
  onOpenViaPicker: () => { void openFromPicker(); },
  onOpenViaInput: file => { void openFromFile(file, null); },
  onDropFile: ev => {
    void (async () => {
      const dropped = await readDroppedFile(ev.dataTransfer);
      if (dropped === null) return;
      await openFromFile(dropped.file, dropped.handle);
    })();
  },
});

// re-query port status when another tab acquires or releases a lease
sync.onNotify(() => ports.refresh());
ports.start();
