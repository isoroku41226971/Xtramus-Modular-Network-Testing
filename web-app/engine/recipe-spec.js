/**
 * Spec factories for the five dimensions, the counterpart of
 * ../python-app/nupython_xmnt_recipe_spec.py.
 *
 * kind strings must match the module names in catalog.js (OneToOne.TwoPort,
 * PortCounters, ...), or a module picked from the catalog in the UI would have no
 * factory. A test guards this.
 *
 * Defaults must match Python; a test compares them field by field against the
 * schema recorded from the Python engine.
 *
 * Covers the one-to-one and mesh families. A few Python modules are intentionally
 * not ported.
 */

// --- 1. Topology ---

export function oneToOneTwoPort() {
  return { kind: 'OneToOne.TwoPort' };
}

export function oneToOneThreePortMonitor() {
  return { kind: 'OneToOne.ThreePortMonitor' };
}

/** n sending ports to m receiving ports. Requires cfg.mesh_tx_ports and cfg.mesh_rx_ports. */
export function manyToMany() {
  return { kind: 'ManyToMany' };
}

/** m ports all sending to each other (excluding themselves). Requires cfg.mesh_ports. */
export function fullyMesh() {
  return { kind: 'FullyMesh' };
}

// --- 2. Learning ---

export function noLearningSpec() {
  return { kind: 'NoLearning' };
}

export function addressLearningSpec() {
  return { kind: 'AddressLearning' };
}

/**
 * Aging + hardware-incremented address learning (DA/SA vary), for Address Caching /
 * Address Learning.
 *
 * The two optional fields override target_now in **deliberately opposite** ways:
 *   macCount = null        -> taken from target_now (Address Caching converges on the MAC count)
 *   macCount set           -> target_now ignored (Address Learning has a fixed MAC count)
 *   learningLoading = null -> taken from target_now (Address Learning converges on the learning rate)
 *   learningLoading set    -> fixed value (Address Caching keeps the learning rate constant)
 */
export function varyingAddressAgedLearningSpec({
  agingTime, macCount = null, learningLoading = null,
} = {}) {
  return { kind: 'VaryingAddressAgedLearning', agingTime, macCount, learningLoading };
}

// --- 3. Stream ---

export function unicastStreamSpec({ loading = null } = {}) {
  return { kind: 'Unicast', loading };
}

export function broadcastStreamSpec({ loading = null } = {}) {
  return { kind: 'Broadcast', loading };
}

export function errorSweepStreamSpec({
  errorTypes = ['bad_crc', 'undersize', 'alignment', 'oversize'],
  loading = 10.0,
  undersizeFramesize = 32,
  oversizeFramesize = 2000,
} = {}) {
  return { kind: 'ErrorSweep', errorTypes, loading, undersizeFramesize, oversizeFramesize };
}

export function pressureStreamSpec({ gapBits = 88 } = {}) {
  return { kind: 'Pressure', gapBits };
}

/**
 * A batch of PCAP packets, sent with their raw bytes untouched.
 *
 * `packets` is the `[{ bytes, dmac }, ...]` produced by capture-parser.js. The spec
 * itself has no size limit: above MAX_STREAM_SLOTS, assembleAndRunCustomBatched()
 * splits it into batches, each resolved into a spec holding only that batch.
 *
 * There is no matching Python dataclass: this capability exists only in the web
 * app, so the drift check against the Python schema does not cover it.
 */
export function customStreamSpec({ packets = [] } = {}) {
  return { kind: 'Custom', packets };
}

// --- 4. Trigger ---

export function immediateSingleKind() {
  return { kind: 'ImmediateSingle' };
}

/** Synchronized multi-port trigger. With a single sending port it silently degrades to a normal trigger; a catalog rule blocks that. */
export function synchronizedMultiKind() {
  return { kind: 'SynchronizedMulti' };
}

// --- 5. Reader ---

export function portCountersReaderKind({
  aggregate = 'once',
  perPortDetail = false,
  keepPerStreamResults = false,
  useStreamCounters = false,
} = {}) {
  return { kind: 'PortCounters', aggregate, perPortDetail, keepPerStreamResults, useStreamCounters };
}

export function monitorReceivedReaderKind({ aggregate = 'once' } = {}) {
  return { kind: 'MonitorReceived', aggregate };
}

export function streamLatencyReaderKind() {
  return { kind: 'StreamLatency' };
}

/** Per-pair (sender, receiver) tx/rx matrix. Mesh topologies only. */
export function pairwiseStreamReaderKind() {
  return { kind: 'PairwiseStream' };
}

// --- Bundle ---

export function physicalRecipeSpec({ topology, learning, stream, trigger, reader }) {
  return { topology, learning, stream, trigger, reader };
}
