/** Workspace wiring. No jsdom, so this file has no automated tests. */

import { createStore } from './store.js';
import { createRunner } from './runner.js';
import { createSync, openChannel } from './sync.js';
import { clearLease, ensureTabId, installUnloadGuard, readLease } from './session.js';
import { portKey } from './project.js';
import { installChrome } from './chrome.js';
import { createFakeGateway } from './fake-gateway.js';
import { mountCatalog, mountQuickAdd } from './view-catalog.js';
import { mountQueue } from './view-queue.js';
import { mountItems } from './view-items.js';
import { mountEditor } from './view-editor.js';
import { mountSaveBar } from './view-save-bar.js';
import { confirmLeave } from './view-leave-guard.js';
import { loadHandleForTab, saveHandleForTab, clearHandleForTab } from './file-handles-db.js';
import { statusDot } from './view-status-dot.js';
import { downloadBinary } from './file-handle.js';
import { buildXlsx } from '../engine/xlsx-writer.js';
import { buildReportSheets } from './export-excel.js';
import { buildReportPdf } from './export-pdf.js';
import { toggle } from './view-toggle.js';

// The real channel is not connected yet. Simulation mode uses the fake channel's lease table (the same one as the home page, shared across tabs).
const endTest = null;

const store = createStore({
  storage: globalThis.localStorage,
  session: globalThis.sessionStorage,
});
// The fake DUT takes 2 s per "measurement" so the queue's progress bar has something
// to show (otherwise the convergence loop finishes instantly at native JS speed and
// progress jumps to 100%). This only affects the interactive UI; tests don't pass this
// option and still finish instantly.
const runner = createRunner(store, { fakeResultDelaySeconds: 2 });
const sync = createSync({ channel: openChannel() });
const sim = createFakeGateway();
const simulating = () => store.getState().simulate === true;
const tabId = ensureTabId(globalThis.sessionStorage);

const { project } = store.getState();

// no lease and no simulation flag: we did not come from the home page, so go back and start over
if (project.ports.length === 0 && store.getState().simulate !== true) {
  globalThis.location.replace('index.html');
}

// Port cleanup already happened in the home page's enterWorkspace() (a project saved on
// another machine may reference ports that cannot be leased, and the user may have
// picked a different subset), so the items here already match the leased project.ports.

// A file handle is not JSON and cannot go in the store, so it lives in this module-level
// variable. Loading it is async (IndexedDB) but need not block the rest of the UI: until
// the handle is ready, "Save" behaves as if there were none (showing the "not saved yet"
// prompt); once loaded, currentHandle is updated and the next "Save" writes directly.
let currentHandle = null;
const getHandle = () => currentHandle;
const setHandle = async handle => {
  currentHandle = handle;
  await saveHandleForTab(tabId, handle);
};
loadHandleForTab(tabId).then(h => { currentHandle = h; });

const saveBar = mountSaveBar(document.getElementById('save-bar'), {
  store, getHandle, setHandle,
  needSaveAsDialog: document.getElementById('need-save-as'),
  saveAsDialog: document.getElementById('save-as'),
});

/**
 * Ask first when there are unsaved changes. Every in-app exit path (logo / close
 * project) goes through here, the only place where a clear message is possible
 * (beforeunload cannot show custom text). Returns false when the user cancels, and the
 * caller must not continue leaving.
 */
async function confirmLeaveIfDirty() {
  if (!saveBar.isDirty()) return true;
  const choice = await confirmLeave(document.getElementById('leave-guard'), {
    canSave: saveBar.supported,
    onSave: () => saveBar.save(),
    onDiscard: () => {},
  });
  return choice !== 'cancel';
}

async function closeProject() {
  if (runner.isBusy() && !globalThis.confirm('有測試正在執行,關閉專案會中斷它。要繼續嗎?')) {
    return;
  }
  if (!(await confirmLeaveIfDirty())) return;

  runner.abortAll();
  const lease = readLease(globalThis.sessionStorage);
  const end = simulating() ? sim.endTest : endTest;
  if (end && lease) await end(lease);
  clearLease(globalThis.sessionStorage);
  await clearHandleForTab(tabId);
  store.dispatch({ type: 'close-project' });
  sync.notify();          // other tabs may be waiting for these ports; without this they wait a full poll cycle
  globalThis.location.href = 'index.html';
}

installChrome(document, { onLogoClick: () => { void closeProject(); } });
document.getElementById('close-project').onclick = () => { void closeProject(); };

const leasedEl = document.getElementById('leased');
if (project.ports.length > 0) {
  leasedEl.append('租用中:');
  project.ports.forEach((p, i) => {
    if (i > 0) leasedEl.append('  ');
    const entry = document.createElement('span');
    entry.className = 'port-status';
    // Every port listed here was leased by this session, and there is no live
    // availability data to compare, so all get a blue dot: for this session a leased
    // port is healthy and usable, not "taken" in the red sense (red tells others whether
    // they can get the port).
    entry.append(statusDot(true), portKey(p));
    leasedEl.append(entry);
  });
} else {
  leasedEl.textContent = '模擬模式(沒有租用任何埠)';
}

// patch-item rather than remove+add: remove-item also clears queue entries referencing
// the item, so a mere parameter change would wipe the user's queue (and move the item
// to the end of the list)
const editor = mountEditor(document.getElementById('editor'), store, {
  onSave: item => store.dispatch({ type: 'patch-item', id: item.id, patch: item }),
});

