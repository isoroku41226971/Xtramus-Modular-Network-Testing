/**
 * Base class for command emitters.
 *
 * The 28 methods match NuPython one for one in name and argument order: the
 * recorded sequence must be directly comparable with the golden recordings, so
 * records are always written back in snake_case.
 *
 * The base does only two things: maintain local state, and forward calls to
 * _record() / _cached(). Deciding what goes on the wire is deliberately not done
 * here: RecordingEmitter must record all 28 (the golden comparison needs them), and
 * only JsonChannelEmitter folds calls according to WIRE_METHODS.
 */

/** The 8 that actually send commands to the chassis. */
export const WIRE_METHODS = new Set([
  'set_stream', 'transmit_pkts', 'transmit_pkts_sync',
  'clear_counter_port', 'clear_counter_stream',
  'read_counter_port_once', 'read_counter_stream_once', 'set_config_rxstream',
]);

/** The 15 that only change the local struct and send nothing. */
export const LOCAL_METHODS = new Set([
  'config_stream_smac', 'config_stream_dmac', 'config_stream_pktlen',
  'config_stream_utilization', 'config_stream_streamnum',
  'config_stream_ifg', 'config_stream_ibg', 'config_stream_adderror',
  'config_stream_vary', 'config_manual_txrate',
  'config_tx_isimmediate', 'config_tx_txpkts', 'config_tx_txtime',
  'config_stream_protocol', 'config_stream_udfpayload',
]);

/** The 5 that read data fetched by the previous read_*_once and send no request. */
export const CACHE_METHODS = new Set([
  'get_counter_port', 'get_counter_stream_tx_pkts',
  'get_counter_stream_rx_pkts', 'get_counter_stream_rx_latency',
  'get_media_speed',
]);

export class CommandEmitter {
  constructor() {
    // NuPython's streamcfg is a shared struct that is not reset after set_stream.
    // This must be mirrored: when folding to JSON, each set_stream carries the full current contents.
    this.streamcfg = {
      smac: null, dmac: null, pktlen: null, utilization: null,
      streamnum: null, beginidx: null, endidx: null,
      ifg: null, ibg: null, adderror: null,
      manual_txrate: 0, vary: null,
      protocol: null, payload: null,
    };
    this.txcfg = { isimmediate: null, byPort: {} };
  }

  /** Overridden by subclasses: record one call. */
  _record(name, args) {}   // eslint-disable-line no-unused-vars

  /** Overridden by subclasses: record one call and return its value. */
  _cached(name, args) { return 0; }   // eslint-disable-line no-unused-vars

  // --- local state only ---

  configStreamSmac(mac) { this.streamcfg.smac = mac; return this._record('config_stream_smac', [mac]); }
  configStreamDmac(mac) { this.streamcfg.dmac = mac; return this._record('config_stream_dmac', [mac]); }
  configStreamPktlen(len) { this.streamcfg.pktlen = len; return this._record('config_stream_pktlen', [len]); }
  configStreamUtilization(pct) { this.streamcfg.utilization = pct; return this._record('config_stream_utilization', [pct]); }
  configStreamStreamnum(n) {
    this.streamcfg.streamnum = n;
    // the vendor's config_stream_streamnum also resets the index range to 0..n-1
    this.streamcfg.beginidx = 0;
    this.streamcfg.endidx = n - 1;
    return this._record('config_stream_streamnum', [n]);
  }

  /**
   * Overwrite streamcfg's slot index range directly, **deliberately unrecorded**.
   *
   * On the Python side this is a plain struct assignment
   * (`nscmd.streamcfg.stream_beginidx = ...`) that goes through no vendor method, so
   * the recorder never sees it; recording it here would add an extra entry to replay.
   * The value must still go into streamcfg, because the JSON channel includes it when
   * folding set_stream requests.
   */
  overrideStreamIndexRange(begin, end) {
    this.streamcfg.beginidx = begin;
    this.streamcfg.endidx = end;
  }
  configStreamIfg(bits) { this.streamcfg.ifg = bits; return this._record('config_stream_ifg', [bits]); }
  configStreamIbg(bits) { this.streamcfg.ibg = bits; return this._record('config_stream_ibg', [bits]); }
  configStreamAdderror(code) { this.streamcfg.adderror = code; return this._record('config_stream_adderror', [code]); }
  configManualTxrate(mode) { this.streamcfg.manual_txrate = mode; return this._record('config_manual_txrate', [mode]); }

