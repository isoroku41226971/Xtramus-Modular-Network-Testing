import { DeviceError, ConfigError } from './errors.js';
import {
  IDX_PORTCOUNTER_TX_PKT, IDX_PORTCOUNTER_RX_UNICAST,
  IDX_PORTCOUNTER_RX_BORADCAST, MEDIA_SPEED_BPS, ERROR_CRC, ERROR_ALIGN,
} from './nuconst.js';
import { unicastStream } from './primitives.js';
import { computeMacVaryBlocks, macVaryBlockBaseMac } from './mac-vary.js';

const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';

/**
 * Maps error_type to the vendor's error-injection code.
 *
 * undersize/oversize have no injection code (the illegal frame length itself is
 * the error), but they **must still pass 0 explicitly**: stream_error is a field of
 * a shared struct, and if it is not cleared the next stream inherits it. On real
 * hardware this once showed up as all error types getting mixed together.
 */
function adderrorCode(errorType) {
  if (errorType === 'bad_crc') return ERROR_CRC;
  if (errorType === 'alignment') return ERROR_ALIGN;
  if (errorType === 'undersize' || errorType === 'oversize') return 0;
  throw new ConfigError(`不支援的 error_type:${errorType}`);
}

/** Default sleep; replay tests inject a no-op. */
const realSleep = seconds => new Promise(r => setTimeout(r, seconds * 1000));

/**
 * Connection-layer backend, the counterpart of NuPythonBackend in
 * ../python-app/nupython_xmnt.py.
 *
 * Two structural differences from the Python version:
 *   1. Commands go through the emitter, not nscmd. Every method that reaches the
 *      wire is awaited: the emitter is synchronous during replay, but returns
 *      Promises once a real channel is attached.
 *   2. The connection lifecycle (open/close) is not here; it is the channel's
 *      begin_test / end_test, and the caller fills in the port-role indexes from
 *      the begin_test response.
 */
export class Backend {
  constructor(cfg, emitter, { sleep = realSleep } = {}) {
    this.cfg = cfg;
    this.emitter = emitter;
    this.sleep = sleep;

    // Port roles, filled in from the begin_test response (by makeReplayBackend during replay).
    this.txPortIdx = null;
    this.txPort2Idx = null;
    this.rxPortIdx = null;
    this.monitorPortIdx = null;
    this.meshTxPortIdxs = null;
    this.meshRxPortIdxs = null;
    this.meshPortIdxs = null;
  }

  // --- stream setup ---

