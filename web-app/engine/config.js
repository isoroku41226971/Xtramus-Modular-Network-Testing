import { ConfigError } from './errors.js';

/**
 * Test configuration. Field names keep Python's snake_case: they go straight into
 * the config block of the golden recordings and are what the schema drift check
 * compares, so renaming them would defeat drift detection.
 */
export const DEFAULT_CONFIG = Object.freeze({
  test_type: 'forwarding',

  // --- shared port settings ---
  server_ip: '192.168.1.8',
  tx_port: [0, 2, 3],
  rx_port: [0, 2, 3],
  tx_port2: null,
  monitor_port: null,
  mesh_tx_ports: null,
  mesh_rx_ports: null,
  mesh_ports: null,

  // --- frame size sweep ---
  mode_framesize: 0,
  framesize_custom: [64, 128, 256, 512, 1024, 1280, 1518],
  framesize_start: 64,
  framesize_step: 64,
  framesize_stop: 1518,

  // --- generic convergence target ---
  mode_convergence: 0,
  target_min: 1.0,
  target_max: 100.0,
  target_now: 50.0,
  target_step: 2.0,
  target_resolution: 0.01,
  target_acceptloss: 0.005,   // percent scale (0-100), same scale as loss_rate

  // --- transmit mode ---
  mode_tx: 0,
  tx_duration_time: 60,
  tx_burst_frames: 10000,

  // --- address learning before the test ---
  learning_enabled: true,
  learning_frames: 10,
  learning_gap_seconds: 0.1,
  learning_settle_time: 1.0,

  // --- Error Filtering only ---
  error_types: ['bad_crc', 'undersize', 'alignment', 'oversize'],

  // --- Address Caching only ---
  aging_time: 300.0,

  // --- Address Learning only ---
  fixed_mac_count: null,

  // --- connection and timing ---
  counter_clear_wait: 0.2,
  counter_settle_time: 1.0,
  counter_read_wait: 1.0,
  arp_reply_config: 'arp_reply.csv',
  arp_reply_start_wait: 1.0,

  simulate: true,
});

export const VALID_TEST_TYPES = new Set([
  'forwarding', 'error_filtering', 'broadcast_forwarding', 'broadcast_latency',
  'congestion_control', 'forwarding_pressure', 'address_caching', 'address_learning',
]);

export const REQUIRED_FIELDS_BY_TEST_TYPE = {
  congestion_control: ['mesh_tx_ports', 'mesh_rx_ports'],
  forwarding_pressure: ['monitor_port'],
  address_caching: ['monitor_port'],
  address_learning: ['fixed_mac_count', 'monitor_port'],
};

/**
 * Build a config. Unknown fields throw ConfigError: Python's Config(**kwargs) raises
 * TypeError on unknown keywords, but JS object spread does not, so without this check
 * typos would be silently swallowed.
 */
export function makeConfig(overrides = {}) {
  const unknown = Object.keys(overrides).filter(k => !(k in DEFAULT_CONFIG));
  if (unknown.length) {
    throw new ConfigError(`未知的設定欄位:${unknown.join(', ')}`);
  }
  return { ...DEFAULT_CONFIG, ...overrides };
}

export function validate(cfg) {
  if (!VALID_TEST_TYPES.has(cfg.test_type)) {
    throw new ConfigError(`無效的 test_type:${JSON.stringify(cfg.test_type)}`);
  }

  const required = REQUIRED_FIELDS_BY_TEST_TYPE[cfg.test_type] ?? [];
  const missing = required.filter(name => cfg[name] === null || cfg[name] === undefined);
  if (missing.length) {
    throw new ConfigError(
      `test_type=${cfg.test_type} 需要設定這些欄位:${missing.join(', ')}`);
  }
}

/**
 * Run address_caching first, then feed its result into the address_learning config.
 *
 * runFn has the signature async (cfg, backend) -> object. When called for
 * address_caching, the returned object must contain converged_mac_count.
 * This function mutates cfgLearning.fixed_mac_count in place (a deliberate side
 * effect, matching the Python version).
 */
export async function runAddressLearningWithCaching(cfgCaching, cfgLearning, runFn, backend = null) {
  if (cfgCaching.test_type !== 'address_caching') {
    throw new ConfigError("cfgCaching.test_type 必須是 'address_caching'");
  }
  if (cfgLearning.test_type !== 'address_learning') {
    throw new ConfigError("cfgLearning.test_type 必須是 'address_learning'");
  }

  validate(cfgCaching);
  const cachingResult = await runFn(cfgCaching, backend);

  cfgLearning.fixed_mac_count = cachingResult.converged_mac_count;
  validate(cfgLearning);
  const learningResult = await runFn(cfgLearning, backend);

  return { address_caching: cachingResult, address_learning: learningResult };
}
