import { ConfigError } from './errors.js';
import { Backend } from './backend.js';
import {
  IDX_PORTCOUNTER_TX_PKT, IDX_PORTCOUNTER_RX_UNICAST, IDX_PORTCOUNTER_RX_BORADCAST,
} from './nuconst.js';
import {
  noLearning, addressLearning, unicastStream, broadcastStream,
  errorStream, pressureStream, immediateSingle, meshStream,
  varyingAddressAgedLearning, meshErrorStream, meshPressureStream,
  customStream,
} from './primitives.js';

/**
 * Recipe resolution and assembly, the counterpart of
 * ../python-app/nupython_xmnt_recipe_assembly.py.
 *
 * Covers the one-to-one family (TwoPort / ThreePortMonitor) and the mesh family
 * (ManyToMany / FullyMesh), including mesh error sweeps, mesh pressure and the mesh
 * latency matrix.
 *
 * "Is this a mesh?" is always decided by `'rxPorts' in ports`, as in Python. Never
 * use cfg's mesh fields instead: Congestion Control has mesh fields but uses the
 * aggregate view, so a cfg check would misclassify it.
 *
 * Unsupported combinations throw explicitly instead of silently taking the wrong branch.
 */

const MAX_STREAM_SLOTS = 64;

/** Fixed load for the testing phase (DA vary). Whether the convergence target is the
 *  MAC count or the learning rate, the testing phase uses the same conservative value
 *  so the two don't interfere. */
const VARYING_ADDRESS_CACHING_TEST_LOADING = 10.0;

/** The vendor's get_counter_stream_rx_pkts supports only sidx<64; higher slots cannot be read. */
function assertSlotBudget(used, what) {
  if (used > MAX_STREAM_SLOTS) {
    throw new ConfigError(
      `${what} 需要 ${used} 個 stream slot,超過 vendor SDK 上限 ${MAX_STREAM_SLOTS}`
      + '(get_counter_stream_rx_pkts 只支援 sidx<64)');
  }
}

const NOT_PORTED = what => new ConfigError(
  `${what} 尚未移植到 JS —— 沒有黃金檔可對照就沒有驗證基礎。`
  + '請先在 recorder/recipes/ 加一支配方錄黃金檔,再移植這條路徑。');

// --- port resolution ---

export function resolveTopologyPorts(topology, backend) {
  if (topology.kind === 'OneToOne.TwoPort') {
    return { txPorts: [backend.txPortIdx], rxPort: backend.rxPortIdx, monitorPort: null };
  }
  if (topology.kind === 'OneToOne.ThreePortMonitor') {
    return {
      txPorts: [backend.txPortIdx],
      rxPort: backend.rxPortIdx,
      monitorPort: backend.monitorPortIdx,
    };
  }
  if (topology.kind === 'ManyToMany') {
    if (backend.meshTxPortIdxs === null || backend.meshRxPortIdxs === null) {
      throw new ConfigError('ManyToMany 需要 cfg.mesh_tx_ports 與 cfg.mesh_rx_ports');
    }
    return { txPorts: backend.meshTxPortIdxs, rxPorts: backend.meshRxPortIdxs };
  }
  if (topology.kind === 'FullyMesh') {
    if (backend.meshPortIdxs === null) {
      throw new ConfigError('FullyMesh 需要 cfg.mesh_ports');
    }
    // the same ports both send and receive; each stream excludes its own port
    return { txPorts: backend.meshPortIdxs, rxPorts: backend.meshPortIdxs };
  }
  throw new ConfigError(`不支援的 topology 型別:${topology.kind}`);
}

/** Whether these ports were resolved from a mesh-family topology. */
export function isMesh(ports) {
  return 'rxPorts' in ports;
}

// --- MAC resolution ---

export function generateSyntheticMacs(count) {
  const hex = n => n.toString(16).toUpperCase().padStart(2, '0');
  return Array.from({ length: count }, (_, i) =>
    `02:00:00:${hex((i >> 16) & 0xFF)}:${hex((i >> 8) & 0xFF)}:${hex(i & 0xFF)}`);
}

export function txMacForPosition(backend, position) {
  if (position === 0) return Backend.defaultMac(backend.cfg.tx_port);
  if (position === 1) return Backend.defaultMac(backend.cfg.tx_port2);
  throw new ConfigError(`不支援的 tx 埠位置:${position}`);
}

