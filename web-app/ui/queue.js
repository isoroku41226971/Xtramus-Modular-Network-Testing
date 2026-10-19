/**
 * Queue state machine. Pure functions; no store, no DOM.
 *
 * Leases are not handled here: ports are chosen once when entering the project and held
 * throughout, so the runner never needs to know leases exist.
 */

import { MODULES } from '../engine/catalog.js';

const key = p => p.join('/');

/** The ports this item actually uses, chosen by topology; counting extra ports would make the lease lock unused ones. */
export function portsOf(item) {
  const fields = MODULES.topology[item.recipe.topology]?.ports ?? [];
  const out = [];
  const seen = new Set();

  for (const f of fields) {
    const v = item.ports?.[f];
    if (v == null) continue;
    // mesh_* are port lists; tx_port/rx_port/monitor_port are single ports
    const list = Array.isArray(v[0]) ? v : [v];
    for (const p of list) {
      if (!seen.has(key(p))) { seen.add(key(p)); out.push(p); }
    }
  }
  return out;
}

/** Single runner: while one item is running, the next is not taken. */
export function nextRunnable(state) {
  if (state.queue.some(q => q.status === 'running')) return null;
  return state.queue.find(q => q.status === 'queued') ?? null;
}

/**
 * Whether this item can be added to the queue now: returns a reason to show the user if
 * not, or null if it can.
 *
 * Two cases block it, regardless of the other entry's status (idle/running/done/...):
 * as long as that row is still shown in the queue it counts as present, until the user
 * removes or renames it.
 *
 * 1. The same item (same id) is already queued. A test item can have only one queue
 *    entry at a time; repeatedly clicking "add to queue" must not stack identical rows
 *    that cannot be told apart. To run it again, use the existing entry's rerun button.
 * 2. A different item (different id) with the same name is already queued. Two
 *    differently configured items sharing a display name would make the results list
 *    just as ambiguous.
 *
 * An empty/undefined name never conflicts in case 2: two unnamed items should not block
 * each other, and tests use minimal item stand-ins without a name field, which would all
 * compare equal and be misjudged as duplicates. Case 1 is unaffected (it compares ids,
 * not names).
 */
export function queueBlockReason(state, item) {
  if (state.queue.some(q => q.itemId === item.id)) {
    return '此測試項已經在待測區 —— 用該筆的「▶ 重跑」,或先移除再重新加入。';
  }
  if (!item.name) return null;
  const nameClash = state.queue.some(q => {
    const other = state.items.find(i => i.id === q.itemId);
    return other != null && other.name === item.name;
  });
  return nameClash ? '待測區已有同名測試項 —— 請先改名,或等它從待測區移除。' : null;
}
