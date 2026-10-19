/**
 * Assembles state.queue/state.items into the sheets shape that
 * engine/xlsx-writer.js's buildXlsx() takes. This layer knows XMNT's data model
 * (items, queue entries, recipes); xlsx-writer.js does not need to.
 */

import { DIMENSIONS } from '../engine/catalog.js';
import { DIMENSION_LABELS } from './messages.js';
import { portFieldsFor } from './item-edit.js';
import { portKey } from './project.js';
import { buildConfig } from './spec-build.js';
import { reportLabel } from './report-labels.js';
import { MEDIA_SPEED, MEDIA_SPEED_BPS } from '../engine/nuconst.js';
import { chartDataFor } from './chart-data.js';
import {
  summarize, transposeDetailAcrossFramesizes, meshPortLabel, summaryTableAcrossFramesizes,
} from './format.js';

/** Alternate row shading: row 0 unshaded, row 1 shaded, and so on. */
function stripeStyle(index) {
  return index % 2 === 1 ? 'stripe' : undefined;
}

const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g;

/** Excel sheet name rules: none of \/?*[]:, at most 31 characters, unique within the workbook. */
export function sanitizeSheetName(rawName, usedNames) {
  const base = rawName.replace(INVALID_SHEET_CHARS, '_').slice(0, 31) || 'Sheet';
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    const tail = `~${suffix}`;
    candidate = base.slice(0, 31 - tail.length) + tail;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function recipeLabel(item, dim) {
  const chosen = item.recipe?.[dim];
  const names = Array.isArray(chosen) ? chosen : [chosen];
  const labels = names.filter(Boolean).map(n => reportLabel(dim, n));
  return labels.length ? labels.join(' + ') : '(none selected)';
}

function portsText(item) {
  const fields = portFieldsFor(item);
  if (fields.length === 0) return '(none)';
  return fields.map(field => {
    const v = item.ports?.[field];
    if (v == null) return `${field}: (unspecified)`;
    const text = Array.isArray(v[0]) ? v.map(portKey).join(' ') : portKey(v);
    return `${field}: ${text}`;
  }).join(', ');
}

function formatTimestamp(ms) {
  return ms == null ? '—' : new Date(ms).toLocaleString('en-US', { hour12: false });
}

/**
 * Verdict-logic descriptions, reusing the text the editor in ui/view-editor.js already
 * shows rather than inventing new wording: the three shape.kind labels match the editor's
 * listbox options verbatim, and the pure_send description matches its fixed hint text.
 * The editor has no plain-language description of check functions (the dropdown shows the
 * raw strings: checks.map(c => [c, c])), so neither does this.
 */
const SHAPE_LABELS = { convergence: '收斂', single: '單次判定', measurement: '量測(無判定)' };

const PURE_SEND_NOTE = '自定封包的判定固定為:送出數等於 PCAP 的封包數,'
  + '且 Monitor 埠沒有收到不該收到的封包。';

function checkDescription(item) {
  const kind = item.shape?.kind;
  if (kind === 'measurement') return SHAPE_LABELS.measurement;
  if (kind === 'pure_send') return PURE_SEND_NOTE;
  if (!item.shape?.check) return '—';
  return `${SHAPE_LABELS[kind] ?? kind}(${item.shape.check})`;
}

function labelRow(label, value) {
  return { cells: [
    { value: `${label}:`, style: 'borderedRight' },
    { value, style: 'bordered' },
  ] };
}

function basicInfoRows(item, q, pcId, simulate) {
  const cfg = buildConfig(item);
  const rows = [
    // Span only 2 columns (title + one empty cell), matching the 2-column "label: value"
    // layout of the basic info; spanning 5 columns added 3 meaningless empty blue cells
    // that stuck out.
    { cells: [{ value: item.name, style: 'headerBlueCenter' },
              { value: '', style: 'headerBlue' }],
      style: 'headerBlue' },
    // This row is centered across columns too. 'center' is a plain-text centering style,
    // unlike the title banner's headerBlueCenter (bold white on blue); no fill or bold here.
    { cells: [{ value: `Benchmark : ${item.name}, Topology : ${recipeLabel(item, 'topology')}, `
      + `Duration : ${cfg.tx_duration_time} sec.`, style: 'center' }] },
    labelRow('Test Type', DIMENSIONS.map(d => recipeLabel(item, d)).join(' / ')),
    labelRow('Pass/Fail Criteria', checkDescription(item)),
    labelRow('Ports', portsText(item)),
    labelRow('Frame Size', cfg.mode_framesize === 0
      ? cfg.framesize_custom.join(', ')
      : `${cfg.framesize_start}~${cfg.framesize_stop} (step ${cfg.framesize_step})`),
    labelRow('TX Duration (s)', cfg.tx_duration_time),
  ];
  if (item.shape?.kind === 'convergence') {
    rows.push(labelRow('Convergence Range',
      `${cfg.target_min} ~ ${cfg.target_max} (resolution ${cfg.target_resolution})`));
  }
  rows.push(labelRow('Mode', simulate ? 'Simulation' : `Real Hardware (${pcId ?? 'Unidentified'})`));
  rows.push(labelRow('Start / End Time',
    `${formatTimestamp(q.startedAt)} ~ ${formatTimestamp(q.finishedAt)}`));
  if (!q.snapshot) {
    rows.push({ cells: ['⚠ Settings shown reflect current values, which may differ from what ran'],
                style: 'warning' });
  }
  return rows;
}

/**
 * Value columns (after the first) are always right-aligned, numeric or not, so values and
 * labels are distinguishable at a glance; non-numeric values like true/— must not break
 * the alignment by defaulting to left-aligned text.
 *
 * When isPassedRow is true (the label column is "passed" and the value is a boolean) the
 * cell uses colored PASS/FAIL text matching the PDF export (ui/export-pdf.js:dataTableOps())
 * instead of plain true/false. This is separate from the Overview sheet's dark-filled
 * pass/fail styles; neither affects the other.
 */
function matrixValueCell(value, isPassedRow = false) {
  if (isPassedRow && typeof value === 'boolean') {
    return value ? { value: 'PASS', style: 'passGreen' } : { value: 'FAIL', style: 'failRed' };
  }
  if (typeof value === 'number') {
    return { value, style: Number.isInteger(value) ? 'borderedInt' : 'borderedFloat' };
  }
  return { value, style: 'borderedRight' };
}

function detailMatrixRows(results, item) {
  const { columns, rows } = transposeDetailAcrossFramesizes(results, item);
  if (columns.length === 0) return [];
  return [
    { cells: ['Metric', ...columns.map(c => ({ value: c, style: 'headerBlueBorderedRight' }))],
      style: 'headerBlueBordered' },
    ...rows.map(([identity, ...values]) => ({
      cells: [identity, ...values.map(v => matrixValueCell(v, identity === 'passed'))],
      style: 'bordered',
    })),
  ];
}

// --- XY grid for mesh matrix (pairwise_matrix) results ---
// Design shared with ui/export-pdf.js: ports as row/column headers, with tx/rx separate
// and centered, rather than flattened into a long "sender -> receiver tx/rx" list. With
// many frame sizes there is one grid per frame size. The PDF export lays out the tx/rx
// cells and dividers by hand; in Excel two physical rows (Tx row, Rx row) with
// borderedCenter cell borders act as dividers, with no extra lines drawn.

/** If any frame size's result has pairwise_matrix or pairwise_latency_matrix, the whole item
 *  is drawn as XY grids. The former matches how the PDF export's isMeshResults() and
 *  engine/checks.js:checkLossBasedWithDetail() decide "is this a mesh result"; the latter
 *  is the per-pair latency matrix from FullyMesh/ManyToMany with the StreamLatency reader
 *  (see read() in engine/recipe-assembly.js), which used to be unrecognized everywhere,
 *  so its data never appeared. */
function isMeshResults(results) {
  return Object.values(results ?? {}).some(r => r?.pairwise_matrix || r?.pairwise_latency_matrix);
}

/** Find which per-pair matrix a framesize result actually carries; the two shapes are
 *  mutually exclusive, so a result never has both. */
function meshMatrixOf(result) {
  return result?.pairwise_matrix ?? result?.pairwise_latency_matrix ?? null;
}

/** Port indexes are taken from the matrix's own keys (e.g. "40->41") and sorted, without
 *  relying on item.ports.mesh_ports having a matching length. Same logic as the function
 *  of the same name in ui/export-pdf.js; each file declares its own copy because the two
 *  targets (PDF content stream vs. Excel cells) share no intermediate structure worth
 *  extracting. */
function meshMatrixAxis(item, matrix) {
  const indexSet = new Set();
  for (const key of Object.keys(matrix)) {
    const [a, b] = key.split('->');
    indexSet.add(a);
    indexSet.add(b);
  }
  const indexes = [...indexSet].sort((x, y) => Number(x) - Number(y));
  const labels = indexes.map(idx => meshPortLabel(item, idx));
  return { indexes, labels };
}

/**
 * The XY grid for one frame size. After the header row (empty corner cell + receiving
 * port labels), a tx/rx matrix (pairwise_matrix) gives each sending port two physical
 * rows (Tx row, Rx row). The sender label is written only on the Tx row; the Rx row is
 * left empty and the two are merged vertically via the sheet.merges built by the caller
 * (meshDetailRows()), so each port label appears once, centered across both rows. A
 * latency matrix (pairwise_latency_matrix) gives each sender a single row, since each
 * pair has one number and no tx/rx split. Cells without data (e.g. a port paired with
 * itself) show — on the Tx row with the Rx row left empty for a tx/rx matrix, and — for
 * a latency matrix.
 *
 * Returns { rows, merges }: merges holds 0-based [Tx row index, Rx row index] pairs
 * relative to this function's own rows array; the caller (meshDetailRows()) adds the
 * block's real starting row to build the actual cell ranges.
 */
/**
 * The same number format as ui/export-pdf.js:formatTableNumber(). Mesh cell values are
 * mixed with "Tx "/"Rx " prefixes, so they cannot rely on a numFmt style like
 * matrixValueCell(); the same thousands-separator + up-to-3-decimals format is applied
 * in JS before building the string.
 */
function formatMeshCellNumber(value) {
  if (typeof value !== 'number') return String(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function meshGridRows(item, framesize, matrix) {
  const { indexes, labels } = meshMatrixAxis(item, matrix);
  const isLatency = 'latency' in (Object.values(matrix)[0] ?? {});
  const rows = [
    { cells: [`Frame Size: ${framesize} bytes`], style: 'bold' },
    { cells: ['', ...labels.map(l => ({ value: l, style: 'headerBlueBorderedCenter' }))],
      style: 'headerBlueBorderedCenter' },
  ];
  const merges = [];
  labels.forEach((rowLabel, i) => {
    if (isLatency) {
      const cells = [{ value: rowLabel, style: 'headerBlueBorderedCenter' }];
      labels.forEach((_, j) => {
        const cell = matrix[`${indexes[i]}->${indexes[j]}`];
        cells.push({ value: cell ? formatMeshCellNumber(cell.latency ?? '—') : '—', style: 'borderedCenter' });
      });
      rows.push({ cells });
      return;
    }
    const txRowIndex = rows.length;
    const txCells = [{ value: rowLabel, style: 'headerBlueBorderedCenter' }];
    const rxCells = [{ value: '', style: 'headerBlueBorderedCenter' }];
    labels.forEach((_, j) => {
      const key = `${indexes[i]}->${indexes[j]}`;
      const cell = matrix[key];
      if (cell) {
        txCells.push({ value: `Tx ${formatMeshCellNumber(cell.tx_packets ?? '—')}`, style: 'borderedCenter' });
        rxCells.push({ value: `Rx ${formatMeshCellNumber(cell.rx_packets ?? '—')}`, style: 'borderedCenter' });
      } else {
        txCells.push({ value: '—', style: 'borderedCenter' });
        rxCells.push({ value: '', style: 'borderedCenter' });
      }
    });
    rows.push({ cells: txCells });
    rows.push({ cells: rxCells });
    merges.push([txRowIndex, txRowIndex + 1]);
  });
  return { rows, merges };
}

/** One XY grid per frame size, in the order of the results keys, separated by an empty
 *  row. This is an alternative to detailMatrixRows(); itemSheet() uses exactly one of them.
 *
 * A FullyMesh convergence test shows its converged result first. The scalar fields next
 * to the matrix object (passed, the resultKey converged value) had nowhere to appear,
 * because this path bypasses transposeDetailAcrossFramesizes() (which already handles the
 * same issue for detailMatrixRows()'s flattened table). So a summary is inserted here,
 * reusing matrixValueCell() to keep its number/right-alignment rules and match
 * detailMatrixRows()'s header/data row styles.
 *
 * Returns { rows, merges }: merges holds 0-based [Tx row index, Rx row index] pairs
 * relative to this function's rows (the same relative coordinates as meshGridRows()).
 * itemSheet() knows where the block lands in the sheet, adds the offset, and builds the
 * real "A${row}:A${row}" strings for sheet.merges.
 */
function meshDetailRows(results, item) {
  const rows = [];
  const merges = [];
  const summary = summaryTableAcrossFramesizes(results);
  if (summary.rows.length > 0) {
    rows.push(
      { cells: ['Metric', ...summary.columns.map(c => ({ value: c, style: 'headerBlueBorderedRight' }))],
        style: 'headerBlueBordered' },
      ...summary.rows.map(([identity, ...values]) => ({
        cells: [identity, ...values.map(v => matrixValueCell(v, identity === 'passed'))],
        style: 'bordered',
      })),
    );
  }
  for (const [fs, result] of Object.entries(results)) {
    const matrix = meshMatrixOf(result);
    if (!matrix) continue;
    if (rows.length > 0) rows.push({ cells: [] });
    const base = rows.length;
    const grid = meshGridRows(item, fs, matrix);
    rows.push(...grid.rows);
    for (const [r1, r2] of grid.merges) merges.push([base + r1, base + r2]);
  }
  return { rows, merges };
}

function chartFor(item, results, contentRowCount) {
  const data = chartDataFor(item, results);
  if (!data) return null;
  return { ...data, anchorRow: contentRowCount + 1 };
}

function resolveItemForSheet(state, q) {
  return q.snapshot ?? state.items.find(i => i.id === q.itemId) ?? null;
}

/**
 * The four tx/rx/loss columns for one measurement round. detail may be a single cell of a
 * mesh per-pair matrix (only tx_packets/rx_packets) or a non-mesh checked/raw result (which
 * may also carry loss_packets/loss_rate computed by checkLossBased, or may lack even
 * tx_packets, e.g. the result of a plain MonitorReceived check). Missing fields show —
 * rather than made-up numbers: only what was actually measured is shown.
 */
function packetColumns(detail) {
  const tx = detail?.tx_packets;
  const rx = detail?.rx_packets;
  if (tx == null || rx == null) return [tx ?? '—', rx ?? '—', '—', '—'];
  const loss = detail.loss_packets ?? Math.max(0, tx - rx);
  const lossRate = detail.loss_rate ?? (tx ? (loss / tx) * 100 : 0);
  return [tx, rx, loss, lossRate];
}

/** Shows — when there is no explicit port data (the item sets no fixed tx_port/rx_port), rather than guessing. */
function portCell(port) {
  return port ? portKey(port) : '—';
}

function counterReportRows(state) {
  const rows = [{ cells: ['Item', 'Frame Size', 'Iteration', 'Tx Port', 'Rx Port',
                           'Target', 'Tx Packets', 'Rx Packets', 'Loss', 'Loss (%)'],
                  style: 'headerBlue' }];
  let dataIndex = 0;
  for (const q of state.queue) {
    const item = resolveItemForSheet(state, q);
    if (!item || !q.counterLog?.length) continue;
    for (const entry of q.counterLog) {
      const detail = entry.checked ?? entry.raw;
      const matrix = detail?.pairwise_matrix ?? detail?.pairwise_error_matrix;
      if (matrix) {
        // Mesh/pairwise results: one counterLog entry expands into one row per
        // sender->receiver pair. Keys are "tx->rx" (pairwise_matrix) or
        // "tx->rx->errorType" (pairwise_error_matrix); only the first two parts become
        // Tx/Rx Port and the error type gets no column of its own (rows for the same port
        // pair with different error types share the Tx/Rx Port display, while their tx/rx
        // numbers stay separate). Indexes are mapped to real port addresses with
        // format.js's meshPortLabel(), the same mapping as the detailed data grid, so
        // there is only one copy of it.
        for (const [key, cell] of Object.entries(matrix)) {
          const [txPort, rxPort] = key.split('->');
          rows.push({ style: stripeStyle(dataIndex), cells: [
            item.name, entry.framesize, entry.iteration,
            meshPortLabel(item, txPort), meshPortLabel(item, rxPort),
            entry.target ?? '—', ...packetColumns(cell),
          ] });
          dataIndex += 1;
        }
      } else {
        rows.push({ style: stripeStyle(dataIndex), cells: [
          item.name, entry.framesize, entry.iteration,
          portCell(item.ports?.tx_port), portCell(item.ports?.rx_port),
          entry.target ?? '—', ...packetColumns(detail),
        ] });
        dataIndex += 1;
      }
    }
  }
  return rows;
}

const STANDARD_MEDIA_RATES = [
  { label: '10M', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.M10] },
  { label: '100M', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.M100] },
  { label: '1G', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.G1] },
  { label: '2.5G', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.G2P5] },
  { label: '5G', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.G5] },
  { label: '10G', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.G10] },
];

