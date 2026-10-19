/**
 * XMNT module catalog: the single source of truth shared by the UI and the engine.
 *
 * Three parts:
 *   MODULES  module definitions and parameter schemas for the five dimensions
 *   PRESETS  11 preset recipes (10 matching the hardware scripts, plus PCAP replay)
 *   RULES    compatibility rules that turn the pitfalls documented in
 *            python-app/README.md into states the UI cannot enter
 *
 * Parameter defaults come from python-app/nupython_xmnt_recipe_spec.py. A drift
 * test compares them field by field against a schema recorded from the Python
 * engine, so a renamed field or changed default on either side is caught.
 */

export const DIMENSIONS = ['topology', 'learning', 'stream', 'trigger', 'reader'];

export const MODULES = {
  topology: {
    'OneToOne.TwoPort': {
      label: '一對一(2 埠)',
      ports: ['tx_port', 'rx_port'],
      params: {},
    },
    'OneToOne.ThreePortMonitor': {
      label: '一對一 + Monitor(3 埠)',
      ports: ['tx_port', 'rx_port', 'monitor_port'],
      params: {},
    },
    ManyToMany: {
      label: '多對多',
      ports: ['mesh_tx_ports', 'mesh_rx_ports'],
      params: {},
    },
    FullyMesh: {
      label: '全網狀',
      ports: ['mesh_ports'],
      params: {},
    },
  },

  learning: {
    NoLearning: {
      label: '不學習',
      params: {},
    },
    AddressLearning: {
      label: '位址學習',
      params: {},
    },
    VaryingAddressAgedLearning: {
      label: '老化 + 遞增位址學習',
      params: {
        aging_time: {
          type: 'number', default: 300.0, min: 0, unit: '秒',
          note: 'DUT 的 MAC 老化時間。NuPython 無法遠端設定 DUT,這裡只是等待。',
        },
        mac_count: {
          type: 'int', default: null, nullable: true, min: 1,
          note: 'null 代表由收斂目標 target_now 提供(Address Caching);'
              + '填固定值則忽略 target_now(Address Learning)。',
        },
        learning_loading: {
          type: 'number', default: null, nullable: true, min: 0.01, max: 100, unit: '%',
        },
      },
    },
  },

  stream: {
    Unicast: {
      label: '單播',
      params: {
        loading: { type: 'number', default: null, nullable: true, min: 0.01, max: 100, unit: '%' },
      },
    },
    Broadcast: {
      label: '廣播',
      params: {
        loading: { type: 'number', default: null, nullable: true, min: 0.01, max: 100, unit: '%' },
      },
    },
    ErrorSweep: {
      label: '錯誤封包掃描',
      params: {
        error_types: {
          type: 'multi-enum',
          options: ['bad_crc', 'undersize', 'alignment', 'oversize'],
          default: ['bad_crc', 'undersize', 'alignment', 'oversize'],
          note: 'oversize 會讓 DUT 轉發大量真實流量、拖累下一輪,必須排最後。',
        },
        loading: { type: 'number', default: 10.0, min: 0.01, max: 100, unit: '%' },
        undersize_framesize: { type: 'int', default: 32, max: 63 },
        oversize_framesize: { type: 'int', default: 2000, min: 1519 },
      },
    },
    Pressure: {
      label: '超載壓力',
      params: {
        gap_bits: {
          type: 'int', default: 88,
          note: '小於乙太網路標準的 96 bits。需通道端的 vendor SDK 已移除 '
              + 'config_stream_ifg/ibg 的下限,否則此測試會失效。',
        },
      },
    },
    Custom: {
      label: '自定封包(PCAP)',
      // params is deliberately empty: importing a PCAP is an action (pick file ->
      // read -> parse), not a "fill in a value" parameter, so it bypasses the
      // generic paramInput() rendering. The parsed result is stored in
      // params.stream.pcap_file, written directly by the editor's import button.
      //
      // There is no matching Python dataclass: this capability exists only in the
      // web app, so it is deliberately left out of the drift test's Python name map.
      params: {},
    },
  },

  trigger: {
    ImmediateSingle: { label: '立即觸發(單埠)', params: {} },
    SynchronizedMulti: { label: '同步觸發(多埠)', params: {} },
  },

  reader: {
    PortCounters: {
      label: '埠計數器',
      params: {
        aggregate: {
          type: 'enum', options: ['once', 'sum'], default: 'once',
          note: '一個埠開多個 stream 時要設 sum(逐一讀取後加總);'
              + 'once 只會採到最後一個 stream 的數字。',
        },
        per_port_detail: {
          type: 'bool', default: false,
          note: '額外回傳 tx_packets_by_port(每個發送埠各自的數字)。'
              + '多發送埠時要看兩邊有沒有平均出力就靠它。',
        },
        keep_per_stream_results: {
          type: 'bool', default: false,
          note: '額外回傳 per_stream_results(每次讀取的原始結果,依 stream 產生順序)。'
              + '錯誤類型掃描要看每一種各自的數字就靠它。',
        },
        use_stream_counters: {
          type: 'bool', default: false,
          note: '讀 CRC 類錯誤封包必須開啟 —— 整埠 TX 計數器不計 CRC 錯誤封包,會看到 tx=0。',
        },
      },
    },
    MonitorReceived: {
      label: 'Monitor 埠是否收到',
      params: {
        aggregate: {
          type: 'enum', options: ['once', 'sum'], default: 'once',
          note: '一個埠開多個 stream 時要設 sum(逐一讀取後加總);'
              + 'once 只會採到最後一個 stream 的數字。',
        },
      },
    },
    StreamLatency: { label: 'Stream 延遲', params: {} },
    PairwiseStream: { label: '逐對矩陣(mesh 專用)', params: {} },
  },
};

