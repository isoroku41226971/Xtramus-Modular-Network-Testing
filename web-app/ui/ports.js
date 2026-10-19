/**
 * Port status, backed by the channel's status endpoint.
 *
 * fetchStatus is injectable: tests need to run without a network, and no real gateway
 * is connected yet. null means there is no channel, available is false, and the home
 * page offers "enter in simulation mode" instead.
 */

export function portLabel(p) {
  const id = (p.port ?? []).join('/');
  if (p.link_down) return `${id} · link down`;

  const speed = p.media_speed ?? '';
  if (p.holder) return `${id} · ${speed} · 使用中 ${p.holder.pc_id}`;
  // chassis_locked with no holder: someone locked the port without the gateway (e.g. by running Python directly)
  if (p.chassis_locked) return `${id} · ${speed} · 被佔用(非本系統)`;
  return `${id} · ${speed}`;
}

export function createPorts({ fetchStatus = null, onChange = null } = {}) {
  let state = { available: false, ports: [], error: null };
  let timer = null;

  // Notify only on real changes: notifying on every poll would rebuild the home page DOM
  // every 5 seconds and pull buttons out from under the user mid-click.
  const set = next => {
    const changed = JSON.stringify(next) !== JSON.stringify(state);
    state = next;
    if (changed) onChange?.(state);
  };

  async function refresh() {
    if (!fetchStatus) { set({ available: false, ports: [], error: null }); return; }
    try {
      const res = await fetchStatus();
      // null means there is no source right now (simulation is off and no real gateway is
      // connected). That is different from "a channel that reports 0 ports" and must not
      // be merged into the same state.
      if (!res) { set({ available: false, ports: [], error: null }); return; }
      set({ available: true, ports: res.ports ?? [], error: null });
    } catch (err) {
      // stale data would mislead (the port may have been taken long ago), so clear it on failure
      set({ available: false, ports: [], error: String(err?.message ?? err) });
    }
  }

  return {
    getState: () => state,
    refresh,
    start(intervalMs = 5000) {
      if (timer) return;
      refresh();
      timer = setInterval(refresh, intervalMs);
    },
    stop() {
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}
