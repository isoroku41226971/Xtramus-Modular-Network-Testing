/**
 * Turns runTestItem results into what the UI displays, plus progress estimates. Pure functions, no DOM.
 */

import { portKey } from './project.js';

const num = v => (typeof v === 'number' ? Number(v.toFixed(3)) : v);

export function oneLine(item, result) {
  if (!result) return '—';

  const key = item.shape?.resultKey;
  if (key && result[key] != null) return `${key} ${num(result[key])}`;
  if (result.latency != null) return `latency ${num(result.latency)}`;
  if (result.pairwise_matrix) return `${Object.keys(result.pairwise_matrix).length} 對`;
  if (result.pairwise_error_matrix) return `${Object.keys(result.pairwise_error_matrix).length} 對`;
  if (result.per_type) return `${Object.keys(result.per_type).length} 種錯誤`;
  if (result.rx_packets != null) return `rx ${result.rx_packets}`;
  return result.passed === true ? '通過' : result.passed === false ? '未通過' : '—';
}

export function summarize(item, results) {
  const entries = Object.entries(results ?? {});
  const rows = entries.map(([framesize, r]) => ({
    label: String(framesize),
    value: oneLine(item, r),
    passed: r?.passed ?? null,
  }));

  // a measurement has no pass/fail by definition; otherwise one failing framesize means a fail
  const verdicts = entries.map(([, r]) => r?.passed).filter(v => typeof v === 'boolean');
  const passed = verdicts.length === 0 ? null : verdicts.every(Boolean);

  const headline = rows.length === 0 ? '—'
    : rows.length === 1 ? rows[0].value
    : `${rows.length} 個 framesize`;

  return { headline, passed, rows };
}

/**
 * How many iterations one framesize is expected to take.
 *
 * onProgress only provides the iteration number, not the search interval, so the
 * expected total is inferred from cfg.
 */
export function expectedIterations(item) {
  if (item.shape?.kind !== 'convergence') return 1;

  const c = item.cfg ?? {};
  const min = c.target_min ?? 1;
  const max = c.target_max ?? 100;
  const span = Math.max(1e-9, max - min);

  if (c.mode_convergence === 1) {
    return Math.max(1, Math.ceil(span / (c.target_step ?? 10)));
  }
  return Math.max(1, Math.ceil(Math.log2(span / (c.target_resolution ?? 0.01))));
}

export function overallProgress(item, { doneFramesizes = 0, iteration = 0 } = {}) {
  const total = (item.cfg?.framesize_custom ?? [64]).length || 1;
  const within = Math.min(1, iteration / expectedIterations(item));
  return Math.min(1, (doneFramesizes + within) / total);
}

/**
 * Whether the result can be reduced to a single number for a chart. Deliberately
 * narrower than oneLine(): oneLine always returns a string (for people), while matrix /
 * per-type / per-port results have no single number to plot, so this returns null and
 * the caller decides from that whether the item gets a chart.
 */
/**
 * Decide which result field the chart uses: shape.resultKey when it matches, otherwise
 * latency (e.g. after ui/item-edit.js:setDimension() downgrades shape.kind to
 * measurement, resultKey may be a stale value with no matching field). Returns the field
 * name actually used, not its value: chartableValue() and
 * ui/chart-data.js:chartValueMeta() must both decide from this name instead of each
 * checking shape.resultKey on its own. They once did, which caused a bug where the
 * axis metadata disagreed with the plotted value: with a stale resultKey of
 * 'throughput', chartableValue() already fell back to latency but chartValueMeta() did
 * not, so latency charts got the fixed 0-100% throughput axis.
 */
export function resolveChartField(item, result) {
  if (!result) return null;
  const key = item.shape?.resultKey;
  if (key && typeof result[key] === 'number') return key;
  if (typeof result.latency === 'number') return 'latency';
  return null;
}

export function chartableValue(item, result) {
  const field = resolveChartField(item, result);
  return field ? result[field] : null;
}

// --- detail expansion ---

const cell = v => (v == null ? '—' : v);

// pairwise_matrix/pairwise_error_matrix keys are internal port indexes (e.g. "40"); the
// i-th index above this base maps to the i-th entry of the mesh port list. This matches
// the offset ui/fake-dut.js:meshMatrix() uses to generate indexes; keep the two in sync.
const MESH_PORT_INDEX_BASE = 40;

/** The mesh port list in item.ports: FullyMesh uses mesh_ports; ManyToMany has no separate
 *  per-pair mapping yet and falls back to mesh_rx_ports (the same simplification as
 *  fake-dut.js:meshMatrix(); the two must agree). */
function meshPortList(item) {
  return item?.ports?.mesh_ports ?? item?.ports?.mesh_rx_ports ?? [];
}

/** Map a port index string from a matrix key (e.g. "40") back to the real port address
 *  (e.g. "0/7/1"). Unmatched indexes are returned as-is, so a missing item/ports or a
 *  non-numeric index (placeholders like 'a'/'b' in tests) never breaks the UI. */
