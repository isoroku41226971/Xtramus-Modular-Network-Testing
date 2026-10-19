/**
 * Fake channel for simulation mode. Simulation goes through exactly the same
 * pick-ports -> begin_test flow instead of skipping it; otherwise that path would only
 * run for the first time against a real gateway.
 *
 * The lease table lives in shared storage (localStorage in a browser) so tabs in the
 * same browser can see which ports the others hold. With sessionStorage each tab would
 * have its own copy and two tabs could lease the same ports, which is exactly what
 * leases exist to prevent.
 *
 * storage is injectable because Node has no localStorage.
 */

const LEASES_KEY = 'xmnt.sim.leases';

const port = (cid, bid, pid, extra = {}) => ({
  port: [cid, bid, pid], pidx: pid * 10, card_type: 12,
  media_speed: '1G', link_down: false, chassis_locked: false, holder: null, ...extra,
});

/** Deliberately includes one link-down port and one locked by another system, so the unavailable states are visible too. */
export const FAKE_PORTS = [
  port(0, 7, 1),
  port(0, 7, 2),
  port(0, 7, 3, { media_speed: '2.5G' }),
  port(0, 7, 4),
  port(0, 7, 5, { media_speed: 'LINKDOWN', link_down: true }),
  port(0, 3, 1, { media_speed: '10G' }),
  port(0, 3, 2, { chassis_locked: true }),
];

const key = p => p.join('/');

export function createFakeGateway({ storage = globalThis.localStorage } = {}) {
  const read = () => {
    try {
      return JSON.parse(storage?.getItem(LEASES_KEY) ?? '{}') ?? {};
    } catch {
      return {};                 // treat a corrupt lease table as empty rather than break the page
    }
  };
  const write = table => storage?.setItem(LEASES_KEY, JSON.stringify(table));

  /** Port -> holder. A real gateway's lease table plays the same role. */
  const holders = () => {
    const out = new Map();
    for (const entry of Object.values(read())) {
      for (const p of entry.ports) out.set(key(p), entry.pc_id);
    }
    return out;
  };

  return {
    async fetchStatus() {
      const held = holders();
      return {
        ports: FAKE_PORTS.map(p => {
          const pcId = held.get(key(p.port));
          if (!pcId) return p;
          return { ...p, chassis_locked: true, holder: { pc_id: pcId } };
        }),
      };
    },

    async beginTest({ pc_id: pcId, ports }) {
      const held = holders();
      const conflicts = ports.filter(p => held.has(key(p)));
      // check everything before registering; registering as we go would leave a partial lease on failure
      if (conflicts.length > 0) {
        throw new Error(`lease_held:${conflicts.map(key).join('、')} 已被其他分頁佔用`);
      }

      const lease = `SIM-${Math.random().toString(36).slice(2, 8)}`;
      write({ ...read(), [lease]: { pc_id: pcId, ports } });

      return {
        lease,
        ports: ports.map(p => {
          const known = FAKE_PORTS.find(f => key(f.port) === key(p));
          return { port: p, pidx: known?.pidx ?? 0,
                   media_speed: known?.media_speed ?? '1G', link_down: false };
        }),
      };
    },

    async endTest(lease) {
      if (!lease) return;
      const table = read();
      if (!(lease in table)) return;      // already released or unknown; not an error
      delete table[lease];
      write(table);
    },
  };
}
