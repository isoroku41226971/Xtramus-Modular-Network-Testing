import { validate } from './config.js';
import { ConfigError } from './errors.js';
import { checkPureSend } from './checks.js';
import {
  getFramesizes, runConvergenceFramesize, runSingleTest, runMeasurement,
} from './convergence.js';

/**
 * Convergence test. The six convergence fields live on the spec itself, so callers
 * never touch cfg; runTestItem copies them onto a clone of cfg.
 */
export function convergenceSpec(fields) {
  return {
    kind: 'convergence',
    resultKey: 'throughput',
    zeroResult: null,
    mode_convergence: 0,
    target_min: 1.0,
    target_max: 100.0,
    target_now: 50.0,
    target_step: 10.0,
    target_resolution: 0.01,
    ...fields,
  };
}

/** Single verdict. testFn takes no target argument. */
export function singleTestSpec(fields) {
  return { kind: 'single', ...fields };
}

/** Single measurement with no checkFn; RFC-2889 defines no pass/fail for it. */
export function measurementSpec(fields) {
  return { kind: 'measurement', ...fields };
}

/**
 * Pure send (replaying a custom-packet PCAP). testFn has the same signature as
 * single (no target), batching happens inside testFn, and checkFn is always
 * checkPureSend; users cannot pick another.
 */
export function pureSendSpec(fields) {
  return { kind: 'pure_send', checkFn: checkPureSend, ...fields };
}

// Spec field casing is mixed on purpose: the six target_* fields must be snake_case
// because they are spread onto cfg (all of cfg is snake_case and must match the
// config block of the golden recordings); testFn / checkFn / resultKey / zeroResult
// only live on the JS side, so they use camelCase.
const CONVERGENCE_OVERRIDES = [
  'mode_convergence', 'target_min', 'target_max',
  'target_now', 'target_step', 'target_resolution',
];

function effectiveConfig(cfg, spec) {
  const overrides = {};
  for (const name of CONVERGENCE_OVERRIDES) overrides[name] = spec[name];
  return { ...cfg, ...overrides };
}

// Duplicates the function of the same name in convergence.js. Deliberately not
// shared: it is 6 lines, and a separate module would cost more than the duplication.
// Extract it if a third place ever needs it.
function emitProgress(onProgress, event) {
  if (!onProgress) return;
  try {
    onProgress(event);
  } catch {
    // the progress callback is for the UI; if it breaks, the test itself is unaffected
  }
}

/**
 * Run one round of the test for every frame size.
 *
 * Returns { results, errors, cancelled }:
 *   results   { [framesize]: result object }, successful ones only
 *   errors    [{ framesize, error }]; one framesize failing does not affect the others
 *   cancelled whether the run stopped early because of the signal
 *
 * This differs from the Python version, which uses a dict comprehension: an
 * exception on any framesize loses the whole batch. A long test should not be
 * wasted because the last framesize failed. ConfigError is the exception: if the
 * recipe itself is invalid every framesize fails the same way, so it is rethrown
 * immediately instead of retried per framesize.
 */
export async function runTestItem(cfg, spec, options = {}) {
  const { backend = null, fakeResultFn = null, signal = null, onProgress = null } = options;

  const isConvergence = spec.kind === 'convergence';
  if (!isConvergence && spec.kind !== 'single' && spec.kind !== 'measurement'
      && spec.kind !== 'pure_send') {
    throw new ConfigError(`不支援的 spec.kind:${JSON.stringify(spec.kind)}`);
  }

  const cfgToUse = isConvergence ? effectiveConfig(cfg, spec) : cfg;
  validate(cfgToUse);

  const framesizes = getFramesizes(cfgToUse);
  const results = {};
  const errors = [];
  let cancelled = false;

  for (const framesize of framesizes) {
    if (signal?.aborted) { cancelled = true; break; }

    emitProgress(onProgress, { phase: 'framesize-start', framesize });

    try {
      let result;
      if (isConvergence) {
        result = await runConvergenceFramesize(
          cfgToUse, framesize, spec.testFn, spec.checkFn,
          { resultKey: spec.resultKey, zeroResult: spec.zeroResult,
            backend, fakeResultFn, signal, onProgress });
      } else if (spec.kind === 'single' || spec.kind === 'pure_send') {
        // Both have the same shape: call testFn once for the raw result, then checkFn
        // once for the verdict. pure_send batches inside testFn, invisible at this level.
        result = await runSingleTest(cfgToUse, framesize, spec.testFn, spec.checkFn,
                                     { backend, fakeResultFn, signal, onProgress });
      } else {
        result = await runMeasurement(cfgToUse, framesize, spec.testFn,
                                      { backend, fakeResultFn, signal, onProgress });
      }
      results[framesize] = result;
      if (result?.cancelled) cancelled = true;
    } catch (err) {
      if (err instanceof ConfigError) throw err;
      errors.push({ framesize, error: err });
    }

    emitProgress(onProgress, { phase: 'framesize-end', framesize });
  }

  return { results, errors, cancelled };
}