/** Theoretical frame rate (fps) at 100% line rate, using the same formula as
 *  ui/fake-dut.js:counters() and engine/backend.js:estimateBurstDuration() (each
 *  Ethernet frame carries 20 bytes of overhead: 8-byte preamble incl. SFD + 12-byte
 *  minimum gap), so the project has a single conversion formula. */
function theoreticalMaxFps(framesize, bps) {
  const bytePerSec = Math.floor(bps / 8);
  return Math.floor(bytePerSec / (framesize + 20));
}

/**
 * The set of frame sizes comes from counterLog, not lastResult: the theoretical table
 * should show the frame sizes this report actually ran, consistent with the data source
 * of the Counter Report itself, while lastResult may hold an older snapshot out of sync
 * with counterLog.
 */
function allFrameSizesFromCounterLog(state) {
  const sizes = new Set();
  for (const q of state.queue) {
    for (const entry of q.counterLog ?? []) sizes.add(entry.framesize);
  }
  return [...sizes].sort((a, b) => a - b);
}

function theoreticalMaxFrameRateRows(state) {
  const sizes = allFrameSizesFromCounterLog(state);
  if (sizes.length === 0) return [];
  return [
    { cells: [] },
    { cells: ['Theoretical Maximum Frame Rate (fps @ 100% line rate)'], style: 'bold' },
    { cells: ['Frame Size (bytes)', ...STANDARD_MEDIA_RATES.map(r => r.label)], style: 'headerBlue' },
    // alternate light-grey shading, consistent with the detailed log table.
    ...sizes.map((fs, i) => ({
      style: stripeStyle(i),
      cells: [fs, ...STANDARD_MEDIA_RATES.map(r => theoreticalMaxFps(fs, r.bps))],
    })),
  ];
}

