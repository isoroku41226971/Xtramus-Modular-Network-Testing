import { CommandEmitter } from './emitter.js';

/**
 * Folds NuPython-level calls into the channel's HTTP requests.
 *
 * All folding rules live in this file: a change to the channel spec (field names,
 * deduplication, how endpoints are split or merged) touches only this file, never the
 * engine or the other emitters.
 *
 * The 13 config_* calls produce no request (they only change the local struct); the
 * 4 counter getters and get_media_speed read the cache saved from the previous
 * response. Only 8 operations actually go on the wire.
 */
export class JsonChannelEmitter extends CommandEmitter {
  constructor(transport, { lease = null } = {}) {
    super();
    this.transport = transport;
    this.lease = lease;
    this.portCounterCache = {};    // { pidx: { cidx: value } }
    this.streamCounterCache = {};  // { pidx: { sid: {...} } }
    this.mediaSpeedCache = {};     // { pidx: value }
  }

  /** Acquire a lease. Not a NuPython method; this is the channel's own endpoint. */
  beginTest(pcId, ports) {
    const res = this.transport.send({ op: 'begin_test', pc_id: pcId, ports });
    this.lease = res.lease ?? this.lease;
    for (const p of res.ports ?? []) {
      this.mediaSpeedCache[p.pidx] = p.media_speed;
    }
    return res;
  }

  endTest() {
    return this.transport.send({ op: 'end_test', lease: this.lease });
  }

  _send(op, extra) {
    return this.transport.send({ op, lease: this.lease, ...extra });
  }

  _record(name, args) {
    switch (name) {
      case 'set_stream':
        // snapshot streamcfg; passing the reference would let later field changes alter requests already sent
        return this._send('set_stream', {
          pidx: args[0], sid: args[1], streamcfg: { ...this.streamcfg },
        });

      case 'transmit_pkts': {
        const pidx = args[0];
        return this._send('transmit', {
          pidx, ...(this.txcfg.byPort[pidx] ?? {}), isimmediate: this.txcfg.isimmediate,
        });
      }

      case 'transmit_pkts_sync':
        return this._send('transmit_sync', {});

      case 'clear_counter_port':
        return this._send('clear_counter_port', { pidx: args[0] });

      case 'clear_counter_stream':
        return this._send('clear_counter_stream', { pidx: args[0] });

      case 'set_config_rxstream':
        return this._send('set_config_rxstream', { pidx: args[0] });

      case 'read_counter_port_once': {
        const res = this._send('read_counter_port', { pidx: args[0] });
        this.portCounterCache[args[0]] = res.counters ?? {};
        return res;
      }

      case 'read_counter_stream_once': {
        const res = this._send('read_counter_stream', { pidx: args[0] });
        const bySid = {};
        for (const slot of res.streams ?? []) bySid[slot.sid] = slot;
        this.streamCounterCache[args[0]] = bySid;
        return res;
      }

      default:
        return undefined;   // the 13 config_* calls only change the local struct and never hit the wire
    }
  }

  _cached(name, args) {
    const [a0, a1] = args;
    switch (name) {
      case 'get_counter_port':
        return this.portCounterCache[a0]?.[a1] ?? 0;
      case 'get_counter_stream_tx_pkts':
        return this.streamCounterCache[a0]?.[a1]?.tx_pkts ?? 0;
      case 'get_counter_stream_rx_pkts':
        return this.streamCounterCache[a0]?.[a1]?.rx_pkts ?? 0;
      case 'get_counter_stream_rx_latency':
        return this.streamCounterCache[a0]?.[a1]?.rx_latency ?? 0;
      case 'get_media_speed':
        return this.mediaSpeedCache[a0] ?? 0;
      default:
        return 0;
    }
  }
}
