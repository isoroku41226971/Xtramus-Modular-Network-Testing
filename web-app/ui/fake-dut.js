/**
 * Simulated device for simulation mode.
 *
 * The line-rate conversion uses the same formula as the end-to-end test's fake
 * counters, so simulated numbers can be cross-checked against the golden recordings.
 *
 * The two signatures must not be mixed:
 *   convergence -> testFn(cfg, framesize, targetNow)
 *   single / measurement -> testFn(cfg, framesize)
 */

import { MESH_TOPOLOGIES } from '../engine/catalog.js';

const readersOf = r => (Array.isArray(r) ? r : [r]);

function counters(framesize, loading, durationSeconds, limit, mediaSpeedBps) {
  const bytePerSec = Math.floor(mediaSpeedBps / 8);
  const ppsFull = Math.floor(bytePerSec / (framesize + 20));
  const tx = Math.floor(ppsFull * loading / 100) * durationSeconds;
  const rx = loading <= limit ? tx : Math.floor(tx * limit / loading);
  return { tx_packets: tx, rx_packets: rx };
}

/** undersize/oversize use their own framesizes and the other error types use the swept
 *  base framesize, the same rule as the hardware path engine/recipe-assembly.js:errorFramesize(). */
function errorStreamFramesize(item, errorType, framesize) {
  if (errorType === 'undersize') return item.params?.stream?.undersize_framesize ?? 32;
  if (errorType === 'oversize') return item.params?.stream?.oversize_framesize ?? 2000;
  return framesize;
}

/** Each pair gets a small deterministic variation from its sender/receiver port indexes
 *  (not random: rerunning the same parameters must give the same result). Previously
 *  every pair used the same counters() output, so every cell of a simulated mesh result
 *  was identical and did not look like a real measurement. The amplitude is kept within
 *  ±0.4%, so with loading well below the limit every pair still has exactly zero loss
 *  (such a small perturbation cannot push counters()'s rx=tx check over the threshold). */
function meshJitter(a, b) {
  return 1 + ((a * 7 + b * 3) % 5) / 1000;
}

function meshMatrix(ports, framesize, loading, duration, limit, bps) {
  const list = (ports ?? []).map((_, i) => 40 + i);
  const matrix = {};
  for (const a of list) {
    for (const b of list) {
      if (a !== b) matrix[`${a}->${b}`] = counters(framesize, loading * meshJitter(a, b), duration, limit, bps);
    }
  }
  return matrix;
}

/** Whether the topology is a mesh (FullyMesh/ManyToMany). This is decided by
 *  item.recipe.topology itself, not by whether item.ports has mesh_ports/mesh_rx_ports:
 *  the editor and test fixtures may carry every port field regardless of topology (to
 *  make switching easy), so topology is the only reliable source, the same criterion
 *  engine/catalog.js:MESH_TOPOLOGIES uses for reader/topology compatibility. The
 *  StreamLatency branch depends on this signal: whether the reader is PairwiseStream or
 *  StreamLatency only decides whether each cell holds tx/rx or latency; whether there is
 *  a matrix at all is always decided by the topology. */
function isMeshTopology(item) {
  return MESH_TOPOLOGIES.has(item.recipe.topology);
}

function meshPortsOf(item) {
  return item.ports?.mesh_ports ?? item.ports?.mesh_rx_ports ?? null;
}

function meshLatencyMatrix(ports, framesize, latencyBase) {
  const list = (ports ?? []).map((_, i) => 40 + i);
  const matrix = {};
  for (const a of list) {
    for (const b of list) {
      if (a !== b) matrix[`${a}->${b}`] = { latency: (latencyBase + framesize * 0.2) * meshJitter(a, b) };
    }
  }
  return matrix;
}

// Defaults to 0: the test suite and other default callers should be fast and not
// actually wait. Only ui/runner.js passes a non-zero value when driving the real UI, so
// the queue's progress bar has something to show instead of jumping to 100%.
const sleep = seconds => new Promise(r => setTimeout(r, seconds * 1000));

export function makeFakeTestFn(item, {
  throughputLimit = 90,
  mediaSpeedBps = 1_000_000_000,
  latencyBase = 100,
  resultDelaySeconds = 0,
} = {}) {
  const { kind } = item.shape;
  const readers = readersOf(item.recipe.reader);
  const duration = item.cfg?.tx_duration_time ?? 2;

  const build = (framesize, loading, errorTypes) => {
    const out = {};

    if (readers.includes('PairwiseStream')) {
      out.pairwise_matrix = meshMatrix(
        meshPortsOf(item), framesize, loading, duration, throughputLimit, mediaSpeedBps);
    }
    if (readers.includes('PortCounters')) {
      Object.assign(out, counters(framesize, loading, duration, throughputLimit, mediaSpeedBps));
      // Error Filtering: the fake DUT drops every errored frame and reports tx/rx per
      // error type. checkRxZeroWithFullDetail needs per_stream_results to build the
      // per_type detail; otherwise the UI would show "0 error types" and an empty table.
      if (item.recipe.stream === 'ErrorSweep') {
        out.rx_packets = 0;
        out.per_stream_results = (errorTypes ?? []).map(errorType => ({
          tx_packets: counters(
            errorStreamFramesize(item, errorType, framesize),
            loading, duration, throughputLimit, mediaSpeedBps).tx_packets,
          rx_packets: 0,
        }));
      }
      // Custom packets: the generic loading % conversion is meaningless for PCAP replay;
      // the number sent is the packet count in the file, not derived from line rate.
      // A healthy DUT is expected to forward all of them.
      if (item.recipe.stream === 'Custom') {
        const n = item.params?.stream?.pcap_file?.packets?.length ?? 0;
        out.tx_packets = n;
        out.expected_packets = n;
        out.rx_packets = n;
      }
    }
    if (readers.includes('MonitorReceived')) {
      out.monitor_received = false;          // no flooding, i.e. monitor_overflows=False
    }
    if (readers.includes('StreamLatency')) {
      if (isMeshTopology(item)) {
        out.pairwise_latency_matrix = meshLatencyMatrix(meshPortsOf(item), framesize, latencyBase);
      } else {
        out.latency = latencyBase + framesize * 0.2;
      }
    }
    return out;
  };

  if (kind === 'convergence') {
    return async (cfg, framesize, targetNow) => {
      if (resultDelaySeconds > 0) await sleep(resultDelaySeconds);
      return build(framesize, targetNow, cfg.error_types);
    };
  }
  // single / measurement have no targetNow, so use the stream's fixed loading
  const fixed = item.params?.stream?.loading ?? 100;
  return async (cfg, framesize) => {
    if (resultDelaySeconds > 0) await sleep(resultDelaySeconds);
    return build(framesize, fixed, cfg.error_types);
  };
}