function counterReportSheet(state) {
  return { name: 'Counter Report',
           rows: [...counterReportRows(state), ...theoreticalMaxFrameRateRows(state)],
           chart: null };
}

function itemSheet(state, q, usedNames) {
  const item = resolveItemForSheet(state, q);
  if (!item) return null;

  const results = q.lastResult ?? {};
  // detailMatrixRows() needs no merged cells; an empty merges array keeps the same
  // { rows, merges } shape as meshDetailRows(), so itemSheet() handles both cases with
  // the same logic and no extra branch.
  const detail = isMeshResults(results)
    ? meshDetailRows(results, item)
    : { rows: detailMatrixRows(results, item), merges: [] };
  const preRows = [
    ...basicInfoRows(item, q, state.pcId, state.simulate),
    { cells: [] },
    { cells: ['Detailed Test Data'], style: 'bold' },
  ];
  // detail.merges holds 0-based row indexes relative to detail.rows; adding the number of
  // preRows gives the block's actual row numbers in the sheet, which are then turned into
  // Excel's 1-based "A${row}:A${row}" range strings.
  const offset = preRows.length;
  const rows = [
    ...preRows,
    ...detail.rows,
    { cells: [] },
    { cells: ['Chart Report'], style: 'bold' },
    { cells: [] },
  ];
  const merges = detail.merges.map(([r1, r2]) => `A${offset + r1 + 1}:A${offset + r2 + 1}`);

  return { name: sanitizeSheetName(item.name, usedNames), rows, merges,
           chart: chartFor(item, results, rows.length) };
}