export function meshPortLabel(item, indexStr) {
  const port = meshPortList(item)[Number(indexStr) - MESH_PORT_INDEX_BASE];
  return port ? portKey(port) : indexStr;
}

function matrixRows(matrix, withErrorType, item) {
  return Object.entries(matrix).map(([k, v]) => {
    const parts = k.split('->');
    const base = withErrorType
      ? [meshPortLabel(item, parts[0]), meshPortLabel(item, parts[1]), parts[2]]
      : [meshPortLabel(item, parts[0]), meshPortLabel(item, parts[1])];
    return [...base, cell(v.tx_packets), cell(v.rx_packets)];
  });
}

function perPortRows(result) {
  const tx = result.tx_packets_by_port ?? {};
  const rx = result.rx_packets_by_port ?? {};
  const ports = [...new Set([...Object.keys(tx), ...Object.keys(rx)])]
    .sort((a, b) => Number(a) - Number(b));
  return ports.map(p => [p, cell(tx[p]), cell(rx[p])]);
}

/**
 * The detail for one framesize. All four shapes become columns + rows, so the view
 * draws only one kind of table.
 *
 * pairwise_error_matrix must be checked before pairwise_matrix: error-matrix keys are
 * triples, and splitting them as pairs would treat bad_crc as a receiving port.
 */
function detailFor(result, item) {
  if (result?.pairwise_error_matrix) {
    return { kind: 'per-type-matrix',
             columns: ['發送', '接收', '錯誤類型', 'tx', 'rx'],
             rows: matrixRows(result.pairwise_error_matrix, true, item) };
  }
  if (result?.pairwise_matrix) {
    return { kind: 'matrix',
             columns: ['發送', '接收', 'tx', 'rx'],
             rows: matrixRows(result.pairwise_matrix, false, item) };
  }
  if (result?.per_type) {
    return { kind: 'per-type',
             columns: ['錯誤類型', 'tx', 'rx'],
             rows: Object.entries(result.per_type)
               .map(([t, v]) => [t, cell(v.tx_packets), cell(v.rx_packets)]) };
  }
  if (result?.tx_packets_by_port || result?.rx_packets_by_port) {
    return { kind: 'per-port', columns: ['埠', 'tx', 'rx'], rows: perPortRows(result) };
  }
  return {
    kind: 'plain', columns: ['欄位', '值'],
    rows: Object.entries(result ?? {})
      .filter(([, v]) => v == null || typeof v !== 'object')
      .map(([k, v]) => [k, cell(v)]),
  };
}

/**
 * Using the same filter as detailFor()'s 'plain' branch, extract the scalar fields that
 * sit next to the detail object (matrix / per_type / ...), such as passed and the
 * resultKey converged value. The matrix / per-type-matrix / per-type / per-port branches
 * only look inside the object and used to ignore these sibling scalars entirely, so
 * Error Filtering's overall passed and a FullyMesh convergence test's converged value
 * never appeared in the detail table. The web view, PDF and Excel all extract them with
 * this same rule so they display consistently.
 */
export function summaryFieldsOf(result) {
  return Object.entries(result ?? {}).filter(([, v]) => v == null || typeof v !== 'object');
}

/**
 * Transpose the per-framesize scalars from summaryFieldsOf() into a "column = frame
 * size" matrix, the same shape transposeDetailAcrossFramesizes() produces. Used by the
 * PDF/Excel mesh XY grids to insert a summary before drawing the grid (that path bypasses
 * transposeDetailAcrossFramesizes() entirely, so it is computed separately).
 */
export function summaryTableAcrossFramesizes(results) {
  const framesizes = Object.keys(results ?? {});
  const rowsByKey = new Map();
  for (const fs of framesizes) {
    for (const [k, v] of summaryFieldsOf(results[fs])) {
      if (!rowsByKey.has(k)) rowsByKey.set(k, {});
      rowsByKey.get(k)[fs] = v;
    }
  }
  return {
    columns: framesizes,
    rows: [...rowsByKey.entries()].map(([label, byFs]) =>
      [label, ...framesizes.map(fs => byFs[fs] ?? '—')]),
  };
}

/**
 * Transpose detailFor()'s "one table per framesize" into a matrix with "column = frame
 * size, row = detail key determined by the result kind", following the compact layout
 * of the reference report.
 *
 * It reuses detailFor()'s kind detection and row extraction, writing into one column of
 * the matrix instead of a separate table. It assumes every framesize of an item has the
 * same result kind (reader/check are recipe-level settings that do not vary by framesize).
 *
 * The matrix / per-type-matrix / per-type / per-port kinds extract only the object's
 * detail and ignore sibling scalars; the 'plain' kind already is those scalars, so they
 * are not extracted twice. The summary (pass/fail or the converged result) comes before
 * the detail.
 */