  async configureStream(spec, streamPortIdx = null) {
    const portIdx = streamPortIdx ?? this.txPortIdx;

    if (spec.kind === 'UnicastStream') {
      await this.emitter.configStreamPktlen(spec.framesize);
      await this.emitter.configStreamSmac(spec.smac);
      await this.emitter.configStreamDmac(spec.dmac);
      await this.emitter.configStreamUtilization(spec.loading);
      await this.emitter.configStreamStreamnum(1);
      await this.emitter.setStream(portIdx, 0);
      return;
    }

    if (spec.kind === 'BroadcastStream') {
      await this.emitter.configStreamPktlen(spec.framesize);
      await this.emitter.configStreamSmac(spec.smac);
      await this.emitter.configStreamDmac(BROADCAST_MAC);
      await this.emitter.configStreamUtilization(spec.loading);
      await this.emitter.configStreamStreamnum(1);
      await this.emitter.setStream(portIdx, 0);
      return;
    }

    if (spec.kind === 'ErrorStream') {
      await this.emitter.configStreamPktlen(spec.framesize);
      await this.emitter.configStreamSmac(spec.smac);
      await this.emitter.configStreamDmac(spec.dmac);
      await this.emitter.configStreamUtilization(spec.loading);
      await this.emitter.configStreamStreamnum(1);
      await this.emitter.configStreamAdderror(adderrorCode(spec.errorType));
      await this.emitter.setStream(portIdx, 0);
      return;
    }

    if (spec.kind === 'PressureStream') {
      // no config_stream_utilization: in manual-gap mode the rate is set by ifg/ibg
      await this.emitter.configStreamPktlen(spec.framesize);
      await this.emitter.configStreamSmac(spec.smac);
      await this.emitter.configStreamDmac(spec.dmac);
      await this.emitter.configStreamStreamnum(1);
      await this.emitter.configManualTxrate(2);
      await this.emitter.configStreamIfg(spec.gapBits);
      await this.emitter.configStreamIbg(spec.gapBits);
      await this.emitter.setStream(portIdx, 0);
      await this.emitter.configManualTxrate(0);   // without this reset the next stream is polluted
      return;
    }

    if (spec.kind === 'MeshStream') {
      await this.emitter.configStreamPktlen(spec.framesize);
      await this.emitter.configStreamSmac(spec.senderMac);
      // streamnum must include sidOffset; counting only destinations would overwrite slots used by earlier senders
      await this.emitter.configStreamStreamnum(spec.sidOffset + spec.destMacs.length);
      for (const [localIdx, destMac] of spec.destMacs.entries()) {
        await this.emitter.configStreamDmac(destMac);
        await this.emitter.configStreamUtilization(spec.loadingPerDest);
        await this.emitter.setStream(portIdx, spec.sidOffset + localIdx);
      }
      // config_stream_streamnum always sets beginidx to 0, so restore the real range here
      this.emitter.overrideStreamIndexRange(
        spec.sidOffset, spec.sidOffset + spec.destMacs.length - 1);
      return;
    }

    if (spec.kind === 'MeshErrorStream') {
      // no shared pktlen: each entry's length is set inside the loop
      await this.emitter.configStreamSmac(spec.senderMac);
      await this.emitter.configStreamStreamnum(spec.sidOffset + spec.entries.length);
      for (const [localIdx, [destMac, errorType, entryFramesize]] of spec.entries.entries()) {
        await this.emitter.configStreamPktlen(entryFramesize);
        await this.emitter.configStreamDmac(destMac);
        await this.emitter.configStreamUtilization(spec.loading);
        await this.emitter.configStreamAdderror(adderrorCode(errorType));
        await this.emitter.setStream(portIdx, spec.sidOffset + localIdx);
      }
      this.emitter.overrideStreamIndexRange(
        spec.sidOffset, spec.sidOffset + spec.entries.length - 1);
      return;
    }

    if (spec.kind === 'MeshPressureStream') {
      await this.emitter.configStreamPktlen(spec.framesize);
      await this.emitter.configStreamSmac(spec.senderMac);
      await this.emitter.configStreamStreamnum(spec.sidOffset + spec.destMacs.length);
      // manual rate and gaps must be set before set_stream; set afterwards they don't affect this send
      await this.emitter.configManualTxrate(2);
      await this.emitter.configStreamIfg(spec.gapBits);
      await this.emitter.configStreamIbg(spec.gapBits);
      for (const [localIdx, destMac] of spec.destMacs.entries()) {
        await this.emitter.configStreamDmac(destMac);
        await this.emitter.setStream(portIdx, spec.sidOffset + localIdx);
      }
      this.emitter.overrideStreamIndexRange(
        spec.sidOffset, spec.sidOffset + spec.destMacs.length - 1);
      await this.emitter.configManualTxrate(0);   // without this reset the next stream is polluted
      return;
    }

    if (spec.kind === 'CustomStream') {
      // user-defined mode (0xd): only in this branch does the vendor SDK write
      // stream_payload into the frame (NuPython.py line 2364); every other branch
      // ignores the configured payload and synthesizes a standard Ethernet frame.
      //
      // no smac/dmac calls: the source/destination MACs are already in the first
      // 12 bytes of the captured raw frame, and with protocol=0xd those settings are never read.
      await this.emitter.configStreamProtocol(0xd);
      await this.emitter.configStreamStreamnum(spec.packets.length);
      for (const [localIdx, pkt] of spec.packets.entries()) {
        // set pktlen per frame, since frames in a PCAP have different lengths
        await this.emitter.configStreamPktlen(pkt.bytes.length);
        await this.emitter.configStreamUdfpayload(pkt.bytes);
        await this.emitter.setStream(portIdx, localIdx);
      }
      this.emitter.overrideStreamIndexRange(0, spec.packets.length - 1);
      return;
    }

    throw new ConfigError(`不支援的 stream 型別:${spec.kind}`);
  }

  // --- learning ---

  learningGapBits() {
    // Python's int() truncates rather than rounds
    const raw = Math.trunc(this.mediaSpeedBps() * this.cfg.learning_gap_seconds);
    return Math.max(96, Math.min(raw, 0xFFFFFFFF));
  }

