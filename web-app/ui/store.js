/**
 * The single source of truth for application state.
 *
 * storage (machine/browser level, e.g. pcId and the simulation preference) and session
 * (this tab's project contents for this session) are two injected parameters rather than
 * globalThis: Node has no localStorage/sessionStorage, and hard-coding them would make
 * this module untestable.
 *
 * name/items/queue go in session, not storage, because the file is the single source of
 * truth and nothing is auto-saved across sessions. sessionStorage's scope is exactly
 * "this tab, this session": a workspace reload keeps it, closing the tab drops it, and
 * nobody is misled into thinking something was saved.
 */

import { queueBlockReason } from './queue.js';

export const STORAGE_KEY = 'xmnt.state.v1';
export const SESSION_KEY = 'xmnt.session.v1';

let seq = 0;
const nextId = prefix => `${prefix}${(seq += 1)}-${Date.now().toString(36)}`;

const emptyProject = () => ({ lease: null, ports: [], pidx: {} });
const DEFAULT_NAME = '未命名專案';

function emptyState() {
  return {
    pcId: null, simulate: false,
    name: DEFAULT_NAME, items: [], queue: [],
    project: emptyProject(),
  };
}

/** storage (localStorage): preferences that persist across sessions and belong to no project. */
function serializeLocal(state) {
  return JSON.stringify({ pcId: state.pcId, simulate: state.simulate });
}

/** session (sessionStorage): this tab's open project contents + lease. */
function serializeSession(state) {
  return JSON.stringify({
    name: state.name,
    items: state.items,
    queue: state.queue.map(q => ({
      queueId: q.queueId, itemId: q.itemId, lastResult: q.lastResult ?? null,
    })),
    project: state.project,
  });
}

function safeParse(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw) ?? {};
  } catch {
    return {};      // corrupt content must not stop the page from loading
  }
}

function hydrate(localRaw, sessionRaw) {
  const local = safeParse(localRaw);
  const session = safeParse(sessionRaw);

  const p = session.project;
  const project = p && typeof p === 'object'
    ? { lease: p.lease ?? null, ports: Array.isArray(p.ports) ? p.ports : [], pidx: p.pidx ?? {} }
    : emptyProject();

  return {
    pcId: local.pcId ?? null,
    simulate: local.simulate ?? false,
    name: typeof session.name === 'string' ? session.name : DEFAULT_NAME,
    items: Array.isArray(session.items) ? session.items : [],
    queue: (Array.isArray(session.queue) ? session.queue : []).map(q => ({
      queueId: q.queueId, itemId: q.itemId,
      status: 'idle', progress: 0, log: [], counterLog: [],
      lastResult: q.lastResult ?? null, error: null, snapshot: null,
      startedAt: null, finishedAt: null,
    })),
    project,
  };
}

function reduce(state, action) {
  switch (action.type) {
    case 'add-item':
      return { ...state, items: [...state.items, action.item] };

    case 'remove-item':
      // also remove queue entries that reference it, or the runner would get orphans with no item
      return {
        ...state,
        items: state.items.filter(i => i.id !== action.id),
        queue: state.queue.filter(q => q.itemId !== action.id),
      };

    // Block when the same item, or another item with the same name, is already queued;
    // otherwise the queue would show identical or same-named rows whose results can't be
    // told apart. This is the only place that actually adds to the queue, so enforcing it
    // here rather than only in the button's UI means no caller (including the "add all"
    // loop) can bypass the rule.
    case 'enqueue': {
      const item = state.items.find(i => i.id === action.itemId);
      if (item && queueBlockReason(state, item)) return state;
      return {
        ...state,
        queue: [...state.queue, {
          queueId: nextId('q'), itemId: action.itemId,
          status: 'idle', progress: 0, log: [], counterLog: [],
          lastResult: null, error: null, snapshot: null,
          startedAt: null, finishedAt: null,
        }],
      };
    }

    // drag-to-reorder in the queue; invalid indexes return the state unchanged, so dropping outside the list can't corrupt the queue
    case 'move-queue': {
      const { from, to } = action;
      const n = state.queue.length;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state;
      const queue = [...state.queue];
      queue.splice(to, 0, ...queue.splice(from, 1));
      return { ...state, queue };
    }

    case 'dequeue':
      return { ...state, queue: state.queue.filter(q => q.queueId !== action.queueId) };

    case 'patch-queue':
      return {
        ...state,
        queue: state.queue.map(q =>
          q.queueId === action.queueId ? { ...q, ...action.patch } : q),
      };

    case 'set-simulate':
      return { ...state, simulate: action.value };

    case 'set-pc-id':
      return { ...state, pcId: action.value };

    // Change only one item's fields. Deliberately not remove+add: remove-item also clears
    // queue entries referencing the item, so merely clearing a port would wipe the user's queue.
    case 'patch-item':
      return {
        ...state,
        items: state.items.map(i =>
          i.id === action.id ? { ...i, ...action.patch } : i),
      };

    case 'open-project':
      return {
        ...state,
        project: { lease: action.lease, ports: action.ports, pidx: action.pidx ?? {} },
      };

    case 'close-project':
      return { ...state, project: emptyProject() };

    // Open or create a .xmnt project: replace name/items/queue wholesale. Only the queue
    // order is rebuilt; all queueIds are regenerated and results start empty (the file
    // never stores run results).
    case 'load-project-file':
      return {
        ...state,
        name: action.name,
        items: action.items,
        queue: action.queueItemIds.map(itemId => ({
          queueId: nextId('q'), itemId,
          status: 'idle', progress: 0, log: [], counterLog: [],
          lastResult: null, error: null, snapshot: null,
        })),
      };

    // Save As updates the project name from the final file name (the user may have renamed it in the system dialog).
    case 'rename-project':
      return { ...state, name: action.name };

    default:
      return state;
  }
}

export function createStore({ storage = null, session = null } = {}) {
  let state = hydrate(
    storage?.getItem(STORAGE_KEY) ?? null,
    session?.getItem(SESSION_KEY) ?? null,
  );
  const listeners = new Set();

  return {
    getState: () => state,

    dispatch(action) {
      state = reduce(state, action);
      if (storage) storage.setItem(STORAGE_KEY, serializeLocal(state));
      if (session) session.setItem(SESSION_KEY, serializeSession(state));
      for (const fn of listeners) fn(state);
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
