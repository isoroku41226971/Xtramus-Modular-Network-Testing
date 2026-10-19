/**
 * The test queue. Each entry transforms in place: pending -> running (progress bar +
 * per-round log) -> result (expandable detail).
 *
 * No jsdom, so this file has no automated tests. The logic lives in format.js.
 */

import { summarize, detailRows } from './format.js';

const STATUS_TEXT = {
  idle: '待執行', queued: '等待中', running: '執行中',
  done: '', failed: '失敗', cancelled: '已中斷',
};

const portsText = item => Object.values(item?.ports ?? {}).flat(2).join(',');

/** Colored PASS/FAIL text matching the PDF (ui/export-pdf.js) and Excel (passGreen/failRed)
 *  exports instead of plain true/false, so passed looks the same in all three. */
function passedSpan(value) {
  const span = document.createElement('span');
  span.className = value ? 'pass' : 'fail';
  span.textContent = value ? 'PASS' : 'FAIL';
  return span;
}

/** Flat table (plain/matrix/per-type-matrix/per-type/per-port): one row per entry; the first
 *  column identifies it (field name / sending port / error type ...) and the rest are values. */
function flatTable(d) {
  const table = document.createElement('table');
  const head = document.createElement('tr');
  for (const c of d.columns) {
    const th = document.createElement('th');
    th.textContent = c;
    head.append(th);
  }
  table.append(head);
  for (const r of d.rows) {
    const tr = document.createElement('tr');
    r.forEach((c, i) => {
      const td = document.createElement('td');
      if (i === 1 && r[0] === 'passed' && typeof c === 'boolean') {
        td.append(passedSpan(c));
      } else {
        td.textContent = c;
      }
      tr.append(td);
    });
    table.append(tr);
  }
  return table;
}

/**
 * Mesh XY grid (pairwise_matrix/pairwise_latency_matrix): ports as row/column headers, and
 * each cell holds the 1-2 lines of text already built by format.js:detailRows() (two for a
 * tx/rx matrix, one for a latency matrix), the same layout as the exported reports
 * (export-pdf.js/export-excel.js). Cells without data (a port with itself) show —.
 */
function meshGridTable(d) {
  const table = document.createElement('table');
  table.className = 'mesh-grid';
  const head = document.createElement('tr');
  head.append(document.createElement('th'));
  for (const label of d.columnLabels) {
    const th = document.createElement('th');
    th.textContent = label;
    head.append(th);
  }
  table.append(head);

  for (const row of d.rows) {
    const tr = document.createElement('tr');
    const rowTh = document.createElement('th');
    rowTh.textContent = row.label;
    tr.append(rowTh);
    for (const lines of row.cells) {
      const td = document.createElement('td');
      if (!lines) {
        td.textContent = '—';
      } else if (lines.length === 1) {
        td.textContent = lines[0];
      } else {
        const top = document.createElement('div');
        top.textContent = lines[0];
        const bottom = document.createElement('div');
        bottom.className = 'mesh-grid-rx';
        bottom.textContent = lines[1];
        td.append(top, bottom);
      }
      tr.append(td);
    }
    table.append(tr);
  }
  return table;
}

/** Scalar fields next to the detail object (matrix / per_type / ...), such as passed and the
 *  resultKey converged value, listed before the detailed table in a simple two-column
 *  key/value table that reuses the existing .detail table/th/td styles with no extra class. */
function summaryTable(summary) {
  const table = document.createElement('table');
  for (const [k, v] of summary) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.textContent = k;
    const td = document.createElement('td');
    if (k === 'passed' && typeof v === 'boolean') {
      td.append(passedSpan(v));
    } else {
      td.textContent = v;
    }
    tr.append(th, td);
    table.append(tr);
  }
  return table;
}

function detailTable(item, results) {
  const wrap = document.createElement('div');
  wrap.className = 'detail';
  for (const d of detailRows(item, results)) {
    const cap = document.createElement('div');
    cap.className = 'muted';
    cap.textContent = `framesize ${d.framesize}`;
    wrap.append(cap);

    if (d.summary?.length) wrap.append(summaryTable(d.summary));

    const table = d.kind === 'mesh-grid' ? meshGridTable(d) : flatTable(d);
    wrap.append(table);
  }
  return wrap;
}