/**
 * Pair cfg's list of port tuples with the port indexes resolved by open(), by
 * position, and compute each port index's default MAC. Both lists are guaranteed
 * to be in the same order.
 */
export function meshPortMacs(backend, portTuples, portIdxs) {
  return portIdxs.map((portIdx, i) => [portIdx, Backend.defaultMac(portTuples[i])]);
}

/** Where mesh tx/rx ports come from: ManyToMany has one list each, FullyMesh shares one list. */
function meshTxTuples(backend) {
  return backend.cfg.mesh_tx_ports ?? backend.cfg.mesh_ports;
}

function meshRxTuples(backend) {
  return backend.cfg.mesh_rx_ports ?? backend.cfg.mesh_ports;
}

export function firstTxMac(backend, ports = null) {
  // in a mesh, cfg.tx_port must not be used directly; it may be an unrelated port
  if (ports !== null && isMesh(ports)) {
    return meshPortMacs(backend, meshTxTuples(backend), ports.txPorts)[0][1];
  }
  return txMacForPosition(backend, 0);
}

// --- stream resolution ---

export function resolveLoading(streamSpec, targetNow) {
  if (targetNow !== null && targetNow !== undefined) return targetNow;
  if (streamSpec.loading === null || streamSpec.loading === undefined) {
    throw new ConfigError(
      `${streamSpec.kind} 在沒有 target_now 時必須提供固定的 loading`);
  }
  return streamSpec.loading;
}

/** undersize/oversize rely on the illegal length itself, so they carry their own framesize. */
function errorFramesize(streamSpec, errorType, framesize) {
  if (errorType === 'undersize') return streamSpec.undersizeFramesize;
  if (errorType === 'oversize') return streamSpec.oversizeFramesize;
  return framesize;
}

export function resolveStreams(streamSpec, backend, ports, targetNow, framesize) {
  const txPorts = ports.txPorts;

  if (isMesh(ports)) {
    const txMacs = meshPortMacs(backend, meshTxTuples(backend), ports.txPorts);

    if (streamSpec.kind === 'Broadcast') {
      const loading = resolveLoading(streamSpec, targetNow);
      return txMacs.map(([txPortIdx, txMac]) =>
        [txPortIdx, broadcastStream(framesize, loading, txMac)]);
    }

    // in FullyMesh, tx and rx are the same ports, so every stream excludes its own port
    const rxMacs = meshPortMacs(backend, meshRxTuples(backend), ports.rxPorts);
    const destsFor = txPortIdx =>
      rxMacs.filter(([portIdx]) => portIdx !== txPortIdx).map(([, mac]) => mac);

    const result = [];
    let sidOffset = 0;

    if (streamSpec.kind === 'Unicast') {
      const loading = resolveLoading(streamSpec, targetNow);
      for (const [txPortIdx, txMac] of txMacs) {
        const destMacs = destsFor(txPortIdx);
        result.push([txPortIdx, meshStream(txMac, destMacs, framesize, loading, sidOffset)]);
        sidOffset += destMacs.length;
      }
      assertSlotBudget(sidOffset, 'ManyToMany/FullyMesh');
      return result;
    }

    if (streamSpec.kind === 'ErrorSweep') {
      for (const [txPortIdx, txMac] of txMacs) {
        // ordered by destination first, then error type
        const entries = [];
        for (const destMac of destsFor(txPortIdx)) {
          for (const errorType of streamSpec.errorTypes) {
            entries.push([destMac, errorType, errorFramesize(streamSpec, errorType, framesize)]);
          }
        }
        result.push([txPortIdx, meshErrorStream(txMac, entries, streamSpec.loading, sidOffset)]);
        sidOffset += entries.length;
      }
      assertSlotBudget(sidOffset, 'ManyToMany/FullyMesh Error Filtering');
      return result;
    }

    if (streamSpec.kind === 'Pressure') {
      for (const [txPortIdx, txMac] of txMacs) {
        const destMacs = destsFor(txPortIdx);
        result.push([txPortIdx,
          meshPressureStream(txMac, destMacs, framesize, streamSpec.gapBits, sidOffset)]);
        sidOffset += destMacs.length;
      }
      assertSlotBudget(sidOffset, 'ManyToMany/FullyMesh Forwarding Pressure');
      return result;
    }

    throw new ConfigError(`mesh 不支援的 stream spec 型別:${streamSpec.kind}`);
  }

  if (streamSpec.kind === 'Unicast') {
    const loading = resolveLoading(streamSpec, targetNow);
    const rxMac = Backend.defaultMac(backend.cfg.rx_port);
    return txPorts.map((txPortIdx, position) =>
      [txPortIdx, unicastStream(framesize, loading, txMacForPosition(backend, position), rxMac)]);
  }

  if (streamSpec.kind === 'Broadcast') {
    const loading = resolveLoading(streamSpec, targetNow);
    return txPorts.map((txPortIdx, position) =>
      [txPortIdx, broadcastStream(framesize, loading, txMacForPosition(backend, position))]);
  }

  if (streamSpec.kind === 'ErrorSweep') {
    const txPortIdx = txPorts[0];
    const txMac = txMacForPosition(backend, 0);
    const rxMac = Backend.defaultMac(backend.cfg.rx_port);
    return streamSpec.errorTypes.map(errorType => [
      txPortIdx,
      errorStream(errorFramesize(streamSpec, errorType, framesize),
        streamSpec.loading, txMac, rxMac, errorType),
    ]);
  }

  if (streamSpec.kind === 'Pressure') {
    const txPortIdx = txPorts[0];
    const txMac = txMacForPosition(backend, 0);
    const rxMac = Backend.defaultMac(backend.cfg.rx_port);
    return [[txPortIdx, pressureStream(framesize, txMac, rxMac, streamSpec.gapBits)]];
  }

  if (streamSpec.kind === 'Custom') {
    // The whole batch yields **one** tuple. With one tuple per packet, fireAndRead
    // would take the "several streams on one port" aggregate:'sum' path that
    // triggers each one separately and waits a full send/receive cycle per packet.
    // A single tuple takes the MeshStream-style path instead: fill N slots, trigger
    // once, read once.
    //
    // no smac/dmac: they are in the raw bytes, and protocol=0xd never reads them anyway.
    return [[txPorts[0], customStream(streamSpec.packets)]];
  }

  throw new ConfigError(`不支援的 stream spec 型別:${streamSpec.kind}`);
}

