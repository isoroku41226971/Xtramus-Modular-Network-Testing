/**
 * Connection-layer primitives, the counterparts of the dataclasses in
 * ../python-app/nupython_xmnt.py.
 *
 * They use a kind string rather than class + instanceof, consistent with the
 * algorithm layer's assembly.js: JS has no dataclasses, and classes used only to
 * imitate them add complexity.
 *
 * Field names are camelCase (they stay inside JS and are not compared against the
 * golden recordings), but the set of fields and the positional argument order
 * mirror Python exactly.
 */

export function noLearning() {
  return { kind: 'NoLearning' };
}

export function addressLearning({ senderPortIdx, macList, destMac }) {
  return { kind: 'AddressLearning', senderPortIdx, macList, destMac };
}

export function unicastStream(framesize, loading, smac, dmac) {
  return { kind: 'UnicastStream', framesize, loading, smac, dmac };
}

/** No dmac: the destination is always all ones, filled in by configureStream. */
export function broadcastStream(framesize, loading, smac) {
  return { kind: 'BroadcastStream', framesize, loading, smac };
}

export function errorStream(framesize, loading, smac, dmac, errorType) {
  return { kind: 'ErrorStream', framesize, loading, smac, dmac, errorType };
}

/** No loading: in manual-gap mode the rate is set by ifg/ibg, not by utilization. */
export function pressureStream(framesize, smac, dmac, gapBits) {
  return { kind: 'PressureStream', framesize, smac, dmac, gapBits };
}

/**
 * One sending port transmits to several destinations at once, one stream slot per
 * destination.
 *
 * The name `loadingPerDest` is inherited from Python; it actually means the **total
 * rate of the port**. The vendor SDK's utilization does not add up across slots on
 * the same port: only the last value set counts, and the firmware distributes it
 * round-robin over all destinations. Verified on real hardware: dividing by the
 * number of destinations leaves only 1/N of the traffic. The name is kept so the
 * behavior fix is not mixed with a rename.
 */
export function meshStream(senderMac, destMacs, framesize, loadingPerDest, sidOffset = 0) {
  return { kind: 'MeshStream', senderMac, destMacs, framesize, loadingPerDest, sidOffset };
}

/**
 * One sending port transmits several error types to each of several destinations,
 * one slot per combination.
 *
 * `entries` holds `[destMac, errorType, framesize]` triples; framesize is per entry
 * because undersize/oversize rely on the illegal length itself.
 */
export function meshErrorStream(senderMac, entries, loading, sidOffset = 0) {
  return { kind: 'MeshErrorStream', senderMac, entries, loading, sidOffset };
}

/** Mesh version of above-line-rate pressure. No loading: the rate is set by ifg/ibg. */
export function meshPressureStream(senderMac, destMacs, framesize, gapBits, sidOffset = 0) {
  return { kind: 'MeshPressureStream', senderMac, destMacs, framesize, gapBits, sidOffset };
}

/**
 * A batch of PCAP packets (at most MAX_STREAM_SLOTS), each in its own stream slot (0..N-1).
 *
 * `packets` is `[{ bytes, dmac }, ...]`, the shape produced by capture-parser.js.
 * There is no top-level smac/dmac: UDF payload mode (protocol=0xd) sends the whole
 * captured raw frame, whose source/destination MACs are already in the first
 * 12 bytes, and in this mode the vendor SDK never reads config_stream_smac/dmac.
 */
export function customStream(packets) {
  return { kind: 'CustomStream', packets };
}

export function immediateSingle(portIdx) {
  return { kind: 'ImmediateSingle', portIdx };
}

/** Arm every port first, then fire one global trigger, so that multi-port load is truly simultaneous. */
export function synchronizedMulti(portIdxs) {
  return { kind: 'SynchronizedMulti', portIdxs };
}

/**
 * Aging -> SA vary teaching -> clear counters -> DA vary testing: one object covers
 * the whole cycle.
 *
 * `loading` (testing phase) and `learningLoading` (learning phase) are independent:
 * Address Caching converges on the MAC count with a fixed learning rate, while
 * Address Learning fixes the MAC count and converges on the learning rate. Merging
 * them into one field would break the latter's convergence target.
 */
export function varyingAddressAgedLearning({
  agingTime, senderPortIdx, txPortIdx, macCount,
  destMac, srcMac, framesize, loading, learningLoading,
}) {
  return {
    kind: 'VaryingAddressAgedLearning',
    agingTime, senderPortIdx, txPortIdx, macCount,
    destMac, srcMac, framesize, loading, learningLoading,
  };
}
