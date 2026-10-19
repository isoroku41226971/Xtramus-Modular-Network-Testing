import { pyRound } from './py-compat.js';
import { ConfigError } from './errors.js';

export function generateSweep(start, stop, step) {
  if (step === 0) {
    throw new ConfigError('step 不可為 0');
  }
  if ((start < stop && step < 0) || (start > stop && step > 0)) {
    throw new ConfigError('step 的方向與 start/stop 不符');
  }

  const values = [];
  let current = start;
  if (step > 0) {
    while (current < stop) {
      values.push(current);
      current = pyRound(current + step, 12);   // cancel accumulated floating-point error
    }
  } else {
    while (current > stop) {
      values.push(current);
      current = pyRound(current + step, 12);
    }
  }

  if (!values.length || values[values.length - 1] !== stop) {
    values.push(stop);
  }
  return values;
}

export function getFramesizes(cfg) {
  if (cfg.mode_framesize === 0) {
    return [...cfg.framesize_custom];
  }
  if (cfg.mode_framesize === 1) {
    return generateSweep(cfg.framesize_start, cfg.framesize_stop, cfg.framesize_step);
  }
  throw new ConfigError('無效的 mode_framesize');
}

/**
 * One binary-search step. Returns a named object instead of Python's 4-tuple:
 * positional destructuring in JS is easy to get out of order without any error,
 * and the golden recordings compare the emitted commands, not internal return shapes.
 */
export function nextBinaryTarget(passed, now, minTarget, maxTarget, failCount) {
  if (passed) {
    const nextMin = now;
    return {
      nextNow: pyRound((nextMin + maxTarget) / 2.0, 3),
      minTarget: nextMin,
      maxTarget,
      failCount,
    };
  }

  const nextFailCount = failCount + 1;
  if (nextFailCount === 1) {
    let nextNow = pyRound(now * 0.8, 3);
    if (nextNow < minTarget) nextNow = minTarget;
    return { nextNow, minTarget, maxTarget, failCount: nextFailCount };
  }

  const nextMax = now;
  return {
    nextNow: pyRound((minTarget + nextMax) / 2.0, 3),
    minTarget,
    maxTarget: nextMax,
    failCount: nextFailCount,
  };
}

// ===== async: convergence loop, single verdict, single measurement =====

/** Single dispatch point for progress events. A throwing callback must not break the test. */
function emitProgress(onProgress, event) {
  if (!onProgress) return;
  try {
    onProgress(event);
  } catch {
    // the progress callback is for the UI; if it breaks, the test itself is unaffected
  }
}

// Python guards against infinite loops with a set of tuples; a JS Set compares objects
// by identity, so string keys are required, or repeats are never detected and the
// loop never stops.
const stateKey = (min, max, now, failCount) =>
  `${pyRound(min, 3)}|${pyRound(max, 3)}|${pyRound(now, 3)}|${failCount}`;

export async function runConvergenceFramesize(cfg, framesize, testFn, checkFn, options = {}) {
  if (cfg.mode_convergence === 0) {
    return runBinaryConvergence(cfg, framesize, testFn, checkFn, options);
  }
  if (cfg.mode_convergence === 1) {
    return runLinearConvergence(cfg, framesize, testFn, checkFn, options);
  }
  throw new ConfigError('無效的 mode_convergence');
}