const picker = mountCatalog(document.getElementById('picker'), store);

mountItems(document.getElementById('items'), store, { onEdit: item => editor.edit(item) });
mountQuickAdd(document.getElementById('catalog'), store);
mountQueue(document.getElementById('queue'), store, runner);

const batchEl = document.getElementById('batch');
store.subscribe(({ queue }) => {
  const done = queue.filter(q => ['done', 'failed', 'cancelled'].includes(q.status)).length;
  batchEl.textContent = queue.length === 0 ? '' : `整批 ${done}/${queue.length}`;
});

document.getElementById('new-item').onclick = () => picker.open();

document.getElementById('add-all').onclick = () => {
  for (const item of store.getState().items) {
    store.dispatch({ type: 'enqueue', itemId: item.id });
  }
};

// A read-only indicator, not a working toggle: simulation/real mode is chosen on the
// home page and the lease is acquired accordingly, so switching here would leave lease
// and mode mismatched. To change modes, close the project and choose again on the home
// page. onChange is a no-op: a disabled button never receives clicks, and a dispatching
// callback would only suggest it can be toggled.
//
// The check uses === true like simulating(), never !== false: with simulate undefined,
// !== false would show "on" while the actual behavior is real mode, and a read-only
// indicator's only job is to report the state truthfully.
const simLabel = document.createElement('label');
simLabel.className = 'switch-field switch-field-static';
const simBtn = toggle(store.getState().simulate === true, () => {},
  { disabled: true, ariaLabel: '模擬模式' });
simLabel.append(simBtn, ' 模擬模式');
document.getElementById('simulate-field').append(simLabel);

// Includes reruns: done/failed/cancelled items are queued too, not only idle ones that
// never ran; otherwise re-testing a whole batch would mean clicking every item's rerun
// button. running (cannot be triggered twice) and queued (already in this batch; setting
// it again is a redundant dispatch) are skipped. error is cleared too, matching the
// per-item rerun button; otherwise a failed item would keep its old error until the
// rerun finishes.
document.getElementById('run-all').onclick = () => {
  for (const q of store.getState().queue) {
    if (q.status !== 'running' && q.status !== 'queued') {
      store.dispatch({ type: 'patch-queue', queueId: q.queueId,
                       patch: { status: 'queued', error: null } });
    }
  }
  runner.start();
};

document.getElementById('stop-all').onclick = () => runner.abortAll();

// the button is enabled only when at least one item has a result; with nothing run there is nothing to export
const exportBtn = document.getElementById('export-excel');
const updateExportButton = () => {
  exportBtn.disabled = store.getState().queue.every(q => !q.lastResult);
};
store.subscribe(updateExportButton);
updateExportButton();
exportBtn.onclick = () => {
  try {
    const bytes = buildXlsx(buildReportSheets(store.getState()));
    const name = store.getState().name || 'XMNT';
    downloadBinary(bytes, `${name}-Report.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) {
    globalThis.alert(`匯出 Excel 失敗:${e instanceof Error ? e.message : String(e)}`);
  }
};

const exportPdfBtn = document.getElementById('export-pdf');
store.subscribe(() => { exportPdfBtn.disabled = store.getState().queue.every(q => !q.lastResult); });
exportPdfBtn.disabled = store.getState().queue.every(q => !q.lastResult);
exportPdfBtn.onclick = () => {
  try {
    const bytes = buildReportPdf(store.getState());
    const name = store.getState().name || 'XMNT';
    downloadBinary(bytes, `${name}-Report.pdf`, 'application/pdf');
  } catch (e) {
    // The only known way to get here: a test item name with non-Latin-1 characters (e.g.
    // Chinese). The editor warns about it live (see ui/view-editor.js) but does not block
    // saving, so a user who ignores the warning can still export. Without this try/catch
    // a failed export did nothing at all: the button simply seemed unresponsive, with no
    // error message.
    globalThis.alert(`匯出 PDF 失敗:${e instanceof Error ? e.message : String(e)}`);
  }
};

// When the tab closes or crashes, the "Close project" button is never clicked, so the
// lease is returned here. isDirty also intercepts when there are unsaved changes (not
// only while a test is running).
installUnloadGuard({
  getLease: () => readLease(globalThis.sessionStorage),
  isDirty: () => saveBar.isDirty(),
  // simulation mode has no endpoint to call, so delete the entry from the fake lease table, or closing the tab would keep the ports locked
  sendBeacon: (url, body) => {
    if (simulating()) { sim.endTest(JSON.parse(body).lease); return true; }
    return globalThis.navigator?.sendBeacon?.(url, body);
  },
  addEventListener: (n, fn) => globalThis.addEventListener(n, fn),
  isBusy: () => runner.isBusy(),
});

// Clear the handle too: once the tab closes its tabId (in sessionStorage) is gone, and
// nobody can ever find that IndexedDB entry again, so keeping it is just garbage.
// Not awaited: async work cannot be reliably awaited during pagehide, so like
// sendBeacon this is best effort; a failure only leaves an orphaned handle and does not
// affect correctness.
globalThis.addEventListener('pagehide', () => { void clearHandleForTab(tabId); });