// --- learning resolution ---

export function collectTargetMacs(streams) {
  // order-preserving dedup, like dict.fromkeys
  const macs = new Set();
  for (const [, s] of streams) {
    // A CustomStream has one destination MAC per entry in packets and no top-level
    // dmac. Without this branch the learning list for PCAP replay would be empty and
    // the DUT would learn no MACs at all.
    if (s.kind === 'CustomStream') {
      for (const pkt of s.packets) macs.add(pkt.dmac);
    } else if ('dmac' in s) {
      macs.add(s.dmac);
    }
  }
  return [...macs];
}

export function resolveLearning(learningSpec, backend, ports, streams) {
  if (learningSpec.kind === 'NoLearning') return noLearning();

  if (isMesh(ports) && learningSpec.kind === 'AddressLearning') {
    // Each receiving port sends one learning frame so the DUT learns its MAC.
    // Any tx MAC works as the destination; what matters is that the source is learned.
    const arbitraryDestMac = meshPortMacs(backend, meshTxTuples(backend), ports.txPorts)[0][1];
    return meshPortMacs(backend, meshRxTuples(backend), ports.rxPorts)
      .map(([rxPortIdx, rxMac]) => addressLearning({
        senderPortIdx: rxPortIdx, macList: [rxMac], destMac: arbitraryDestMac,
      }));
  }

  if (learningSpec.kind === 'AddressLearning') {
    return addressLearning({
      senderPortIdx: ports.rxPort,
      macList: collectTargetMacs(streams),
      destMac: txMacForPosition(backend, 0),
    });
  }

  throw new ConfigError(`不支援的 learning spec 型別:${learningSpec.kind}`);
}

// --- reading ---

export function readerKinds(readerKind) {
  return Array.isArray(readerKind) ? readerKind : [readerKind];
}

/**
 * Build the "mesh receiving-port MAC -> port index" map and **explicitly ask the
 * chassis to report fresh stream counters**. Without that step the previous round's
 * stale data is read with no error at all; this was found to be required on real
 * hardware.
 */
