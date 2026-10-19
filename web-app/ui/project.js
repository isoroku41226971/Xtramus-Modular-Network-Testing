/**
 * Pure logic for projects and leases. No DOM, no store.
 *
 * A project is a set of leased ports + test items + a queue. Ports are chosen once when
 * entering the project and the lease is held for the whole project, so all that is
 * needed here is "are these ports enough", not any "which item is running, should the
 * lease change" bookkeeping.
 */

import { MODULES } from '../engine/catalog.js';

export const portKey = p => p.join('/');

const byPort = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** Group by chassis/board. A port in the status response is [chassis_id, board_id, port_id]. */
export function groupPortsByBoard(statusPorts) {
  const groups = new Map();
  for (const p of statusPorts ?? []) {
    const [cid, bid] = p.port;
    const key = `${cid}/${bid}`;
    if (!groups.has(key)) groups.set(key, { key, label: `Board ${bid}`, ports: [] });
    groups.get(key).ports.push(p);
  }
  for (const g of groups.values()) g.ports.sort((a, b) => byPort(a.port, b.port));
  return [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key, 'en', { numeric: true }));
}

/**
 * Two kinds of occupancy, reported separately, both unselectable:
 *   chassis_locked  the chassis reports the port locked (possibly by someone bypassing the gateway)
 *   holder          the gateway's own lease table has a holder
 */
export const isSelectable = p =>
  !p.link_down && !p.chassis_locked && !p.holder;

/** The ports this item actually uses; the topology decides which fields to read. */
function portsOfItem(item) {
  const fields = MODULES.topology[item.recipe?.topology]?.ports ?? [];
  const out = [];
  for (const f of fields) {
    const v = item.ports?.[f];
    if (v == null) continue;
    // mesh_* are port lists; tx_port/rx_port/monitor_port are single ports
    out.push(...(Array.isArray(v[0]) ? v : [v]));
  }
  return out;
}

/** Which ports these test items use; pre-selected in the port dialog when opening a .xmnt. */
export function lastUsedPorts(items) {
  const seen = new Set();
  const out = [];
  for (const it of items ?? []) {
    for (const p of portsOfItem(it)) {
      if (!seen.has(portKey(p))) { seen.add(portKey(p)); out.push(p); }
    }
  }
  return out.sort(byPort);
}

/**
 * Clear ports outside the lease. All the assembly work (five dimensions, parameters) is
 * kept; only the ports need reassigning.
 *
 * Mesh fields are all or nothing: a mesh with half its ports is a different test, and a
 * silently missing port is harder to notice than a fully cleared field.
 */
export function stripUnleasedPorts(item, leased) {
  const have = new Set((leased ?? []).map(portKey));
  const ports = {};

  for (const [field, v] of Object.entries(item.ports ?? {})) {
    if (v == null) continue;
    if (Array.isArray(v[0])) {
      if (v.every(p => have.has(portKey(p)))) ports[field] = v;
    } else if (have.has(portKey(v))) {
      ports[field] = v;
    }
  }
  return { ...item, ports };
}

/** Of the wanted ports, the ones that cannot be had right now, with reasons. */
export function conflictNotes(wanted, statusPorts) {
  const byKey = new Map((statusPorts ?? []).map(p => [portKey(p.port), p]));
  const notes = [];

  for (const w of wanted ?? []) {
    const p = byKey.get(portKey(w));
    if (!p) {
      notes.push({ port: w, reason: '機箱沒有回報這個埠(不存在或已拔除)' });
      continue;
    }
    if (isSelectable(p)) continue;
    if (p.link_down) notes.push({ port: w, reason: 'link down' });
    else if (p.holder) notes.push({ port: w, reason: `使用中 ${p.holder.pc_id}` });
    else notes.push({ port: w, reason: '被佔用(非本系統)' });
  }
  return notes;
}