// reader is a string or an array of strings (a composite reader, see forwarding_pressure).
// params lists only values that differ from the module defaults; everything else uses the default.
const NO_PARAMS = { topology: {}, learning: {}, stream: {}, trigger: {}, reader: {} };

export const PRESETS = {
  'rfc2889.forwarding': {
    label: 'RFC-2889 Forwarding / Packet Loss',
    recipe: { topology: 'OneToOne.TwoPort', learning: 'AddressLearning',
              stream: 'Unicast', trigger: 'ImmediateSingle', reader: 'PortCounters' },
    params: NO_PARAMS,
    shape: { kind: 'convergence', check: 'check_loss_based', resultKey: 'throughput' },
  },

  'rfc2889.broadcast_forwarding': {
    label: 'RFC-2889 Broadcast Forwarding',
    recipe: { topology: 'OneToOne.TwoPort', learning: 'NoLearning',
              stream: 'Broadcast', trigger: 'ImmediateSingle', reader: 'PortCounters' },
    params: NO_PARAMS,
    shape: { kind: 'convergence', check: 'check_loss_based', resultKey: 'throughput' },
  },

  'rfc2889.error_filtering': {
    label: 'RFC-2889 Error Filtering',
    recipe: { topology: 'OneToOne.TwoPort', learning: 'AddressLearning',
              stream: 'ErrorSweep', trigger: 'ImmediateSingle', reader: 'PortCounters' },
    params: { ...NO_PARAMS,
              reader: { aggregate: 'sum', keep_per_stream_results: true,
                        use_stream_counters: true } },
    shape: { kind: 'single', check: 'check_rx_zero_with_full_detail' },
  },

  'rfc2889.broadcast_latency': {
    label: 'RFC-2889 Broadcast Latency',
    recipe: { topology: 'OneToOne.TwoPort', learning: 'NoLearning',
              stream: 'Broadcast', trigger: 'ImmediateSingle', reader: 'StreamLatency' },
    params: NO_PARAMS,
    shape: { kind: 'measurement' },   // RFC-2889 defines no pass/fail for this test
  },

  'rfc2889.forwarding_pressure': {
    label: 'RFC-2889 Forwarding Pressure',
    recipe: { topology: 'OneToOne.ThreePortMonitor', learning: 'AddressLearning',
              stream: 'Pressure', trigger: 'ImmediateSingle',
              reader: ['MonitorReceived', 'PortCounters'] },
    params: NO_PARAMS,
    shape: { kind: 'single', check: 'check_monitor_received_with_detail' },
  },

  'rfc2889.address_caching': {
    label: 'RFC-2889 Address Caching Capacity',
    recipe: { topology: 'OneToOne.ThreePortMonitor',
              learning: 'VaryingAddressAgedLearning',
              stream: 'Unicast', trigger: 'ImmediateSingle',
              reader: 'MonitorReceived' },
    params: NO_PARAMS,
    shape: { kind: 'convergence', check: 'check_monitor_received',
             resultKey: 'converged_mac_count' },
  },

  'rfc2889.address_learning': {
    label: 'RFC-2889 Address Learning Rate',
    recipe: { topology: 'OneToOne.ThreePortMonitor',
              learning: 'VaryingAddressAgedLearning',
              stream: 'Unicast', trigger: 'ImmediateSingle',
              reader: 'MonitorReceived' },
    params: NO_PARAMS,
    shape: { kind: 'convergence', check: 'check_monitor_received',
             resultKey: 'throughput' },
  },

  'rfc2889.congestion_control': {
    label: 'RFC-2889 Congestion Control',
    recipe: { topology: 'ManyToMany', learning: 'AddressLearning',
              stream: 'Unicast', trigger: 'SynchronizedMulti',
              reader: 'PortCounters' },
    params: { ...NO_PARAMS, reader: { per_port_detail: true } },
    shape: { kind: 'convergence', check: 'check_loss_based_with_detail',
             resultKey: 'throughput' },
  },

  'xmnt.manytomany': {
    label: 'XMNT 多對多(通用)',
    recipe: { topology: 'ManyToMany', learning: 'AddressLearning',
              stream: 'Unicast', trigger: 'SynchronizedMulti',
              reader: 'PortCounters' },
    params: NO_PARAMS,
    shape: { kind: 'convergence', check: 'check_loss_based_with_detail',
             resultKey: 'throughput' },
  },

  'xmnt.fullymesh': {
    label: 'XMNT 全網狀(通用)',
    recipe: { topology: 'FullyMesh', learning: 'AddressLearning',
              stream: 'Unicast', trigger: 'SynchronizedMulti',
              reader: 'PairwiseStream' },
    params: NO_PARAMS,
    shape: { kind: 'convergence', check: 'check_loss_based_with_detail',
             resultKey: 'throughput' },
  },

  'xmnt.custom_packet': {
    label: 'XMNT 自定封包(PCAP / PCAPNG 重放)',
    // The trigger is ImmediateSingle, not SynchronizedMulti: this topology always
    // has exactly one sending port, so a synchronized trigger would only hit the
    // sync-multi-single-tx-port warning. The reader is the same composite reader
    // as forwarding_pressure.
    recipe: { topology: 'OneToOne.ThreePortMonitor', learning: 'AddressLearning',
              stream: 'Custom', trigger: 'ImmediateSingle',
              reader: ['MonitorReceived', 'PortCounters'] },
    params: NO_PARAMS,
    shape: { kind: 'pure_send' },
    requiresImport: true,
  },
};