export async function meshReceiverLookup(backend, ports) {
  const rxMacs = meshPortMacs(backend, meshRxTuples(backend), ports.rxPorts);

  // Python iterates set(tx)|set(rx) (hash order) and a JS Set keeps insertion order;
  // sort explicitly rather than rely on them happening to agree for small integers
  const all = [...new Set([...ports.txPorts, ...ports.rxPorts])].sort((a, b) => a - b);
  for (const portIdx of all) await backend.emitter.readCounterStreamOnce(portIdx);

  return Object.fromEntries(rxMacs.map(([portIdx, mac]) => [mac, portIdx]));
}

/** Key format for per-pair matrices, the same as the recorder's "->".join(...) in _jsonable(). */
const pairKey = (...parts) => parts.join('->');

export async function read(readerKind, backend, ports, streams = null) {
  if (Array.isArray(readerKind)) {
    const merged = {};
    for (const subKind of readerKind) {
      Object.assign(merged, await read(subKind, backend, ports, streams));
    }
    return merged;
  }

  if (readerKind.kind === 'PortCounters') {
    const rxPortList = ports.rxPorts ?? [ports.rxPort];
    let txByPort = {};
    let rxByPort = {};

    if (readerKind.useStreamCounters) {
      const all = [...new Set([...ports.txPorts, ...rxPortList])].sort((a, b) => a - b);
      for (const portIdx of all) await backend.emitter.readCounterStreamOnce(portIdx);
      for (const portIdx of ports.txPorts) {
        txByPort[portIdx] = Math.trunc(backend.emitter.getCounterStreamTxPkts(portIdx, 0));
      }
      for (const portIdx of rxPortList) {
        rxByPort[portIdx] = Math.trunc(backend.emitter.getCounterStreamRxPkts(portIdx, 0));
      }
    } else {
      for (const portIdx of ports.txPorts) await backend.emitter.readCounterPortOnce(portIdx);
      for (const portIdx of rxPortList) await backend.emitter.readCounterPortOnce(portIdx);
      await backend.sleep(backend.cfg.counter_read_wait);

      for (const portIdx of ports.txPorts) {
        txByPort[portIdx] = Math.trunc(
          backend.emitter.getCounterPort(portIdx, IDX_PORTCOUNTER_TX_PKT));
      }
      // broadcast frames are not counted by the unicast counter; switch on the actual stream type
      const isBroadcast = Boolean(streams?.length) && streams[0][1].kind === 'BroadcastStream';
      const rxIdx = isBroadcast ? IDX_PORTCOUNTER_RX_BORADCAST : IDX_PORTCOUNTER_RX_UNICAST;
      for (const portIdx of rxPortList) {
        rxByPort[portIdx] = Math.trunc(backend.emitter.getCounterPort(portIdx, rxIdx));
      }
    }

    const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
    const result = { tx_packets: sum(txByPort), rx_packets: sum(rxByPort) };
    if (readerKind.perPortDetail) {
      result.tx_packets_by_port = txByPort;
      result.rx_packets_by_port = rxByPort;
    }
    return result;
  }

  if (readerKind.kind === 'MonitorReceived') {
    return backend.readMonitorReceived();
  }

  if (readerKind.kind === 'StreamLatency') {
    if (!isMesh(ports)) return backend.readStreamLatency();

    const macToPortIdx = await meshReceiverLookup(backend, ports);
    const matrix = {};
    for (const [txPortIdx, meshObj] of streams) {
      if (meshObj.kind !== 'MeshStream') {
        throw new ConfigError(
          `mesh 的 StreamLatency 只支援 MeshStream(來自 Unicast/Broadcast),`
          + `收到 ${meshObj.kind} —— 錯誤注入與施壓的 stream 沒有「延遲」可言`);
      }
      for (const [localIdx, destMac] of meshObj.destMacs.entries()) {
        const receiverPortIdx = macToPortIdx[destMac];
        matrix[pairKey(txPortIdx, receiverPortIdx)] = {
          latency: Number(backend.emitter.getCounterStreamRxLatency(
            receiverPortIdx, meshObj.sidOffset + localIdx)),
        };
      }
    }
    return { pairwise_latency_matrix: matrix };
  }

  if (readerKind.kind === 'PairwiseStream') {
    const macToPortIdx = await meshReceiverLookup(backend, ports);
    const matrix = {};
    let isErrorMatrix = false;

    // tx reads the sender's slot, rx reads the **same** slot on the receiver
    const cell = (txPortIdx, receiverPortIdx, sid) => ({
      tx_packets: Math.trunc(backend.emitter.getCounterStreamTxPkts(txPortIdx, sid)),
      rx_packets: Math.trunc(backend.emitter.getCounterStreamRxPkts(receiverPortIdx, sid)),
    });

    for (const [txPortIdx, meshObj] of streams) {
      if (meshObj.kind === 'MeshErrorStream') {
        isErrorMatrix = true;
        for (const [localIdx, [destMac, errorType]] of meshObj.entries.entries()) {
          const receiverPortIdx = macToPortIdx[destMac];
          matrix[pairKey(txPortIdx, receiverPortIdx, errorType)] =
            cell(txPortIdx, receiverPortIdx, meshObj.sidOffset + localIdx);
        }
      } else if (meshObj.kind === 'MeshStream') {
        for (const [localIdx, destMac] of meshObj.destMacs.entries()) {
          const receiverPortIdx = macToPortIdx[destMac];
          matrix[pairKey(txPortIdx, receiverPortIdx)] =
            cell(txPortIdx, receiverPortIdx, meshObj.sidOffset + localIdx);
        }
      } else {
        throw new ConfigError(`逐對讀取不支援 ${meshObj.kind}`);
      }
    }
    return isErrorMatrix ? { pairwise_error_matrix: matrix } : { pairwise_matrix: matrix };
  }

  throw new ConfigError(`不支援的 reader 型別:${readerKind.kind}`);
}

