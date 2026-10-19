/**
 * Keeps file handles alive across pages.
 *
 * A FileSystemFileHandle is not JSON and cannot go into sessionStorage, and index.html
 * and workspace.html are two separate files, so navigating is a full reload that wipes
 * every module-level variable (Packet Studio can use module-level variables because it
 * is a client-side-routed SPA; this app is not). A FileSystemFileHandle is structured-
 * cloneable, and IndexedDB is the standard way to persist it.
 *
 * IndexedDB is per origin and shared across tabs, so entries are keyed by tabId;
 * otherwise two tabs with different files would overwrite each other (tabId comes from
 * ensureTabId in ui/session.js, stored in sessionStorage: it survives reloads of the
 * same tab and disappears when the tab closes).
 *
 * No jsdom, so this file has no automated tests: Node has no indexedDB. It is verified
 * manually in a browser.
 */

const DB_NAME = 'xmnt-file-handles';
const STORE_NAME = 'handles';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE_NAME); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = run(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

/** handle may be null ("new project" has no file yet), and reads back as null. */
export function saveHandleForTab(tabId, handle) {
  return withStore('readwrite', store => store.put(handle, tabId));
}

export async function loadHandleForTab(tabId) {
  const v = await withStore('readonly', store => store.get(tabId));
  return v ?? null;
}

export function clearHandleForTab(tabId) {
  return withStore('readwrite', store => store.delete(tabId));
}
