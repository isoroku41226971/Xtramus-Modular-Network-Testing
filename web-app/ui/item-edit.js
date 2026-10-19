/**
 * Pure logic for editing test items. Pure functions; no DOM, no store.
 */

import { DIMENSIONS, MODULES, PRESETS, validateRecipe } from '../engine/catalog.js';
import { DEFAULT_CONFIG } from '../engine/config.js';
import { CHECK_FNS, buildRecipeForValidation } from './spec-build.js';

/** cfg fields that only matter for the convergence shape; hidden for other shapes so they don't look effective. */
export const CONVERGENCE_CFG_KEYS = [
  'mode_convergence', 'target_min', 'target_max', 'target_now',
  'target_step', 'target_resolution',
];

/**
 * Default-value hints shown when advanced fields are left empty.
 *
 * Values come from DEFAULT_CONFIG, not convergenceSpec: makeConfig fills every key of
 * DEFAULT_CONFIG, so buildSpec's `!= null` check always holds and these are the values
 * that actually apply.
 */
export function cfgPlaceholder(key) {
  const v = DEFAULT_CONFIG[key];
  if (v === undefined) return '';
  return `${Array.isArray(v) ? v.join(',') : v}(預設值)`;
}

/** Fields that show a value on a new item. The values must equal the engine's real defaults, or they would silently change behavior. */
const seedCfg = () => ({
  framesize_custom: [64],
  tx_duration_time: 2,
  target_min: DEFAULT_CONFIG.target_min,
  target_max: DEFAULT_CONFIG.target_max,
  target_now: DEFAULT_CONFIG.target_now,
  target_resolution: DEFAULT_CONFIG.target_resolution,
});

let seq = 0;
const nextId = () => `item${(seq += 1)}-${Date.now().toString(36)}`;

const EMPTY_PARAMS = () => Object.fromEntries(DIMENSIONS.map(d => [d, {}]));

export function defaultParamsFor(dimension, moduleName) {
  const schema = MODULES[dimension]?.[moduleName]?.params ?? {};
  return Object.fromEntries(
    Object.entries(schema).map(([k, spec]) => [k, spec.default]));
}

export function blankItem() {
  return {
    id: nextId(), name: '自組測試項', presetKey: null,
    recipe: Object.fromEntries(DIMENSIONS.map(d => [d, null])),
    params: EMPTY_PARAMS(),
    ports: {},
    cfg: seedCfg(),
    shape: { kind: 'convergence', check: 'check_loss_based', resultKey: 'throughput' },
  };
}

export function itemFromPreset(presetKey) {
  const preset = PRESETS[presetKey];
  // for each dimension, lay down the module defaults, then apply the preset's explicit overrides
  const params = Object.fromEntries(DIMENSIONS.map(d => {
    const name = preset.recipe[d];
    const names = Array.isArray(name) ? name : [name];
    const base = Object.assign({}, ...names.map(n => defaultParamsFor(d, n)));
    return [d, { ...base, ...(preset.params?.[d] ?? {}) }];
  }));

  return {
    id: nextId(), name: preset.label, presetKey,
    recipe: { ...preset.recipe },
    params,
    ports: {},
    cfg: seedCfg(),
    shape: { ...preset.shape },
  };
}

export function portFieldsFor(item) {
  return MODULES.topology[item.recipe?.topology]?.ports ?? [];
}

/** Conventional ports used when there is no lease (simulation mode). */
const FALLBACK_PORTS = [[0, 7, 1], [0, 7, 2], [0, 7, 3]];

/**
 * Ports pre-filled when a test item is added.
 *
 * With a lease, ports are assigned only from the leased ones: a hard-coded default
 * would store a port that was not leased, which the editor's dropdown cannot list, so
 * the UI would show "unassigned" while the value is still there, a visual lie.
 *
 * When there are not enough ports, leave them empty (the item becomes incomplete,
 * visibly) rather than forcing duplicate ports.
 */
