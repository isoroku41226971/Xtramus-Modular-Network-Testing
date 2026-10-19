/**
 * Run orchestration. The only place that calls engine/; no DOM.
 *
 * runTest is injectable so tests can verify the orchestration without real convergence.
 *
 * Leases are never touched here: ports are chosen when entering the project and
 * released only when it closes.
 */

import { runTestItem } from '../engine/assembly.js';
import { buildConfig, buildSpec } from './spec-build.js';
import { makeFakeTestFn } from './fake-dut.js';
import { nextRunnable } from './queue.js';
import { overallProgress } from './format.js';

// Defaults to 0. Some tests do not inject runTest and run the real convergence loop
// through the default runTestItem, with several iterations per preset; a non-zero delay
// would turn a few seconds of tests into minutes (a hard-coded delay in runOne() once
// left the 10 presets unfinished after two minutes). Only ui/main-workspace.js passes a
// non-zero value, for the interactive UI.
export function createRunner(store, {
  runTest = runTestItem, fakeResultDelaySeconds = 0, now = Date.now,
} = {}) {
  let busy = false;
  let controller = null;
  let stopAll = false;

  const patch = (queueId, p) => store.dispatch({ type: 'patch-queue', queueId, patch: p });

  async function runOne(q) {
    const item = store.getState().items.find(i => i.id === q.itemId);
    if (!item) { patch(q.queueId, { status: 'failed', error: '找不到對應的測試項' }); return; }

    // snapshot, so editing parameters mid-run cannot make the UI and the actual run disagree
    patch(q.queueId, { status: 'running', progress: 0, log: [], counterLog: [], error: null,
                        snapshot: item, startedAt: now() });

    controller = new AbortController();
    const cfg = buildConfig(item);
    const spec = buildSpec(item, makeFakeTestFn(item, { resultDelaySeconds: fakeResultDelaySeconds }));

    const log = [];
    const counterLog = [];
    let doneFramesizes = 0;
    const onProgress = ev => {
      if (ev.phase === 'framesize-end') {
        doneFramesizes += 1;
        patch(q.queueId, { progress: overallProgress(item, { doneFramesizes, iteration: 0 }) });
        return;
      }
      if (ev.phase === 'iteration-result') {
        counterLog.push({
          framesize: ev.framesize, iteration: ev.iteration,
          target: ev.target, raw: ev.raw, checked: ev.checked,
        });
        patch(q.queueId, { counterLog: [...counterLog] });
        return;
      }
      if (ev.phase !== 'iteration') return;
      log.push(`framesize ${ev.framesize} · 第 ${ev.iteration} 輪 · ${ev.target}`);
      patch(q.queueId, {
        log: [...log],
        progress: overallProgress(item, { doneFramesizes, iteration: ev.iteration }),
      });
    };

    try {
      const { results, cancelled } = await runTest(cfg, spec, {
        signal: controller.signal, onProgress,
      });
      patch(q.queueId, {
        status: cancelled ? 'cancelled' : 'done',
        progress: 1, lastResult: results, finishedAt: now(),
      });
    } catch (err) {
      // a run error fails this item, but the batch continues
      patch(q.queueId, { status: 'failed', error: String(err?.message ?? err), finishedAt: now() });
    } finally {
      controller = null;
    }
  }

  return {
    isBusy: () => busy,

    abortCurrent() { controller?.abort(); },

    abortAll() {
      stopAll = true;
      controller?.abort();
    },

    async start() {
      if (busy) return;
      busy = true;
      stopAll = false;

      try {
        for (;;) {
          if (stopAll) break;
          const q = nextRunnable(store.getState());
          if (!q) break;

          await runOne(q);
        }
      } finally {
        if (stopAll) {
          for (const x of store.getState().queue) {
            if (x.status === 'queued') patch(x.queueId, { status: 'idle' });
          }
        }
        busy = false;
      }
    },
  };
}
