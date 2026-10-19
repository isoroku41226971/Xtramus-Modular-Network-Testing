/**
 * Cross-tab notifications.
 *
 * Only a "go re-query" signal is sent, never the actual state: the truth lives in the
 * gateway, and forwarded state could be stale on arrival (a third machine might act in
 * between).
 *
 * Works only between tabs of the same browser. Other machines still rely on status
 * polling and lag by at most one poll cycle; real-time cross-machine updates would need
 * gateway push, which is not worth extending the channel spec for.
 *
 * channel is injectable because Node has no BroadcastChannel.
 */

const SIGNAL = 'ports-changed';

export function openChannel(name = 'xmnt') {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name);
}

export function createSync({ channel = null } = {}) {
  return {
    /** Call after acquiring and after releasing a lease; the release matters just as much, since other tabs may be waiting for these ports. */
    notify() { channel?.postMessage({ type: SIGNAL }); },

    onNotify(fn) {
      if (!channel) return;
      channel.onmessage = ev => { if (ev?.data?.type === SIGNAL) fn(); };
    },

    close() { channel?.close(); },
  };
}