/**
 * Only the single-verdict shapes (single/pure_send) have a passed value that is a
 * meaningful final conclusion. For convergence/measurement, passed is just the verdict
 * of the loop's last measurement, not the test's conclusion (the converged number in the
 * result summary is), so this column always shows —.
 */
function verdictCell(item, passed) {
  const showsVerdict = item.shape?.kind === 'single' || item.shape?.kind === 'pure_send';
  if (!showsVerdict || passed == null) return '—';
  return passed ? { value: 'Pass', style: 'pass' } : { value: 'Fail', style: 'fail' };
}

function overviewSheet(state) {
  const rows = [{ cells: ['Name', 'Test Type', 'Status', 'Pass/Fail', 'Result Summary'], style: 'headerBlue' }];
  let dataIndex = 0;
  for (const q of state.queue) {
    const item = state.items.find(i => i.id === q.itemId);
    if (!item) continue;
    const s = summarize(item, q.lastResult);
    rows.push({ style: stripeStyle(dataIndex), cells: [
      item.name,
      recipeLabel(item, 'stream'),
      q.status,
      verdictCell(item, s.passed),
      s.headline,
    ] });
    dataIndex += 1;
  }
  return { name: 'Overview', rows, chart: null, freezeHeaderRow: true, autoFilter: true };
}

export function buildReportSheets(state) {
  const usedNames = new Set(['Overview', 'Counter Report']);
  const sheets = [overviewSheet(state), counterReportSheet(state)];
  for (const q of state.queue) {
    if (!q.lastResult) continue;
    const sheet = itemSheet(state, q, usedNames);
    if (sheet) sheets.push(sheet);
  }
  return sheets;
}