// --- transmit mode ---

export function pressureBurstFrames(backend, framesize, gapBits) {
  const speedBps = backend.mediaSpeedBps();
  const bitsPerSlot = (framesize + 8) * 8 + gapBits;
  const pps = speedBps / bitsPerSlot;
  return Math.max(1, Math.trunc(pps * backend.cfg.tx_duration_time));
}

export async function configureTxModeAndGetDuration(backend, portIdx, framesize, streamObj) {
  if (streamObj.kind === 'PressureStream') {
    const burstFrames = pressureBurstFrames(backend, framesize, streamObj.gapBits);
    await backend.emitter.configTxTxpkts(portIdx, burstFrames);
    return backend.estimateBurstDuration(framesize, burstFrames);
  }

  if (streamObj.kind === 'MeshPressureStream') {
    // The vendor SDK distributes the port's budget round-robin over all slots, so
    // without multiplying by the number of destinations each one gets only 1/N.
    // This compensation was confirmed by measuring the achieved rate on real hardware.
    const perDest = pressureBurstFrames(backend, framesize, streamObj.gapBits);
    const total = perDest * streamObj.destMacs.length;
    await backend.emitter.configTxTxpkts(portIdx, total);
    return backend.estimateBurstDuration(framesize, total);
  }

  if (streamObj.kind === 'CustomStream') {
    // A total equal to the slot count means each slot sends exactly once under the
    // vendor SDK's round-robin. The generic branch derives the total from
    // loading%/tx_burst_frames (designed for slots sharing one target), which does not
    // fit PCAP replay's "send every packet once".
    const n = streamObj.packets.length;
    await backend.emitter.configTxTxpkts(portIdx, n);
    // Estimate the duration from the largest packet in the batch, not the outer
    // framesize (meaningless for Custom): better to wait a bit longer than to read
    // the counters before sending has finished
    const maxBytes = Math.max(...streamObj.packets.map(p => p.bytes.length));
    return backend.estimateBurstDuration(maxBytes, n);
  }

  if (backend.cfg.mode_tx === 0) {
    await backend.emitter.configTxTxtime(portIdx, backend.cfg.tx_duration_time);
    return Number(backend.cfg.tx_duration_time);
  }

  await backend.emitter.configTxTxpkts(portIdx, backend.cfg.tx_burst_frames);
  return backend.estimateBurstDuration(framesize, backend.cfg.tx_burst_frames);
}

// --- triggering and reading ---