/**
 * This preset is only complete once the user supplies a file, unlike the other
 * presets that run with one click.
 *
 * It exists so tests can state the difference explicitly instead of special-casing
 * xmnt.custom_packet in every test:
 *   - "every preset is a valid recipe" -> for these presets, assert that they are
 *     blocked **only** by custom-stream-requires-pcap-file, which is stricter than skipping
 *   - "every preset runs to completion in simulated mode" -> the test supplies a fake
 *     capture file and runs it, with no loss of coverage
 *   - "key names match the golden recordings" -> these presets have no recorder recipe
 *     (the input is a file the user provides at run time, so nothing can be
 *     recorded), so they are excluded from the comparison
 */
export const requiresImport = preset => preset.requiresImport === true;

// --- compatibility rules ---
//
// Sources: the pitfalls documented in python-app/README.md, and the existing raises in
// nupython_xmnt_recipe_assembly.py. The goal is that these combinations cannot be
// entered in the UI at all, instead of crashing mid-run or silently computing wrong results.

export const MESH_TOPOLOGIES = new Set(['ManyToMany', 'FullyMesh']);

// reader may be a string or an array of strings (composite reader); every rule normalizes it to an array first.
const readersOf = r => (Array.isArray(r.reader) ? r.reader : [r.reader]);
const hasReader = (r, name) => readersOf(r).includes(name);