function renderItem(q, item, idx, runner, store) {
  const box = document.createElement('div');
  box.className = `qitem ${q.status}`;

  // drag to reorder; running entries can't be dragged, since reordering mid-run would desync the progress
  if (q.status !== 'running') {
    box.draggable = true;
    box.dataset.idx = String(idx);
    box.ondragstart = ev => {
      ev.dataTransfer.setData('text/plain', String(idx));
      ev.dataTransfer.effectAllowed = 'move';
      box.classList.add('dragging');
    };
    box.ondragend = () => box.classList.remove('dragging');
    box.ondragover = ev => { ev.preventDefault(); box.classList.add('drop-target'); };
    box.ondragleave = () => box.classList.remove('drop-target');
    box.ondrop = ev => {
      ev.preventDefault();
      box.classList.remove('drop-target');
      const from = Number(ev.dataTransfer.getData('text/plain'));
      if (Number.isInteger(from)) {
        store.dispatch({ type: 'move-queue', from, to: idx });
      }
    };
  }

  const row = document.createElement('div');
  row.className = 'row';

  const left = document.createElement('span');
  const mark = q.status === 'done' ? '✔' : q.status === 'running' ? '▶'
    : q.status === 'failed' ? '✘' : '○';
  if (q.status !== 'running') {
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⠿';
    grip.title = '拖曳調整順序';
    left.append(grip);
  }
  left.append(`${mark} ${idx + 1}. ${item?.name ?? '(已刪除)'}　`);
  const ports = document.createElement('span');
  ports.className = 'muted';
  ports.textContent = portsText(item);
  left.append(ports);
  row.append(left);

  const right = document.createElement('span');
  let detail = null;

  if (q.status === 'running') {
    const stop = document.createElement('button');
    stop.textContent = '■ 中斷';
    stop.onclick = () => runner.abortCurrent();
    right.append(stop);
  } else {
    const sum = q.lastResult && item ? summarize(item, q.lastResult) : null;
    if (sum) {
      const verdict = document.createElement('b');
      verdict.textContent = `${sum.headline}　`;
      right.append(verdict);
    } else if (STATUS_TEXT[q.status]) {
      const t = document.createElement('span');
      t.className = 'muted';
      t.textContent = `${q.error ?? STATUS_TEXT[q.status]}　`;
      right.append(t);
    }

    if (q.status === 'queued') {
      // Already in this automatic batch and waiting for the previous entry to finish: pressing
      // "Run" again would be pointless (it is already queued, the runner is busy, and the
      // dispatch would just set the same state again). It becomes "Cancel" instead, which
      // takes the entry out of the batch and back to pending, without deleting it from the
      // queue the way the remove button does.
      const cancel = document.createElement('button');
      cancel.textContent = '取消';
      cancel.title = '從這一批自動執行中移除,退回待執行(不會整筆刪掉)';
      cancel.onclick = () => store.dispatch({ type: 'patch-queue', queueId: q.queueId,
                                               patch: { status: 'idle' } });
      right.append(cancel);
    } else {
      const go = document.createElement('button');
      go.textContent = q.status === 'idle' ? '▶ 執行' : '▶ 重跑';
      go.onclick = () => {
        store.dispatch({ type: 'patch-queue', queueId: q.queueId,
                         patch: { status: 'queued', error: null } });
        runner.start();
      };
      right.append(go);
    }

    if (q.lastResult && item) {
      const toggle = document.createElement('button');
      toggle.textContent = '▸ 展開';
      detail = detailTable(item, q.lastResult);
      detail.hidden = true;
      toggle.onclick = () => {
        detail.hidden = !detail.hidden;
        toggle.textContent = detail.hidden ? '▸ 展開' : '▾ 收合';
      };
      right.append(' ', toggle);
    }

    // running entries can't be removed; that branch only offers "Stop"
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = '從待測區移除';
    del.onclick = () => store.dispatch({ type: 'dequeue', queueId: q.queueId });
    right.append(' ', del);
  }

  row.append(right);
  box.append(row);
  if (detail) box.append(detail);

  if (q.status === 'running') {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = `${Math.round((q.progress ?? 0) * 100)}%`;
    bar.append(fill);

    const log = document.createElement('div');
    log.className = 'qlog';
    log.textContent = (q.log ?? []).join('\n');
    box.append(bar, log);
  }

  return box;
}

// The queue's "shape": every row's queueId + status, joined in order. Each convergence round
// dispatches a patch-queue to update progress/log, but status stays running, so when the
// shape is unchanged there is no full redraw, only an in-place update of that row's progress
// bar and log. Adding/removing/reordering or a status change (idle->running,
// running->done, ...) changes the shape and requires a redraw (the buttons and expandable
// sections tied to status must change too).
const shapeOf = queue => queue.map(q => `${q.queueId}:${q.status}`).join('|');

/** Update only the running row's progress bar and log, leaving other rows alone. With a single
 *  runner at most one entry runs at a time, so it can be found directly with no full diff. */
function patchRunning(el, queue) {
  const idx = queue.findIndex(q => q.status === 'running');
  if (idx < 0) return;
  const box = el.children[idx];
  if (!box) return;

  const fill = box.querySelector('.bar > i');
  if (fill) fill.style.width = `${Math.round((queue[idx].progress ?? 0) * 100)}%`;

  const log = box.querySelector('.qlog');
  if (log) {
    log.textContent = (queue[idx].log ?? []).join('\n');
    log.scrollTop = log.scrollHeight;   // the element is already in the document, so scrollHeight is measurable now
  }
}

export function mountQueue(el, store, runner) {
  let lastShape = null;

  const fullRender = queue => {
    const { items } = store.getState();
    const byId = new Map(items.map(i => [i.id, i]));
    el.replaceChildren();

    if (queue.length === 0) {
      const p = document.createElement('span');
      p.className = 'muted';
      p.textContent = '還沒有排入任何測試項。用上面的「↓ 全部加入 ↓」或卡片上的「排入待測區」。';
      el.append(p);
      return;
    }

    queue.forEach((q, idx) => {
      const row = renderItem(q, byId.get(q.itemId), idx, runner, store);
      el.append(row);
      const log = row.querySelector('.qlog');
      if (log) log.scrollTop = log.scrollHeight;
    });
  };

  const render = () => {
    const { queue } = store.getState();
    const shape = shapeOf(queue);

    // The shape is unchanged (same rows, same statuses); the running row's progress/log just
    // advanced a round, so instead of rebuilding the whole queue, update its progress bar and
    // scroll its log to the bottom.
    if (shape === lastShape) {
      patchRunning(el, queue);
      return;
    }

    lastShape = shape;
    fullRender(queue);
  };

  store.subscribe(render);
  render();
}