export async function fireAndRead(streams, triggerKind, readerKind, backend, ports, framesize) {
  const distinctPorts = [...new Set(streams.map(([portIdx]) => portIdx))];
  const aggregate = readerKind?.aggregate ?? 'once';

  // several streams on one port (ErrorSweep): set up, trigger and read each one, then sum the results
  if (distinctPorts.length === 1 && aggregate === 'sum') {
    const portIdx = distinctPorts[0];
    const useStreamCounters = readerKind?.useStreamCounters ?? false;

    if (useStreamCounters) {
      const rxPortList = ports.rxPorts ?? [ports.rxPort];
      for (const rxPortIdx of rxPortList) {
        if (rxPortIdx !== portIdx) await backend.emitter.setConfigRxstream(rxPortIdx);
      }
    }

    const total = {};
    const perStreamResults = [];

    for (const [, streamObj] of streams) {
      await backend.clearCounters({ clearStream: useStreamCounters });
      await backend.configureStream(streamObj, portIdx);
      const duration = await configureTxModeAndGetDuration(backend, portIdx, framesize, streamObj);
      if (useStreamCounters) await backend.emitter.setConfigRxstream(portIdx);
      await backend.fireTrigger(immediateSingle(portIdx));
      await backend.sleep(duration + backend.cfg.counter_settle_time);

      const partial = await read(readerKind, backend, ports, [[portIdx, streamObj]]);
      perStreamResults.push(partial);
      for (const [key, value] of Object.entries(partial)) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          const merged = total[key] ?? {};
          for (const [subKey, subValue] of Object.entries(value)) {
            merged[subKey] = (merged[subKey] ?? 0) + subValue;
          }
          total[key] = merged;
        } else {
          total[key] = (total[key] ?? 0) + value;
        }
      }
    }

    if (readerKind?.keepPerStreamResults) total.per_stream_results = perStreamResults;
    return total;
  }

  const durations = [];
  const isLatency = readerKinds(readerKind).some(r => r.kind === 'StreamLatency');
  const isPairwise = readerKinds(readerKind).some(r => r.kind === 'PairwiseStream');
  const synchronized = triggerKind.kind === 'SynchronizedMulti' && distinctPorts.length > 1;

  // prerequisite for stream counters to report anything; without it they always read 0, with no error.
  const armRxStreams = async () => {
    if (isLatency) {
      if (isMesh(ports)) {
        for (const rxPortIdx of ports.rxPorts) {
          if (!distinctPorts.includes(rxPortIdx)) await backend.emitter.setConfigRxstream(rxPortIdx);
        }
      } else {
        await backend.emitter.setConfigRxstream(backend.rxPortIdx);
      }
    }
    if (isPairwise) {
      for (const rxPortIdx of ports.rxPorts) {
        if (!distinctPorts.includes(rxPortIdx)) await backend.emitter.setConfigRxstream(rxPortIdx);
      }
    }
  };

  if (synchronized) {
    // isimmediate(0) makes every following transmit_pkts arm without sending; it must
    // be set before the first transmit_pkts, or the first port starts early.
    await backend.emitter.configTxIsimmediate(0);
    for (const [portIdx, streamObj] of streams) {
      await backend.configureStream(streamObj, portIdx);
      durations.push(await configureTxModeAndGetDuration(backend, portIdx, framesize, streamObj));
      if (isPairwise) await backend.emitter.setConfigRxstream(portIdx);
      if (isLatency && isMesh(ports) && ports.rxPorts.includes(portIdx)) {
        await backend.emitter.setConfigRxstream(portIdx);
      }
      await backend.emitter.transmitPkts(portIdx);
    }
    await armRxStreams();
    await backend.emitter.transmitPktsSync();
  } else {
    for (const [portIdx, streamObj] of streams) {
      await backend.configureStream(streamObj, portIdx);
      durations.push(await configureTxModeAndGetDuration(backend, portIdx, framesize, streamObj));
      if (isPairwise) await backend.emitter.setConfigRxstream(portIdx);
      if (isLatency && isMesh(ports) && ports.rxPorts.includes(portIdx)) {
        await backend.emitter.setConfigRxstream(portIdx);
      }
    }
    await armRxStreams();
    for (const [portIdx] of streams) {
      await backend.fireTrigger(immediateSingle(portIdx));
    }
  }

  await backend.sleep(Math.max(...durations) + backend.cfg.counter_settle_time);
  return read(readerKind, backend, ports, streams);
}

// --- top level ---

/**
 * Merge one round's readings into the running total: scalars are added, dicts are
 * added per key, two-level dicts per nested key. Matrix keys include the error type,
 * so the four rounds never overwrite each other.
 */