  async applyLearning(spec) {
    if (spec.kind === 'NoLearning') return;
    if (spec.kind === 'AddressLearning') {
      await this.sendLearningFrames(spec.senderPortIdx, spec.macList, spec.destMac);
      return;
    }
    if (spec.kind === 'VaryingAddressAgedLearning') {
      // NuPython has no API to set the DUT's aging time remotely; the operator sets it
      // in the DUT's own management interface, so all we can do here is wait.
      await this.sleep(spec.agingTime);
      await this.sendVaryingLearningFrames(
        spec.senderPortIdx, spec.macCount, spec.destMac, spec.learningLoading);
      await this.clearCounters();
      await this.sendVaryingTestFrames(
        spec.txPortIdx, spec.macCount, spec.srcMac, spec.framesize, spec.loading);
      return;
    }
    throw new ConfigError(`不支援的 learning 型別:${spec.kind}`);
  }

  /**
   * Teaching phase: the hardware auto-increments the **source** address (SA vary),
   * so one block covers up to 256 MACs.
   *
   * Without vary, N MACs take N loop iterations (each about 12 command round trips);
   * with vary it is ceil(N/256). For N=16384 that is 64 iterations instead of 16384.
   */
  async sendVaryingLearningFrames(senderPortIdx, macCount, destMac, loading) {
    let totalDuration = 0.0;

    for (const [blockIndex, blockCount] of computeMacVaryBlocks(macCount)) {
      // The vendor requires 1 <= limit <= 255. A block with exactly one address would
      // give limit 0 and raise ValueError; such a block needs no vary, so send a plain frame.
      if (blockCount > 1) {
        await this.emitter.configStreamVary(0, 255, 1, 1, blockCount - 1, 1);
      } else {
        await this.emitter.configStreamVary();
      }
      await this.configureStream(
        unicastStream(64, loading, macVaryBlockBaseMac(blockIndex), destMac), senderPortIdx);
      await this.emitter.configTxTxpkts(senderPortIdx, blockCount);
      await this.emitter.configTxIsimmediate(1);
      await this.emitter.transmitPkts(senderPortIdx);
      totalDuration += this.estimateBurstDuration(64, blockCount, loading);
    }

    // reset, or the vary settings leak into the testing phase's set_stream()
    await this.emitter.configStreamVary();
    await this.sleep(totalDuration + this.cfg.learning_settle_time);
  }

  /** Testing phase: auto-increment the **destination** address (DA vary) to check what the DUT remembers. */
  async sendVaryingTestFrames(txPortIdx, macCount, srcMac, framesize, loading) {
    let totalDuration = 0.0;

    for (const [blockIndex, blockCount] of computeMacVaryBlocks(macCount)) {
      if (blockCount > 1) {
        await this.emitter.configStreamVary(1, blockCount - 1, 1);
      } else {
        await this.emitter.configStreamVary();
      }
      await this.configureStream(
        unicastStream(framesize, loading, srcMac, macVaryBlockBaseMac(blockIndex)), txPortIdx);
      await this.emitter.configTxTxpkts(txPortIdx, blockCount);
      await this.emitter.configTxIsimmediate(1);
      await this.emitter.transmitPkts(txPortIdx);
      totalDuration += this.estimateBurstDuration(framesize, blockCount, loading);
    }

    await this.emitter.configStreamVary();
    await this.sleep(totalDuration + this.cfg.counter_settle_time);
  }

  /**
   * config_manual_txrate(2) / ifg / ibg must come **before** configureStream; set
   * afterwards they have no effect on this send and only leak into the next stream.
   * On real hardware the symptom was the following test's tx_packets dropping from
   * 2.97 million to 38. They must be reset to 0 after the loop, or they pollute the
   * real test's stream.
   */
  async sendLearningFrames(senderPortIdx, macList, destMac) {
    const gapBits = this.learningGapBits();

    for (const smac of macList) {
      await this.emitter.configManualTxrate(2);
      await this.emitter.configStreamIfg(gapBits);
      await this.emitter.configStreamIbg(gapBits);
      await this.configureStream(unicastStream(64, 100.0, smac, destMac), senderPortIdx);
      await this.emitter.configTxTxpkts(senderPortIdx, this.cfg.learning_frames);
      await this.emitter.configTxIsimmediate(1);
      await this.emitter.transmitPkts(senderPortIdx);
    }

    await this.emitter.configManualTxrate(0);

    const learningWait =
      macList.length * this.cfg.learning_frames * this.cfg.learning_gap_seconds
      + this.cfg.learning_settle_time;
    await this.sleep(learningWait);
  }

  // --- triggering ---