export function transposeDetailAcrossFramesizes(results, item) {
  const framesizes = Object.keys(results ?? {});
  if (framesizes.length === 0) return { columns: [], rows: [] };

  const firstDetail = detailFor(results[framesizes[0]], item);
  const valueColumnCount = firstDetail.columns.includes('值') ? 1 : 2;
  const identityColumnCount = firstDetail.columns.length - valueColumnCount;

  const rowsByKey = new Map();   // rowKey -> { [framesize]: value }
  for (const fs of framesizes) {
    const { rows } = detailFor(results[fs], item);
    for (const row of rows) {
      const identity = row.slice(0, identityColumnCount).join(' → ');
      for (let vi = 0; vi < valueColumnCount; vi++) {
        const valueColName = firstDetail.columns[identityColumnCount + vi];
        const rowKey = valueColumnCount === 1 ? identity : `${identity} ${valueColName}`;
        if (!rowsByKey.has(rowKey)) rowsByKey.set(rowKey, {});
        rowsByKey.get(rowKey)[fs] = row[identityColumnCount + vi];
      }
    }
  }

  const summaryRows = firstDetail.kind === 'plain' ? [] : summaryTableAcrossFramesizes(results).rows;
  const detailRowsOut = [...rowsByKey.entries()].map(([label, byFs]) =>
    [label, ...framesizes.map(fs => byFs[fs] ?? '—')]);

  return {
    columns: framesizes,
    rows: [...summaryRows, ...detailRowsOut],
  };
}

/**
 * The same thousands-separator + up-to-3-decimals format as
 * ui/export-pdf.js:formatTableNumber() / ui/export-excel.js:matrixValueCell(), so the
 * live expanded table (detailRows()) and both exported reports show identical numbers.
 * Only numbers are formatted; other types (the — placeholder, the boolean passed, ...)
 * pass through unchanged.
 */
function formatCellNumber(v) {
  return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 3 }) : v;
}

/**
 * Rows from detailFor()/matrixRows() hold raw numbers for
 * transposeDetailAcrossFramesizes() (the flattened table in exported reports), which
 * needs raw numbers to transpose and compare values across frame sizes, so they cannot
 * become formatted strings there. The web view's expanded table needs no transposing, so
 * formatting is applied only in this layer (used only by detailRows()), leaving
 * detailFor() untouched; the two do not affect each other.
 */
function formatRow(row) {
  return row.map(formatCellNumber);
}

/**
 * Whether this framesize's result should be drawn as a mesh XY grid, using the same
 * criterion as isMeshResults() in export-pdf.js/export-excel.js (pairwise_matrix or
 * pairwise_latency_matrix). pairwise_error_matrix is deliberately excluded and keeps
 * detailFor()'s flattened table (both exported reports make the same exception; see
 * their comments). Without either key this returns null and the caller falls back to
 * detailFor(). This shape used to be unrecognized: pairwise_latency_matrix fell into
 * detailFor()'s plain branch, where its object values were filtered out and nothing
 * appeared at all.
 */
function meshGridFor(result, item) {
  const matrix = result?.pairwise_matrix ?? result?.pairwise_latency_matrix;
  if (!matrix) return null;

  const isLatency = 'latency' in (Object.values(matrix)[0] ?? {});
  const indexSet = new Set();
  for (const key of Object.keys(matrix)) {
    const [a, b] = key.split('->');
    indexSet.add(a);
    indexSet.add(b);
  }
  const indexes = [...indexSet].sort((x, y) => Number(x) - Number(y));
  const labels = indexes.map(idx => meshPortLabel(item, idx));

  const cellAt = key => {
    const c = matrix[key];
    if (!c) return null;
    if (isLatency) return [formatCellNumber(c.latency ?? '—')];
    return [`Tx ${formatCellNumber(c.tx_packets ?? '—')}`, `Rx ${formatCellNumber(c.rx_packets ?? '—')}`];
  };

  return {
    columnLabels: labels,
    rows: labels.map((rowLabel, i) => ({
      label: rowLabel,
      cells: labels.map((_, j) => cellAt(`${indexes[i]}->${indexes[j]}`)),
    })),
  };
}

/** Scalar fields next to the detail object (matrix / per_type / ...), formatted as
 *  [label, value] pairs for the web view's expanded table. Not needed for the 'plain'
 *  kind (those fields already are its rows, and repeating them would show duplicates). */
function summaryFor(detailKind, result) {
  if (detailKind === 'plain') return [];
  return summaryFieldsOf(result).map(([k, v]) => [k, formatCellNumber(v)]);
}

export function detailRows(item, results) {
  return Object.entries(results ?? {}).map(([framesize, r]) => {
    const grid = meshGridFor(r, item);
    if (grid) return { framesize: String(framesize), kind: 'mesh-grid', summary: summaryFor('mesh-grid', r), ...grid };

    const detail = detailFor(r, item);
    return { framesize: String(framesize), ...detail, rows: detail.rows.map(formatRow),
             summary: summaryFor(detail.kind, r) };
  });
}