  // Defaults copied from the vendor's config_stream_vary (each group mode=0, limit=2**8-1, delta=1).
  // The recorder stores all 15 arguments with defaults filled in, so replay needs them.
  configStreamVary(daMode = 0, daLimit = 255, daDelta = 1,
                   saMode = 0, saLimit = 255, saDelta = 1,
                   vidMode = 0, vidLimit = 255, vidDelta = 1,
                   dipMode = 0, dipLimit = 255, dipDelta = 1,
                   sipMode = 0, sipLimit = 255, sipDelta = 1) {
    this.streamcfg.vary = {
      da_mode: daMode, da_limit: daLimit, da_delta: daDelta,
      sa_mode: saMode, sa_limit: saLimit, sa_delta: saDelta,
      vid_mode: vidMode, vid_limit: vidLimit, vid_delta: vidDelta,
      dip_mode: dipMode, dip_limit: dipLimit, dip_delta: dipDelta,
      sip_mode: sipMode, sip_limit: sipLimit, sip_delta: sipDelta,
    };
    return this._record('config_stream_vary', [
      daMode, daLimit, daDelta, saMode, saLimit, saDelta,
      vidMode, vidLimit, vidDelta, dipMode, dipLimit, dipDelta,
      sipMode, sipLimit, sipDelta,
    ]);
  }

  // 0-layer2, 1-layer3 ipv4, 2-layer3 udp, 3-layer3 ipv6, 4-ARP, 0xd-user define.
  // Only in the 0xd branch does the vendor SDK actually write stream_payload into the
  // frame (NuPython.py line 2364); every other branch ignores the payload and
  // synthesizes a standard frame.
  configStreamProtocol(val) {
    this.streamcfg.protocol = val;
    return this._record('config_stream_protocol', [val]);
  }
  configStreamUdfpayload(bytes) {
    this.streamcfg.payload = bytes;
    return this._record('config_stream_udfpayload', [bytes]);
  }

  configTxIsimmediate(val) { this.txcfg.isimmediate = val; return this._record('config_tx_isimmediate', [val]); }
  configTxTxpkts(pidx, total) {
    this.txcfg.byPort[pidx] = { mode: 'txpkts', total_pkts: total };
    return this._record('config_tx_txpkts', [pidx, total]);
  }
  configTxTxtime(pidx, seconds) {
    this.txcfg.byPort[pidx] = { mode: 'txtime', seconds };
    return this._record('config_tx_txtime', [pidx, seconds]);
  }

  // --- commands that go on the wire ---

  setStream(pidx, sid) { return this._record('set_stream', [pidx, sid]); }
  transmitPkts(pidx) { return this._record('transmit_pkts', [pidx]); }
  transmitPktsSync() { return this._record('transmit_pkts_sync', []); }
  clearCounterPort(pidx) { return this._record('clear_counter_port', [pidx]); }
  clearCounterStream(pidx) { return this._record('clear_counter_stream', [pidx]); }
  readCounterPortOnce(pidx) { return this._record('read_counter_port_once', [pidx]); }
  readCounterStreamOnce(pidx) { return this._record('read_counter_stream_once', [pidx]); }
  setConfigRxstream(pidx) { return this._record('set_config_rxstream', [pidx]); }

  // --- cache reads ---

  getCounterPort(pidx, cidx) { return this._cached('get_counter_port', [pidx, cidx]); }
  getCounterStreamTxPkts(pidx, sid) { return this._cached('get_counter_stream_tx_pkts', [pidx, sid]); }
  getCounterStreamRxPkts(pidx, sid) { return this._cached('get_counter_stream_rx_pkts', [pidx, sid]); }
  getCounterStreamRxLatency(pidx, sid) { return this._cached('get_counter_stream_rx_latency', [pidx, sid]); }
  getMediaSpeed(pidx) { return this._cached('get_media_speed', [pidx]); }
}