  async fireTrigger(spec) {
    if (spec.kind === 'ImmediateSingle') {
      await this.emitter.configTxIsimmediate(1);
      await this.emitter.transmitPkts(spec.portIdx);
      return;
    }
    if (spec.kind === 'SynchronizedMulti') {
      // isimmediate(0) makes transmit_pkts arm without sending; each call ORs the
      // port's bit into a connection-wide bitmap, and transmit_pkts_sync starts them all at once.
      await this.emitter.configTxIsimmediate(0);
      for (const portIdx of spec.portIdxs) {
        await this.emitter.transmitPkts(portIdx);
      }
      await this.emitter.transmitPktsSync();
      return;
    }
    throw new ConfigError(`不支援的 trigger 型別:${spec.kind}`);
  }

  // --- line rate ---

  /** Synchronous: reads the cache saved from the begin_test response. */
  mediaSpeedBps() {
    const mediaSpeed = this.emitter.getMediaSpeed(this.txPortIdx);
    const bps = MEDIA_SPEED_BPS[mediaSpeed];
    if (bps === undefined) {
      throw new DeviceError(`不支援的 TX 線速:${mediaSpeed}`);
    }
    return bps;
  }

  /** Python uses int(), which truncates rather than rounds. */
  estimateBurstDuration(framesize, burstFrames, loading = 100.0) {
    let pps = Math.max(1, Math.floor(Math.floor(this.mediaSpeedBps() / 8) / (framesize + 20)));
    pps = Math.max(1, Math.trunc(pps * loading / 100.0));
    return burstFrames / pps;
  }

  // --- counters ---

  /**
   * Port indexes are sorted explicitly before being cleared one by one.
   *
   * Python iterates a set (hash order) while a JS Set keeps insertion order. For
   * small integers they happen to agree, but that cannot be relied on. The golden
   * recordings show ascending order, so sort explicitly.
   */
  _allPortIdxs() {
    const idxs = new Set([this.txPortIdx, this.rxPortIdx]);
    if (this.txPort2Idx !== null) idxs.add(this.txPort2Idx);
    if (this.monitorPortIdx !== null) idxs.add(this.monitorPortIdx);
    for (const list of [this.meshTxPortIdxs, this.meshRxPortIdxs, this.meshPortIdxs]) {
      if (list !== null) for (const i of list) idxs.add(i);
    }
    return [...idxs].sort((a, b) => a - b);
  }

  async clearCounters({ clearStream = false } = {}) {
    for (const portIdx of this._allPortIdxs()) {
      await this.emitter.clearCounterPort(portIdx);
      if (clearStream) await this.emitter.clearCounterStream(portIdx);
    }
    if (this.cfg.counter_clear_wait > 0) {
      await this.sleep(this.cfg.counter_clear_wait);
    }
  }

  async readPortCounters(stream) {
    const rxCounterIdx = stream.kind === 'BroadcastStream'
      ? IDX_PORTCOUNTER_RX_BORADCAST
      : IDX_PORTCOUNTER_RX_UNICAST;

    for (const portIdx of [...new Set([this.txPortIdx, this.rxPortIdx])].sort((a, b) => a - b)) {
      await this.emitter.readCounterPortOnce(portIdx);
    }
    await this.sleep(this.cfg.counter_read_wait);

    return {
      tx_packets: Math.trunc(this.emitter.getCounterPort(this.txPortIdx, IDX_PORTCOUNTER_TX_PKT)),
      rx_packets: Math.trunc(this.emitter.getCounterPort(this.rxPortIdx, rxCounterIdx)),
    };
  }

  async readStreamLatency() {
    await this.emitter.readCounterStreamOnce(this.rxPortIdx);
    return { latency: Number(this.emitter.getCounterStreamRxLatency(this.rxPortIdx, 0)) };
  }

  async readMonitorReceived() {
    await this.emitter.readCounterPortOnce(this.monitorPortIdx);
    await this.sleep(this.cfg.counter_read_wait);
    const received =
      this.emitter.getCounterPort(this.monitorPortIdx, IDX_PORTCOUNTER_RX_UNICAST) > 0;
    return { monitor_received: received };
  }

  // --- helpers ---

  static defaultMac(port) {
    const [cid, bid, pid] = port;
    const hex = n => n.toString(16).toUpperCase().padStart(2, '0');
    return `00:22:A2:${hex(cid)}:${hex(bid)}:${hex(pid)}`;
  }
}