async function runBinaryConvergence(cfg, framesize, testFn, checkFn, options) {
  const {
    resultKey = 'throughput', zeroResult = null, backend = null,
    fakeResultFn = null, signal = null, onProgress = null,
  } = options;

  if (cfg.target_resolution <= 0) {
    throw new ConfigError('target_resolution 必須大於 0');
  }

  let minTarget = pyRound(cfg.target_min, 3);
  let maxTarget = pyRound(cfg.target_max, 3);
  let nowTarget = pyRound(cfg.target_now, 3);
  let failCount = 0;
  let lastPassResult = null;
  let cancelled = false;
  let iteration = 0;

  const previousStates = new Set();
  let finalBoundaryTest = false;

  for (;;) {
    if (signal?.aborted) { cancelled = true; break; }

    const key = stateKey(minTarget, maxTarget, nowTarget, failCount);
    if (previousStates.has(key)) break;
    previousStates.add(key);

    iteration += 1;
    emitProgress(onProgress, { phase: 'iteration', framesize, iteration, target: nowTarget });

    const rawResult = await testFn(cfg, framesize, nowTarget, backend, fakeResultFn,
                                   { signal, onProgress });
    const checked = checkFn(cfg, rawResult);
    emitProgress(onProgress, {
      phase: 'iteration-result', framesize, iteration, target: nowTarget,
      raw: rawResult, checked,
    });

    if (checked.passed) {
      lastPassResult = { [resultKey]: nowTarget, ...checked };
    }

    if (finalBoundaryTest) break;

    const step = nextBinaryTarget(checked.passed, nowTarget, minTarget, maxTarget, failCount);
    minTarget = step.minTarget;
    maxTarget = step.maxTarget;
    failCount = step.failCount;
    const nextTarget = step.nextNow;

    if (Math.abs(nextTarget - nowTarget) <= cfg.target_resolution) {
      let boundaryTarget;
      if (nextTarget > nowTarget) boundaryTarget = maxTarget;
      else if (nextTarget < nowTarget) boundaryTarget = minTarget;
      else boundaryTarget = checked.passed ? maxTarget : minTarget;

      boundaryTarget = pyRound(boundaryTarget, 3);
      if (boundaryTarget === nowTarget) break;

      nowTarget = boundaryTarget;
      finalBoundaryTest = true;
      continue;
    }

    nowTarget = pyRound(nextTarget, 3);
  }

  return finishConvergence(lastPassResult, resultKey, zeroResult, cancelled);
}

async function runLinearConvergence(cfg, framesize, testFn, checkFn, options) {
  const {
    resultKey = 'throughput', zeroResult = null, backend = null,
    fakeResultFn = null, signal = null, onProgress = null,
  } = options;

  if (cfg.target_step <= 0) {
    throw new ConfigError('target_step 必須大於 0');
  }

  const steps = generateSweep(cfg.target_min, cfg.target_max, cfg.target_step);
  let lastPassResult = null;
  let cancelled = false;
  let iteration = 0;

  for (const nowTarget of steps) {
    if (signal?.aborted) { cancelled = true; break; }

    iteration += 1;
    emitProgress(onProgress, { phase: 'iteration', framesize, iteration, target: nowTarget });

    const rawResult = await testFn(cfg, framesize, nowTarget, backend, fakeResultFn,
                                   { signal, onProgress });
    const checked = checkFn(cfg, rawResult);
    emitProgress(onProgress, {
      phase: 'iteration-result', framesize, iteration, target: nowTarget,
      raw: rawResult, checked,
    });
    if (checked.passed) {
      lastPassResult = { [resultKey]: nowTarget, ...checked };
    }
  }

  return finishConvergence(lastPassResult, resultKey, zeroResult, cancelled);
}

function finishConvergence(lastPassResult, resultKey, zeroResult, cancelled) {
  const base = lastPassResult ?? { [resultKey]: 0.0, passed: false, ...(zeroResult ?? {}) };
  return cancelled ? { ...base, cancelled: true } : base;
}

export async function runSingleTest(cfg, framesize, testFn, checkFn, options = {}) {
  const { backend = null, fakeResultFn = null, signal = null, onProgress = null } = options;
  const rawResult = await testFn(cfg, framesize, backend, fakeResultFn, { signal, onProgress });
  const checked = checkFn(cfg, rawResult);
  emitProgress(onProgress, {
    phase: 'iteration-result', framesize, iteration: 1, target: null,
    raw: rawResult, checked,
  });
  return checked;
}

export async function runMeasurement(cfg, framesize, testFn, options = {}) {
  const { backend = null, fakeResultFn = null, signal = null, onProgress = null } = options;
  const rawResult = await testFn(cfg, framesize, backend, fakeResultFn, { signal, onProgress });
  emitProgress(onProgress, {
    phase: 'iteration-result', framesize, iteration: 1, target: null,
    raw: rawResult, checked: null,
  });
  return rawResult;
}
