/**
 * Turns a UI item into the { cfg, spec } the engine accepts.
 *
 * Why this layer exists: the catalog's shape.check is a string ('check_loss_based')
 * while engine/checks.js exports functions (checkLossBased), with no ready-made mapping
 * between them.
 */

import { makeConfig } from '../engine/config.js';
import {
  convergenceSpec, singleTestSpec, measurementSpec, pureSendSpec,
} from '../engine/assembly.js';
import { MODULES } from '../engine/catalog.js';
import {
  checkLossBased, checkRxZero, checkMonitorReceived,
  checkLossBasedWithDetail, checkRxZeroWithFullDetail, checkMonitorReceivedWithDetail,
} from '../engine/checks.js';

/** Catalog check string -> function. A new check function must be added on both sides. */
export const CHECK_FNS = {
  check_loss_based: checkLossBased,
  check_rx_zero: checkRxZero,
  check_monitor_received: checkMonitorReceived,
  check_loss_based_with_detail: checkLossBasedWithDetail,
  check_rx_zero_with_full_detail: checkRxZeroWithFullDetail,
  check_monitor_received_with_detail: checkMonitorReceivedWithDetail,
};

/** The port fields this topology actually uses; passing extra ones would make the connection layer lock unused ports. */
function portOverrides(item) {
  const fields = MODULES.topology[item.recipe.topology]?.ports ?? [];
  const out = {};
  for (const f of fields) {
    if (item.ports?.[f] != null) out[f] = item.ports[f];
  }
  return out;
}

/**
 * error_types is the one field that exists in DEFAULT_CONFIG yet is set only through
 * item.params.stream (the Stream module's form parameters). The checkFn
 * (checkRxZeroWithFullDetail) uses cfg.error_types to label Error Filtering results per
 * type, so without this sync, error_types edited in the editor would never reach the
 * check, which would keep using DEFAULT_CONFIG's four defaults.
 */
function streamConfigOverrides(item) {
  const errorTypes = item.params?.stream?.error_types;
  return errorTypes != null ? { error_types: errorTypes } : {};
}

export function buildConfig(item) {
  return makeConfig({ ...portOverrides(item), ...streamConfigOverrides(item), ...(item.cfg ?? {}) });
}

export function buildSpec(item, testFn) {
  const { kind, check, resultKey } = item.shape;

  if (kind === 'measurement') {
    return measurementSpec({ testFn });     // RFC-2889 defines no pass/fail for this
  }
  if (kind === 'pure_send') {
    // checkFn is always checkPureSend (inside pureSendSpec), so CHECK_FNS is not consulted:
    // custom packets have no check-function menu, and shape.check does not exist for them
    return pureSendSpec({ testFn });
  }

  const checkFn = CHECK_FNS[check];
  if (!checkFn) throw new Error(`未知的 check:${check}`);

  if (kind === 'single') return singleTestSpec({ testFn, checkFn });

  const c = item.cfg ?? {};
  return convergenceSpec({
    testFn, checkFn,
    ...(resultKey ? { resultKey } : {}),
    ...(c.mode_convergence != null ? { mode_convergence: c.mode_convergence } : {}),
    ...(c.target_min != null ? { target_min: c.target_min } : {}),
    ...(c.target_max != null ? { target_max: c.target_max } : {}),
    ...(c.target_now != null ? { target_now: c.target_now } : {}),
    ...(c.target_step != null ? { target_step: c.target_step } : {}),
    ...(c.target_resolution != null ? { target_resolution: c.target_resolution } : {}),
  });
}

/**
 * validateRecipe needs a flat object that includes check and params to evaluate every rule.
 *
 * The measurement and pure-send shapes carry no check: buildSpec builds them directly as
 * measurementSpec({ testFn }) / pureSendSpec({ testFn }) and never reads shape.check (the
 * pure-send checkFn is hard-coded in pureSendSpec). Passing a stale check left over from a
 * shape change would make check-must-match-reader block a valid combination that never
 * uses a check at run time.
 */
export const SHAPES_WITHOUT_CHECK = new Set(['measurement', 'pure_send']);

export function buildRecipeForValidation(item) {
  const check = SHAPES_WITHOUT_CHECK.has(item.shape?.kind)
    ? null : (item.shape?.check ?? null);
  return { ...item.recipe, check, params: item.params ?? {} };
}