export function defaultPortsFor(topologyName, leased) {
  const pool = leased?.length > 0 ? leased : FALLBACK_PORTS;
  const fields = MODULES.topology[topologyName]?.ports ?? [];

  if (fields.length === 1) return { [fields[0]]: pool };          // FullyMesh: use them all
  if (fields[0]?.startsWith('mesh')) {                            // ManyToMany: the last one receives
    if (pool.length < 2) return {};
    return { [fields[0]]: pool.slice(0, -1), [fields[1]]: pool.slice(-1) };
  }
  if (pool.length < fields.length) return {};
  return Object.fromEntries(fields.map((f, i) => [f, pool[i]]));
}

export function setDimension(item, dimension, moduleName) {
  const recipe = { ...item.recipe, [dimension]: moduleName };
  const next = {
    ...item,
    presetKey: null,                      // once edited it is no longer that preset
    recipe,
    // drop the old params when switching modules, or they would be fed to a module that doesn't know them
    params: { ...item.params, [dimension]: defaultParamsFor(dimension, moduleName) },
  };

  if (dimension === 'topology') {
    // drop ports the new topology doesn't use, or the lease would lock unused ports
    const keep = new Set(MODULES.topology[moduleName]?.ports ?? []);
    next.ports = Object.fromEntries(
      Object.entries(item.ports ?? {}).filter(([k]) => keep.has(k)));
  }

  // Custom packets serve a single purpose (just monitoring the send), so the other four
  // dimensions have no choices: lock them to the right values here, and the editor does
  // not render those menus.
  if (dimension === 'stream') {
    if (moduleName === 'Custom') {
      next.recipe.topology = 'OneToOne.ThreePortMonitor';
      next.recipe.trigger = 'ImmediateSingle';
      next.recipe.reader = ['MonitorReceived', 'PortCounters'];
      next.shape = { kind: 'pure_send' };
    } else if (item.recipe.stream === 'Custom') {
      // Switching away from Custom. Check item (the value before the switch), not next:
      // next.recipe.stream already equals moduleName at this point.
      //
      // Without resetting the shape it would stay pure_send: the "fix check" step below
      // only adds a check and never changes kind back, so the stream would no longer be
      // Custom yet still run as pure send, while all four menus reappeared in the UI.
      next.shape = { kind: 'convergence', check: 'check_loss_based', resultKey: 'throughput' };
    }
  }

  // After a reader change the old check may no longer be valid. Without fixing it the
  // dropdown shows the new list while the draft keeps the old value: the UI looks
  // valid but validation says blocked.
  //
  // Only when a reader is actually chosen: with reader null, allowedChecksFor is always
  // empty, but that means "not chosen yet", not "this is a measurement shape".
  //
  // Skip pure_send too: its reader is the fixed combination locked above and its check
  // is hard-coded in pureSendSpec, so there is no shape.check to fix. Otherwise it would
  // get a check that is never read, a false lead for the next person.
  if (next.recipe.reader && next.shape.kind !== 'pure_send') {
    const allowed = allowedChecksFor(next);
    if (allowed.length === 0) {
      // StreamLatency has no usable check, so this is the measurement shape: drop
      // check/resultKey together rather than only changing kind. No catalog preset of the
      // measurement shape carries these fields, so stale values are just false leads (a
      // real case: a leftover resultKey of 'throughput' fooled chartValueMeta() into
      // giving a latency chart the fixed 0-100% throughput axis; see the matching fix in
      // ui/chart-data.js).
      next.shape = { kind: 'measurement' };
    } else if (!allowed.includes(next.shape.check)) {
      next.shape = { ...next.shape, check: allowed[0] };
    }
  }
  return next;
}

/**
 * The checks usable with this reader combination.
 *
 * The catalog's CHECKS_BY_READER is not exported and engine/ stays untouched, so this
 * is inferred through the public API: only whether the check-must-match-reader rule
 * fires matters; other blocks (e.g. an incompatible topology) have nothing to do with
 * the check and must not empty the list.
 *
 * The question is "which checks fit this reader", independent of the current shape, so
 * it always asks with a shape that has a verdict. Using the item's own shape would send
 * a measurement shape into validation without a check, the rule would never fire, and
 * the answer would wrongly be "every check is allowed".
 */
export function allowedChecksFor(item) {
  return Object.keys(CHECK_FNS).filter(check => {
    const recipe = buildRecipeForValidation({
      ...item, shape: { ...item.shape, kind: 'single', check },
    });
    return !validateRecipe(recipe).blocks.some(r => r.id === 'check-must-match-reader');
  });
}