export function mergeMeshErrorSweepRound(merged, partial) {
  for (const [key, value] of Object.entries(partial)) {
    if (key === 'per_stream_results') continue;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const existing = merged[key] ?? {};
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue !== null && typeof subValue === 'object' && !Array.isArray(subValue)) {
          const nested = existing[subKey] ?? {};
          for (const [nestedKey, nestedValue] of Object.entries(subValue)) {
            nested[nestedKey] = (nested[nestedKey] ?? 0) + nestedValue;
          }
          existing[subKey] = nested;
        } else {
          existing[subKey] = (existing[subKey] ?? 0) + subValue;
        }
      }
      merged[key] = existing;
    } else {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
}

/**
 * Mesh Error Filtering: one error type per round.
 *
 * This is a hardware limitation, not a performance trade-off: `config_stream_adderror`
 * writes **port-wide** state, and the chassis honors only the error type set by the
 * last `set_stream()`. Packing all four types into one synchronized trigger means
 * only one of them actually takes effect (confirmed on real hardware).
 *
 * Learning happens only once: it teaches MACs, which have nothing to do with error types.
 */
export async function assembleAndRunMeshErrorSweep(spec, backend, ports, framesize) {
  const learning = resolveLearning(spec.learning, backend, ports, []);
  for (const single of Array.isArray(learning) ? learning : [learning]) {
    await backend.applyLearning(single);
  }

  const clearStream = readerKinds(spec.reader)
    .some(r => r.kind === 'StreamLatency' || r.kind === 'PairwiseStream');
  const keepPerStream = spec.reader?.keepPerStreamResults ?? false;
  const perStreamResults = [];
  const merged = {};

  for (const errorType of spec.stream.errorTypes) {
    const singleTypeSpec = { ...spec.stream, errorTypes: [errorType] };
    const streams = resolveStreams(singleTypeSpec, backend, ports, null, framesize);
    await backend.clearCounters({ clearStream });
    const partial = await fireAndRead(
      streams, spec.trigger, spec.reader, backend, ports, framesize);
    if (keepPerStream) {
      const { per_stream_results: _ignored, ...rest } = partial;
      perStreamResults.push(rest);
    }
    mergeMeshErrorSweepRound(merged, partial);
  }

  if (keepPerStream) merged.per_stream_results = perStreamResults;
  return merged;
}

export async function assembleAndRun(spec, backend, framesize, targetNow = null) {
  const ports = resolveTopologyPorts(spec.topology, backend);

  if (!isMesh(ports) && readerKinds(spec.reader).some(r => r.kind === 'PairwiseStream')) {
    throw new ConfigError(
      `PairwiseStream reader 需要 mesh 拓樸(ManyToMany/FullyMesh),收到 ${spec.topology.kind}`);
  }
  if (isMesh(ports) && spec.stream.kind === 'ErrorSweep' && spec.stream.errorTypes.length > 1) {
    return assembleAndRunMeshErrorSweep(spec, backend, ports, framesize);
  }

  const streams = resolveStreams(spec.stream, backend, ports, targetNow, framesize);
  const learning = resolveLearning(spec.learning, backend, ports, streams);

  // mesh learning is a list (one per receiving port); one-to-one learning is a single object
  for (const single of Array.isArray(learning) ? learning : [learning]) {
    await backend.applyLearning(single);
  }

  const clearStream = readerKinds(spec.reader)
    .some(r => r.kind === 'StreamLatency' || r.kind === 'PairwiseStream');
  await backend.clearCounters({ clearStream });

  return fireAndRead(streams, spec.trigger, spec.reader, backend, ports, framesize);
}

/**
 * Dedicated assembly path for Address Caching / Address Learning.
 *
 * It bypasses assembleAndRun because that path has the shape "resolve stream ->
 * learning -> trigger -> read", whereas here the whole "teach + age + test" cycle
 * lives inside the learning object, and the spec's stream / trigger dimensions are
 * unused (the recipe holds placeholders).
 */
