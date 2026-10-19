/**
 * Catalog module key -> English label, for the Excel/PDF reports only. The
 * MODULES[dim][key].label values in engine/catalog.js are Chinese and are what the live
 * UI uses; this map is a second set of labels for reports, leaving catalog.js untouched.
 *
 * The keys under each dimension must match engine/catalog.js:MODULES exactly; an
 * exhaustive test catches any that are missing.
 */
const REPORT_LABELS = {
  topology: {
    'OneToOne.TwoPort': 'One-to-One (2 Ports)',
    'OneToOne.ThreePortMonitor': 'One-to-One + Monitor (3 Ports)',
    ManyToMany: 'Many-to-Many',
    FullyMesh: 'Fully Mesh',
  },
  learning: {
    NoLearning: 'No Learning',
    AddressLearning: 'Address Learning',
    VaryingAddressAgedLearning: 'Aged + Varying Address Learning',
  },
  stream: {
    Unicast: 'Unicast',
    Broadcast: 'Broadcast',
    ErrorSweep: 'Error Sweep',
    Pressure: 'Pressure',
    Custom: 'Custom (PCAP Replay)',
  },
  trigger: {
    ImmediateSingle: 'Immediate (Single Port)',
    SynchronizedMulti: 'Synchronized (Multi-Port)',
  },
  reader: {
    PortCounters: 'Port Counters',
    MonitorReceived: 'Monitor Received',
    StreamLatency: 'Stream Latency',
    PairwiseStream: 'Pairwise Stream',
  },
};

export function reportLabel(dim, moduleKey) {
  const label = REPORT_LABELS[dim]?.[moduleKey];
  if (label == null) {
    throw new Error(`沒有 ${dim}/${moduleKey} 的英文報表標籤——`
      + `engine/catalog.js 新增模組時,ui/report-labels.js 要跟著補上對應項目。`);
  }
  return label;
}
