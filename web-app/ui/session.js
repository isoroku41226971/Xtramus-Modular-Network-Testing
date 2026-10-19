/**
 * pc_id, lease and leaving-the-page handling.
 *
 * Every dependency is injectable: Node has no localStorage / sessionStorage / navigator.
 */

const PC_ID_KEY = 'xmnt.pc_id';
const LEASE_KEY = 'xmnt.lease';
const TAB_ID_KEY = 'xmnt.tab_id';

/** pc_id is only a display name and grants nothing; permissions always come from the lease. */
export function ensurePcId(localStore) {
  const existing = localStore?.getItem(PC_ID_KEY);
  if (existing) return existing;

  const id = `PC-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  localStore?.setItem(PC_ID_KEY, id);
  return id;
}

/**
 * One id per tab, used to find this tab's open file handle in IndexedDB. A handle is not
 * JSON and cannot go in sessionStorage, so it lives in IndexedDB (shared by the whole
 * origin), and this id keeps tabs apart; otherwise two tabs with different files would
 * overwrite each other.
 *
 * Stored in sessionStorage (not localStorage) because the id's scope is this tab: a new
 * tab in the same browser must get a different id.
 */
export function ensureTabId(sessionStore) {
  const existing = sessionStore?.getItem(TAB_ID_KEY);
  if (existing) return existing;

  const id = `tab-${Math.random().toString(36).slice(2, 10)}`;
  sessionStore?.setItem(TAB_ID_KEY, id);
  return id;
}

/** The lease is stored in sessionStorage so each tab has its own and tabs in the same browser never take over each other's. */
export const readLease = sessionStore => sessionStore?.getItem(LEASE_KEY) ?? null;
export const writeLease = (sessionStore, lease) => sessionStore?.setItem(LEASE_KEY, lease);
export const clearLease = sessionStore => sessionStore?.removeItem(LEASE_KEY);

export function installUnloadGuard({
  getLease, sendBeacon, addEventListener, isBusy, isDirty = () => false,
  endpoint = '/end_test',
}) {
  const onBeforeUnload = ev => {
    // Intercept only when something is running or there are unsaved changes; otherwise
    // don't bother the user. end_test must **not** be sent here: the user may cancel and stay.
    if (!isBusy() && !isDirty()) return;
    ev.preventDefault();
    ev.returnValue = '';        // the text cannot be customized; the browser shows its own generic dialog
  };

  const onPageHide = () => {
    const lease = getLease();
    if (!lease) return;
    // fetch is often cancelled during unload; only sendBeacon is guaranteed to go out
    sendBeacon(endpoint, JSON.stringify({ op: 'end_test', lease }));
  };

  addEventListener('beforeunload', onBeforeUnload);
  addEventListener('pagehide', onPageHide);

  return () => {
    globalThis.removeEventListener?.('beforeunload', onBeforeUnload);
    globalThis.removeEventListener?.('pagehide', onPageHide);
  };
}