export async function assembleAndRunVaryingAddressCaching(spec, backend, framesize, targetNow = null) {
  const ports = resolveTopologyPorts(spec.topology, backend);
  const learningSpec = spec.learning;

  // The two fields take priority in deliberately opposite ways:
  //   macCount unset        -> taken from targetNow (Address Caching converges on the MAC count)
  //   learningLoading unset -> taken from targetNow (Address Learning converges on the learning rate)
  const macCount = learningSpec.macCount ?? Math.max(1, Math.trunc(targetNow));
  const learningLoading = learningSpec.learningLoading ?? targetNow;
  const txMac = Backend.defaultMac(backend.cfg.tx_port);

  await backend.applyLearning(varyingAddressAgedLearning({
    agingTime: learningSpec.agingTime,
    senderPortIdx: ports.rxPort,
    txPortIdx: ports.txPorts[0],
    macCount,
    destMac: txMac,
    srcMac: txMac,
    framesize,
    loading: VARYING_ADDRESS_CACHING_TEST_LOADING,
    learningLoading,
  }));

  return read(spec.reader, backend, ports);
}

/**
 * Dedicated assembly path for batched PCAP replay.
 *
 * It bypasses assembleAndRun() because that path handles one batch at a time
 * (limited by MAX_STREAM_SLOTS, throwing above it), while a PCAP file can hold any
 * number of packets. This path splits it into batches, runs the full "learning ->
 * clear counters -> trigger -> read" cycle per batch, and combines the results.
 *
 * Its structure mirrors assembleAndRunMeshErrorSweep(), but it **cannot** reuse
 * mergeMeshErrorSweepRound(): that function adds every field numerically, and
 * monitor_received is a boolean, so true+true would become the number 2.
 */
export async function assembleAndRunCustomBatched(spec, backend, framesize) {
  const ports = resolveTopologyPorts(spec.topology, backend);
  const packets = spec.stream.packets;
  const merged = { tx_packets: 0, expected_packets: 0, monitor_received: false };

  for (let i = 0; i < packets.length; i += MAX_STREAM_SLOTS) {
    const batchPackets = packets.slice(i, i + MAX_STREAM_SLOTS);
    const batchSpec = { ...spec.stream, packets: batchPackets };
    const streams = resolveStreams(batchSpec, backend, ports, null, framesize);

    const learning = resolveLearning(spec.learning, backend, ports, streams);
    for (const single of Array.isArray(learning) ? learning : [learning]) {
      await backend.applyLearning(single);
    }

    const clearStream = readerKinds(spec.reader)
      .some(r => r.kind === 'StreamLatency' || r.kind === 'PairwiseStream');
    await backend.clearCounters({ clearStream });

    const partial = await fireAndRead(
      streams, spec.trigger, spec.reader, backend, ports, framesize);

    merged.tx_packets += partial.tx_packets;
    merged.expected_packets += batchPackets.length;
    merged.monitor_received = merged.monitor_received || partial.monitor_received;
  }

  return merged;
}

// --- bridges to the algorithm layer ---

export function makeConvergenceTestFn(recipeSpec) {
  const executor = recipeSpec.learning.kind === 'VaryingAddressAgedLearning'
    ? assembleAndRunVaryingAddressCaching
    : assembleAndRun;

  return async (cfg, framesize, targetNow, backend = null, fakeResultFn = null) => {
    if (!cfg.simulate) {
      if (backend === null) throw new ConfigError('真機模式需要 backend');
      return executor(recipeSpec, backend, framesize, targetNow);
    }
    if (fakeResultFn === null) throw new ConfigError('模擬模式需要 fakeResultFn');
    return fakeResultFn(cfg, framesize, targetNow);
  };
}

export function makeSingleTestFn(recipeSpec) {
  return async (cfg, framesize, backend = null, fakeResultFn = null) => {
    if (!cfg.simulate) {
      if (backend === null) throw new ConfigError('真機模式需要 backend');
      return assembleAndRun(recipeSpec, backend, framesize, null);
    }
    if (fakeResultFn === null) throw new ConfigError('模擬模式需要 fakeResultFn');
    return fakeResultFn(cfg, framesize);
  };
}

/** Pure send (PCAP replay). Same signature as makeSingleTestFn; both are used by runSingleTest. */
export function makePureSendTestFn(recipeSpec) {
  return async (cfg, framesize, backend = null, fakeResultFn = null) => {
    if (!cfg.simulate) {
      if (backend === null) throw new ConfigError('真機模式需要 backend');
      return assembleAndRunCustomBatched(recipeSpec, backend, framesize);
    }
    if (fakeResultFn === null) throw new ConfigError('模擬模式需要 fakeResultFn');
    return fakeResultFn(cfg, framesize);
  };
}