// reader -> the checks that can consume the output keys that reader produces
const CHECKS_BY_READER = {
  PortCounters: ['check_loss_based', 'check_loss_based_with_detail',
                 'check_rx_zero', 'check_rx_zero_with_full_detail'],
  MonitorReceived: ['check_monitor_received', 'check_monitor_received_with_detail'],
  StreamLatency: [],   // measurement shape, no check
  PairwiseStream: ['check_loss_based_with_detail', 'check_rx_zero_with_full_detail'],
};

// a composite reader's output merges its parts, so the usable checks are the union
const allowedChecks = r => readersOf(r).flatMap(name => CHECKS_BY_READER[name] ?? []);

export const RULES = [
  {
    level: 'block', id: 'pairwise-requires-mesh',
    message: 'PairwiseStream reader 只能配 ManyToMany 或 FullyMesh —— '
           + '一對一拓樸沒有複數 rx_ports,執行時會 KeyError。',
    applies: r => hasReader(r, 'PairwiseStream') && !MESH_TOPOLOGIES.has(r.topology),
  },
  {
    level: 'block', id: 'varying-learning-requires-one-to-one',
    message: 'VaryingAddressAgedLearning 只能配一對一拓樸 —— '
           + 'mesh 拓樸沒有單數 rx_port,執行時會 KeyError。',
    applies: r => r.learning === 'VaryingAddressAgedLearning'
                  && MESH_TOPOLOGIES.has(r.topology),
  },
  {
    level: 'block', id: 'stream-latency-not-with-error-sweep-mesh',
    message: 'StreamLatency reader 不能配 ErrorSweep + mesh 拓樸,執行時會 AttributeError。',
    applies: r => hasReader(r, 'StreamLatency') && r.stream === 'ErrorSweep'
                  && MESH_TOPOLOGIES.has(r.topology),
  },
  {
    level: 'block', id: 'check-must-match-reader',
    message: 'check_fn 必須對應 reader 實際產生的輸出鍵,否則執行時直接 KeyError。',
    applies: r => r.check != null && !allowedChecks(r).includes(r.check),
  },
  {
    level: 'block', id: 'error-sweep-needs-sum',
    message: 'ErrorSweep 會在同一個埠開多個 stream,reader 必須設 aggregate:"sum",'
           + '否則只會採到最後一個 stream 的數字。',
    applies: r => r.stream === 'ErrorSweep' && hasReader(r, 'PortCounters')
                  && (r.params?.reader?.aggregate ?? 'once') !== 'sum',
  },
  {
    level: 'block', id: 'bad-crc-needs-stream-counters',
    message: '要讀 bad_crc 必須開 use_stream_counters —— '
           + '整埠 TX 計數器不計 CRC 錯誤封包,否則會看到 tx=0 而誤判。',
    applies: r => r.stream === 'ErrorSweep' && hasReader(r, 'PortCounters')
                  && (r.params?.stream?.error_types
                      ?? MODULES.stream.ErrorSweep.params.error_types.default
                     ).includes('bad_crc')
                  && r.params?.reader?.use_stream_counters !== true,
  },
  {
    level: 'warn', id: 'sync-multi-single-tx-port',
    message: 'SynchronizedMulti 配單一發送埠會靜默降級成一般觸發 —— '
           + '無害,但可能不是你的本意。',
    applies: r => r.trigger === 'SynchronizedMulti' && !MESH_TOPOLOGIES.has(r.topology),
  },
  {
    level: 'warn', id: 'broadcast-learning-noop',
    message: 'Broadcast 的目的位址是全 1,DUT 不查表直接 flood,'
           + '學習步驟不會有任何作用。',
    applies: r => r.stream === 'Broadcast' && r.learning !== 'NoLearning',
  },
  {
    level: 'block', id: 'custom-stream-requires-pcap-file',
    message: '自定封包(Custom)需要先匯入 PCAP 檔案 —— 沒有封包內容可以送。',
    applies: r => r.stream === 'Custom'
                  && !(r.params?.stream?.pcap_file?.packets?.length > 0),
  },
];

/**
 * Validate a recipe.
 * @returns {{blocks: Array, warnings: Array}} when blocks is non-empty the UI must not run it.
 */
export function validateRecipe(recipe) {
  const hit = RULES.filter(rule => rule.applies(recipe));
  return {
    blocks: hit.filter(r => r.level === 'block'),
    warnings: hit.filter(r => r.level === 'warn'),
  };
}
