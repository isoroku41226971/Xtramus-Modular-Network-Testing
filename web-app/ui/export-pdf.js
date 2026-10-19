/**
 * Builds the PDF page content for each test item: title + chart + data only, without
 * the basic info or Pass/Fail Criteria.
 */

import {
  textOperator, boldTextOperator, rectOperator, lineOperator, imageDrawOperator, helveticaWidth,
  A4_PORTRAIT, A4_LANDSCAPE, buildPdf,
} from '../engine/pdf-writer.js';
import { chartContent } from '../engine/pdf-chart.js';
import { chartDataFor } from './chart-data.js';
import { transposeDetailAcrossFramesizes, meshPortLabel, summaryTableAcrossFramesizes } from './format.js';
import { portKey } from './project.js';
import { MEDIA_SPEED, MEDIA_SPEED_BPS } from '../engine/nuconst.js';
import {
  XTRAMUS_LETTERHEAD_JPEG_BASE64, XTRAMUS_LETTERHEAD_WIDTH, XTRAMUS_LETTERHEAD_HEIGHT,
} from '../engine/xtramus-letterhead.js';

const FONT_RESOURCE = {
  F1: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  F2: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
};

/** The real Xtramus letterhead (logo + decorative rule + blue footer bar), extracted from
 *  the first page of a vendor reference report; see engine/xtramus-letterhead.js. Used
 *  only on portrait pages: the image is portrait, and stretching it over a landscape page
 *  (currently only the Counter Report) would distort it, so those pages fall back to
 *  hand-drawn blue bars (see withHeaderFooter). */
const LETTERHEAD_IMAGE_NAME = 'ImLetterhead';
const LETTERHEAD_IMAGE = {
  base64: XTRAMUS_LETTERHEAD_JPEG_BASE64,
  width: XTRAMUS_LETTERHEAD_WIDTH,
  height: XTRAMUS_LETTERHEAD_HEIGHT,
};

/** The project name may be Chinese text typed by the user, or the default (an "untitled
 *  project" label in Chinese); there is currently no UI to rename a project, so the user
 *  cannot avoid the default. The PDF embeds no CJK font, so a name with non-Latin-1
 *  characters is replaced by a generic English placeholder instead of making the whole
 *  export throw. (Test item names get a live warning in the editor; the project name has
 *  no matching input, so it degrades gracefully at export time instead.) */
function pdfSafeReportName(name) {
  if (!name) return 'XMNT Report';
  const isLatin1 = [...name].every(ch => ch.codePointAt(0) <= 0xFF);
  return isLatin1 ? name : 'XMNT Report';
}

// Greys matching Excel (the headerBlue/bordered styles in engine/xlsx-writer.js): every
// cell has gridlines, not just an outer frame and horizontal dividers, so tables look
// like the Excel export.
const TABLE_BORDER_GRAY = [0.55, 0.55, 0.55];
const TABLE_ROW_HEIGHT = 20;
const TABLE_HEADER_HEIGHT = 20;
const TABLE_LABEL_COL_WIDTH = 110;
const TABLE_FONT_SIZE = 9;
const TABLE_CELL_PAD = 6;

/**
 * Draw a real table (outer frame + header fill + full gridlines) instead of stacked plain
 * text. The header uses white bold text like Excel's headerBlue style; vertical and
 * horizontal gridlines run from the header to the last row, not just the outer frame.
 * The "passed" row is special: its boolean is drawn as colored PASS/FAIL instead of
 * plain true/false. It is matched by label, not position, because detailFor()'s 'plain'
 * kind keeps the object's original key order via Object.entries(), so passed is not
 * guaranteed to be first.
 */
/**
 * Split rows into page batches. The first batch uses firstCapacity (rows that fit on the
 * first page after the title/chart); later batches use contCapacity (rows that fit on a
 * continuation page from the top, usually more, since no title/chart space is needed).
 * An empty array returns [[]] (keeping the existing "always draw at least one page with
 * a header" behavior, so callers need not check for empty rows). Capacity is treated as
 * at least 1 to avoid an infinite loop when it is <= 0.
 */
function paginateRows(rows, firstCapacity, contCapacity) {
  if (rows.length === 0) return [[]];
  const chunks = [];
  let remaining = rows;
  let capacity = Math.max(1, firstCapacity);
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, capacity));
    remaining = remaining.slice(capacity);
    capacity = Math.max(1, contCapacity);
  }
  return chunks;
}

/**
 * The same number format as ui/export-excel.js:matrixValueCell(): integers with thousands
 * separators (Excel's #,##0), decimals with thousands separators and up to 3 places
 * (Excel's #,##0.###, so floating-point noise like 89.84400000000001 is rounded instead
 * of shown in full). Non-numbers (the — placeholder; PASS/FAIL is handled by the caller)
 * are shown with String().
 */
function formatTableNumber(value) {
  if (typeof value !== 'number') return String(value);
  return value.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function dataTableOps(columns, rows, x, topY, tableWidth) {
  const ops = [];
  const dataColWidth = (tableWidth - TABLE_LABEL_COL_WIDTH) / columns.length;
  const totalHeight = TABLE_HEADER_HEIGHT + rows.length * TABLE_ROW_HEIGHT;
  const tableBottom = topY - totalHeight;

  ops.push(rectOperator(x, tableBottom, tableWidth, totalHeight, { stroke: TABLE_BORDER_GRAY }));
  ops.push(rectOperator(x, topY - TABLE_HEADER_HEIGHT, tableWidth, TABLE_HEADER_HEIGHT, { fill: BRAND_BLUE }));

  // vertical gridlines spanning the header and all data rows, separating the Metric column from each frame size column.
  for (let j = 0; j < columns.length; j++) {
    const lineX = x + TABLE_LABEL_COL_WIDTH + j * dataColWidth;
    ops.push(lineOperator(lineX, topY, lineX, tableBottom, { stroke: TABLE_BORDER_GRAY }));
  }

  const headerTextY = topY - TABLE_HEADER_HEIGHT + (TABLE_HEADER_HEIGHT - TABLE_FONT_SIZE) / 2 + 2;
  ops.push(colored([1, 1, 1], boldTextOperator('Metric', x + TABLE_CELL_PAD, headerTextY, TABLE_FONT_SIZE)));
  columns.forEach((col, j) => {
    const colX = x + TABLE_LABEL_COL_WIDTH + j * dataColWidth;
    const label = String(col);
    const textX = colX + dataColWidth - TABLE_CELL_PAD - helveticaWidth(label, TABLE_FONT_SIZE);
    ops.push(colored([1, 1, 1], boldTextOperator(label, textX, headerTextY, TABLE_FONT_SIZE)));
  });

  rows.forEach(([label, ...values], i) => {
    const rowTop = topY - TABLE_HEADER_HEIGHT - i * TABLE_ROW_HEIGHT;
    const textY = rowTop - TABLE_ROW_HEIGHT + (TABLE_ROW_HEIGHT - TABLE_FONT_SIZE) / 2 + 2;
    // A divider under every row (including between the header and the first data row), not
    // just between data rows; the last row's bottom edge is covered by the outer frame.
    ops.push(lineOperator(x, rowTop, x + tableWidth, rowTop, { stroke: TABLE_BORDER_GRAY }));
    ops.push(colored(BLACK, textOperator(String(label), x + TABLE_CELL_PAD, textY, TABLE_FONT_SIZE)));

    values.forEach((value, j) => {
      const colX = x + TABLE_LABEL_COL_WIDTH + j * dataColWidth;
      const isPassedRow = label === 'passed' && typeof value === 'boolean';
      const text = isPassedRow ? (value ? 'PASS' : 'FAIL') : formatTableNumber(value);
      const color = isPassedRow ? (value ? GREEN : RED) : BLACK;
      const textX = colX + dataColWidth - TABLE_CELL_PAD - helveticaWidth(text, TABLE_FONT_SIZE);
      ops.push(colored(color, textOperator(text, textX, textY, TABLE_FONT_SIZE)));
    });
  });

  return ops;
}

const TITLE_FONT_SIZE = 20;
const SECTION_LABEL_FONT_SIZE = 10;
const CHART_BOX_HEIGHT = 260;
// Tables break to a new page when they get this close to the bottom; it equals the page
// margin (x=40), keeping the margins even on all four sides.
const PAGE_BOTTOM_MARGIN = 40;

function itemTableRowCapacity(topY) {
  return Math.max(1, Math.floor((topY - PAGE_BOTTOM_MARGIN - TABLE_HEADER_HEIGHT) / TABLE_ROW_HEIGHT));
}

/**
 * Shared skeleton for continuation pages (created automatically when a table does not
 * fit on the first page): the title marked (cont'd) plus a rule, without the chart (drawn
 * only once, on the first page). Returns the ops array and the y coordinate after the
 * skeleton, below which the caller lays out the section label and table. Continuation
 * pages of both flat tables (dataTableOps) and mesh grids (meshGridOps) use it.
 */
function itemContinuationShellOps(item) {
  const { width, height } = A4_PORTRAIT;
  const ops = [];
  const titleY = height - 58;
  ops.push(rectOperator(40, titleY - 4, 4, TITLE_FONT_SIZE, { fill: BRAND_BLUE }));
  ops.push(colored(BLACK, boldTextOperator(`${item.name} (cont'd)`, 52, titleY, TITLE_FONT_SIZE)));
  ops.push(lineOperator(40, titleY - 14, width - 40, titleY - 14, { stroke: BRAND_BLUE }));
  return { ops, y: titleY - 14 };
}

/**
 * The y coordinate of the table top on a continuation page (the skeleton's y minus one
 * section label's height). It is a separate function because drawing continuation
 * content and computing continuation capacity must use the same number. The y from
 * itemContinuationShellOps() is "skeleton done"; subtracting the label height gives
 * where the table actually starts.
 */
function itemContinuationTableTopY() {
  return itemContinuationShellOps({ name: '' }).y - 18 - 14;
}

/** Content of a continuation page (flat table version): the section label shows batch N of
 *  M, and the header is drawn again so readers need not flip back to see the columns. */
function itemContinuationPageOps(item, columns, rows, partIndex, partCount) {
  const { width } = A4_PORTRAIT;
  const shell = itemContinuationShellOps(item);
  const labelY = shell.y - 18;
  shell.ops.push(colored(BRAND_BLUE, boldTextOperator(
    `DETAILED TEST REPORT (${partIndex}/${partCount})`, 40, labelY, SECTION_LABEL_FONT_SIZE)));
  shell.ops.push(...dataTableOps(columns, rows, 40, itemContinuationTableTopY(), width - 80));
  return { content: shell.ops.join(' '), resources: FONT_RESOURCE };
}

// --- XY grid for mesh matrix (pairwise_matrix) results ---
// Design: ports as row/column headers, each cell showing Tx and Rx on two labelled lines
// (not squeezed onto one); with many frame sizes there is one grid per frame size rather
// than one combined table. This is a separate layout from dataTableOps (the Metric x
// Frame Size transposed table): the mesh matrix's two axes (sending/receiving ports)
// already occupy the rows and columns, leaving no room for frame size as a column, so
// each frame size gets its own grid.

/** If any frame size's result has pairwise_matrix or pairwise_latency_matrix, the whole item
 *  is drawn as XY grids. The former matches how engine/checks.js:checkLossBasedWithDetail()
 *  decides "is this a mesh result"; the latter is the per-pair latency matrix from
 *  FullyMesh/ManyToMany with the StreamLatency reader (see read() in
 *  engine/recipe-assembly.js), which used to be unrecognized everywhere, so the matrix
 *  data never appeared. Any per-stream mesh result is drawn as an XY grid. */
function isMeshResults(results) {
  return Object.values(results ?? {}).some(r => r?.pairwise_matrix || r?.pairwise_latency_matrix);
}

/** Find which per-pair matrix a framesize result actually carries; the two shapes are
 *  mutually exclusive, so a result never has both. */
function meshMatrixOf(result) {
  return result?.pairwise_matrix ?? result?.pairwise_latency_matrix ?? null;
}

/** Cell content of a per-pair matrix: two lines for a tx/rx matrix (pairwise_matrix), one
 *  line for a latency matrix (pairwise_latency_matrix), which has no tx/rx split. null
 *  means no data (e.g. a port paired with itself), and the caller draws a placeholder. */
function meshCellLines(matrix, key) {
  const cell = matrix[key];
  if (!cell) return null;
  if ('latency' in cell) return [formatTableNumber(cell.latency ?? '—')];
  return [`Tx ${formatTableNumber(cell.tx_packets ?? '—')}`, `Rx ${formatTableNumber(cell.rx_packets ?? '—')}`];
}

/** Port indexes are taken from the matrix's own keys (e.g. "40->41") and sorted, without
 *  relying on item.ports.mesh_ports having a matching length: the indexes that actually
 *  appear in the matrix are the real data source. Labels for the indexes come from the
 *  existing meshPortLabel() as real port addresses (e.g. "0/7/1"); unmatched indexes are
 *  shown as-is. */
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

const MESH_GRID_HEADER_HEIGHT = 20;
const MESH_GRID_LABEL_COL_WIDTH = 55;
// A tx/rx matrix cell holds two lines of text, so it is taller than a flat table's
// single-line row (TABLE_ROW_HEIGHT=20); a latency matrix (pairwise_latency_matrix) has one
// number per cell, so the flat table's single-line height is enough.
const MESH_GRID_ROW_HEIGHT_TWO_LINE = 30;
const MESH_GRID_ROW_HEIGHT_ONE_LINE = TABLE_ROW_HEIGHT;
const MESH_GRID_FONT_SIZE = 8;
const MESH_GRID_CELL_PAD = 4;
// The Tx/Rx divider is a lighter grey than the outer gridlines (TABLE_BORDER_GRAY): the
// gridlines separate different pairs, while this line separates the tx/rx of one pair, so
// it is lighter to show they belong together rather than being an equal boundary.
const MESH_GRID_DIVIDER_GRAY = [0.75, 0.75, 0.75];

/**
 * Draw an XY grid. colLabels/colIndexes are the columns (receiving ports, always the full
 * list; only rows are split across pages), and rowLabels/rowIndexes are the rows on this
 * page (sending ports, a slice of the full list when paginated). The row-header column
 * and the header row use bold white text on brand blue to mark them as axes, not data,
 * following pivot-table convention. cellFor(i, j) returns the cell's lines of text (1 or
 * 2; both matrix shapes share the same cell skeleton) or null (no data, e.g. a port with
 * itself, drawn as a placeholder). rowHeight must match the number of lines cellFor
 * returns; the caller picks it. With 2 lines a Tx/Rx divider is drawn; with 1 there is
 * nothing to divide.
 */
function meshGridOps(colLabels, colIndexes, rowLabels, rowIndexes, x, topY, tableWidth, rowHeight, cellFor) {
  const ops = [];
  const dataColWidth = (tableWidth - MESH_GRID_LABEL_COL_WIDTH) / colLabels.length;
  const totalHeight = MESH_GRID_HEADER_HEIGHT + rowLabels.length * rowHeight;
  const tableBottom = topY - totalHeight;

  ops.push(rectOperator(x, tableBottom, tableWidth, totalHeight, { stroke: TABLE_BORDER_GRAY }));
  ops.push(rectOperator(x, topY - MESH_GRID_HEADER_HEIGHT, tableWidth, MESH_GRID_HEADER_HEIGHT,
                        { fill: BRAND_BLUE }));
  ops.push(rectOperator(x, tableBottom, MESH_GRID_LABEL_COL_WIDTH, totalHeight, { fill: BRAND_BLUE }));

  for (let j = 0; j < colLabels.length; j++) {
    const lineX = x + MESH_GRID_LABEL_COL_WIDTH + j * dataColWidth;
    ops.push(lineOperator(lineX, topY, lineX, tableBottom, { stroke: TABLE_BORDER_GRAY }));
  }

  const headerTextY = topY - MESH_GRID_HEADER_HEIGHT + (MESH_GRID_HEADER_HEIGHT - MESH_GRID_FONT_SIZE) / 2 + 2;
  colLabels.forEach((label, j) => {
    const colX = x + MESH_GRID_LABEL_COL_WIDTH + j * dataColWidth;
    const textX = colX + (dataColWidth - helveticaWidth(label, MESH_GRID_FONT_SIZE)) / 2;
    ops.push(colored([1, 1, 1], boldTextOperator(label, textX, headerTextY, MESH_GRID_FONT_SIZE)));
  });

  // Only the two-line (tx/rx) layout gets Tx/Rx dividers, decided by the grid's row height
  // rather than per cell: the divider signals "this row has tx and rx", so it is drawn
  // whether or not a given cell has data; otherwise cells with data would have dividers
  // and empty ones would not, which looks inconsistent.
  const twoLine = rowHeight === MESH_GRID_ROW_HEIGHT_TWO_LINE;

  rowLabels.forEach((rowLabel, i) => {
    const rowTop = topY - MESH_GRID_HEADER_HEIGHT - i * rowHeight;
    ops.push(lineOperator(x, rowTop, x + tableWidth, rowTop, { stroke: TABLE_BORDER_GRAY }));

    const rowCenterY = rowTop - rowHeight / 2;
    const rowLabelY = rowCenterY - MESH_GRID_FONT_SIZE / 2 + 2;
    ops.push(colored([1, 1, 1], boldTextOperator(rowLabel, x + MESH_GRID_CELL_PAD, rowLabelY, MESH_GRID_FONT_SIZE)));

    if (twoLine) {
      // Tx/Rx divider, so tx and rx read as separate cells rather than two lines floating in
      // one. It spans only the data columns (not the row-header column, whose label covers
      // the whole row as a single port).
      ops.push(lineOperator(x + MESH_GRID_LABEL_COL_WIDTH, rowCenterY, x + tableWidth, rowCenterY,
                            { stroke: MESH_GRID_DIVIDER_GRAY }));
    }
    const line0Y = rowTop - rowHeight / 4 - MESH_GRID_FONT_SIZE / 2 + 2;
    const line1Y = rowCenterY - rowHeight / 4 - MESH_GRID_FONT_SIZE / 2 + 2;

    colLabels.forEach((_, j) => {
      const colX = x + MESH_GRID_LABEL_COL_WIDTH + j * dataColWidth;
      const lines = cellFor(i, j);
      if (!lines) {
        const dashText = '—';
        const dashX = colX + (dataColWidth - helveticaWidth(dashText, MESH_GRID_FONT_SIZE)) / 2;
        ops.push(colored(GRAY, textOperator(dashText, dashX, rowLabelY, MESH_GRID_FONT_SIZE)));
        return;
      }
      if (lines.length === 2) {
        [[lines[0], line0Y], [lines[1], line1Y]].forEach(([text, textY]) => {
          const textX = colX + (dataColWidth - helveticaWidth(text, MESH_GRID_FONT_SIZE)) / 2;
          ops.push(colored(BLACK, textOperator(text, textX, textY, MESH_GRID_FONT_SIZE)));
        });
      } else {
        const text = lines[0];
        const textX = colX + (dataColWidth - helveticaWidth(text, MESH_GRID_FONT_SIZE)) / 2;
        ops.push(colored(BLACK, textOperator(text, textX, rowLabelY, MESH_GRID_FONT_SIZE)));
      }
    });
  });

  return { ops, height: totalHeight };
}

function meshGridRowCapacity(topY, rowHeight) {
  return Math.max(1, Math.floor((topY - PAGE_BOTTOM_MARGIN - MESH_GRID_HEADER_HEIGHT) / rowHeight));
}

/** Height of one frame size section (section label + grid): an 18 baseline offset for the
 *  label plus 14 between the label and the grid top, matching meshFramesizeSectionOps(). */
function meshSectionHeight(rowCount, rowHeight) {
  return 18 + 14 + MESH_GRID_HEADER_HEIGHT + rowCount * rowHeight;
}

function meshFramesizeSectionOps(
  x, topY, label, colLabels, colIndexes, rowLabels, rowIndexes, tableWidth, rowHeight, cellFor,
) {
  const ops = [];
  const labelY = topY - 18;
  ops.push(colored(BRAND_BLUE, boldTextOperator(label, x, labelY, SECTION_LABEL_FONT_SIZE)));
  const gridTopY = labelY - 14;
  const grid = meshGridOps(colLabels, colIndexes, rowLabels, rowIndexes, x, gridTopY, tableWidth, rowHeight, cellFor);
  ops.push(...grid.ops);
  return { ops, height: topY - gridTopY + grid.height };
}

/**
 * Returns { content, resources, extraPages }: content/resources are the first page (title
 * + chart + start of the table), and extraPages are continuation pages created when the
 * table does not fit (possibly empty). The caller (buildReportPdf) must append extraPages
 * as pages of their own, not just use the first page.
 */
export function itemPageContent(item, results) {
  const { width, height } = A4_PORTRAIT;
  const ops = [];

  // Styled title: a brand-color accent bar on the left with large bold text instead of plain
  // thin black text, and a brand-blue rule below, echoing the cover page title.
  const titleY = height - 58;
  ops.push(rectOperator(40, titleY - 4, 4, TITLE_FONT_SIZE, { fill: BRAND_BLUE }));
  ops.push(colored(BLACK, boldTextOperator(item.name, 52, titleY, TITLE_FONT_SIZE)));
  ops.push(lineOperator(40, titleY - 14, width - 40, titleY - 14, { stroke: BRAND_BLUE }));
  let y = titleY - 14;

  // The chart and the table each get a bold brand-blue section label (CHART REPORT / DETAILED
  // TEST REPORT) to separate the two sections visually instead of running them together.
  const chart = chartDataFor(item, results);
  if (chart) {
    y -= 18;
    ops.push(colored(BRAND_BLUE, boldTextOperator('CHART REPORT', 40, y, SECTION_LABEL_FONT_SIZE)));
    const chartTop = y - 20;
    const chartBottom = chartTop - CHART_BOX_HEIGHT;
    ops.push(chartContent(chart, 40, chartBottom, width - 80, CHART_BOX_HEIGHT));
    y = chartBottom;
  }

  const extraPages = [];

  if (isMeshResults(results)) {
    if (chart) {
      y -= 14;
      ops.push(lineOperator(40, y, width - 40, y, { stroke: TABLE_BORDER_GRAY }));
    }

    const tableWidth = width - 80;

    let pageOps = ops;
    let curY = y;
    let isFirstBlockOnPage = true;

    // A FullyMesh convergence test shows its converged result first. The scalar fields
    // next to the matrix object (passed, the resultKey converged value) had nowhere to
    // appear, because this path bypasses transposeDetailAcrossFramesizes() (which already
    // handles the same issue for flat tables). So a small summary table is drawn here,
    // reusing dataTableOps() for its existing PASS/FAIL styling.
    const summary = summaryTableAcrossFramesizes(results);
    if (summary.rows.length > 0) {
      curY -= 18;
      pageOps.push(colored(BRAND_BLUE, boldTextOperator('DETAILED TEST REPORT', 40, curY, SECTION_LABEL_FONT_SIZE)));
      curY -= 14;
      const summaryHeight = TABLE_HEADER_HEIGHT + summary.rows.length * TABLE_ROW_HEIGHT;
      if (curY - summaryHeight < PAGE_BOTTOM_MARGIN) {
        const shell = itemContinuationShellOps(item);
        pageOps = shell.ops;
        curY = shell.y;
      }
      pageOps.push(...dataTableOps(summary.columns, summary.rows, 40, curY, tableWidth));
      curY -= summaryHeight;
      isFirstBlockOnPage = false;
    }

    for (const fs of Object.keys(results)) {
      const matrix = meshMatrixOf(results[fs]);
      if (!matrix) continue;
      const { indexes, labels } = meshMatrixAxis(item, matrix);
      // tx/rx matrices have two lines per cell and latency matrices one, so the heights
      // differ; decide from the actual cell shape in the matrix, not by guessing from fs or
      // anything else external.
      const sampleCell = Object.values(matrix)[0];
      const rowHeight = sampleCell && 'latency' in sampleCell
        ? MESH_GRID_ROW_HEIGHT_ONE_LINE : MESH_GRID_ROW_HEIGHT_TWO_LINE;
      const freshCapacity = meshGridRowCapacity(itemContinuationTableTopY(), rowHeight);

      // With enough ports, a single frame size's grid can exceed one page (an extreme case);
      // then this frame size's rows are split into batches too. Usually there is just one.
      const partCount = Math.max(1, Math.ceil(labels.length / freshCapacity));
      for (let part = 0; part < partCount; part++) {
        const rowLabels = labels.slice(part * freshCapacity, (part + 1) * freshCapacity);
        const rowIndexes = indexes.slice(part * freshCapacity, (part + 1) * freshCapacity);
        const label = partCount === 1
          ? `DETAILED TEST REPORT — Frame Size ${fs} bytes`
          : `DETAILED TEST REPORT — Frame Size ${fs} bytes (${part + 1}/${partCount})`;
        const blockHeight = meshSectionHeight(rowLabels.length, rowHeight);

        // Check the fit even for the first section on the page: sections are coarser than
        // the flat table's rows (a whole frame size grid is one section), and the space left
        // on the first page after the title and chart may not fit even one. Then the first
        // page holds only the title and chart and the grid moves to a continuation page,
        // which is reasonable and expected.
        if (curY - blockHeight < PAGE_BOTTOM_MARGIN) {
          if (pageOps !== ops) {
            extraPages.push({ content: pageOps.join(' '), resources: FONT_RESOURCE });
          }
          const shell = itemContinuationShellOps(item);
          pageOps = shell.ops;
          curY = shell.y;
          isFirstBlockOnPage = true;
        }

        if (!isFirstBlockOnPage) {
          curY -= 14;
          pageOps.push(lineOperator(40, curY, width - 40, curY, { stroke: TABLE_BORDER_GRAY }));
        }

        const cellFor = (i, j) => meshCellLines(matrix, `${rowIndexes[i]}->${indexes[j]}`);
        const section = meshFramesizeSectionOps(
          40, curY, label, labels, indexes, rowLabels, rowIndexes, tableWidth, rowHeight, cellFor);
        pageOps.push(...section.ops);
        curY -= section.height;
        isFirstBlockOnPage = false;
      }
    }

    if (pageOps !== ops) {
      extraPages.push({ content: pageOps.join(' '), resources: FONT_RESOURCE });
    }

    return { content: ops.join(' '), resources: FONT_RESOURCE, extraPages };
  }

  const { columns, rows } = transposeDetailAcrossFramesizes(results, item);
  if (columns.length > 0) {
    if (chart) {
      y -= 14;
      ops.push(lineOperator(40, y, width - 40, y, { stroke: TABLE_BORDER_GRAY }));
    }
    y -= 18;
    ops.push(colored(BRAND_BLUE, boldTextOperator('DETAILED TEST REPORT', 40, y, SECTION_LABEL_FONT_SIZE)));
    y -= 14;

    // When the table does not fit in the space left on the first page (common for per-pair
    // matrices like FullyMesh/ManyToMany, whose rows grow with the number of port pairs),
    // continue on new pages instead of drawing off the page (PDF content is clipped to the
    // MediaBox, so anything drawn beyond it is invisible).
    const rowChunks = paginateRows(rows, itemTableRowCapacity(y), itemTableRowCapacity(itemContinuationTableTopY()));
    ops.push(...dataTableOps(columns, rowChunks[0], 40, y, width - 80));
    for (let i = 1; i < rowChunks.length; i++) {
      extraPages.push(itemContinuationPageOps(item, columns, rowChunks[i], i + 1, rowChunks.length));
    }
  }

  return { content: ops.join(' '), resources: FONT_RESOURCE, extraPages };
}

const BRAND_BLUE = [0.055, 0.314, 0.506];
const GRAY = [0.4, 0.4, 0.4];
const BLACK = [0, 0, 0];
const GREEN = [0.09, 0.55, 0.2];
const RED = [0.75, 0.1, 0.1];

const colored = (color, op) => `${color.join(' ')} rg ${op}`;

/** The same format as ui/export-excel.js:formatTimestamp() (24-hour clock), so both
 *  reports show identical time strings. */
function formatTestTime(ms) {
  return new Date(ms).toLocaleString('en-US', { hour12: false });
}

/**
 * Text for the test run's time span, from the actual startedAt/finishedAt of the runs
 * (the same concept and format as the Excel export's formatTimestamp), not the moment the
 * export button was pressed, which can be very different. Only when no entry has a real
 * timestamp (the project has never run a test) does it fall back to the export time,
 * explicitly labelled "Generated" rather than "Test Time" so nobody mistakes it for the
 * run time. The cover page (coverPageContent) and the Counter Report header
 * (counterReportPageContent) share this logic instead of keeping copies that could drift.
 */
function testTimeText(state) {
  const starts = state.queue.map(q => q.startedAt).filter(t => t != null);
  const finishes = state.queue.map(q => q.finishedAt).filter(t => t != null);
  return starts.length > 0 && finishes.length > 0
    ? `Test Time: ${formatTestTime(Math.min(...starts))} ~ ${formatTestTime(Math.max(...finishes))}`
    : `Generated: ${formatTestTime(Date.now())}`;
}

/**
 * One table-of-contents row: the item name on the left, the page number on the right,
 * with light grey dots filling the gap (the classic dotted leader), and the page number
 * highlighted in brand blue. Returns the operators to add to ops for this row.
 */
function tocRowOps(name, pageNumber, y, leftX, rightX) {
  const SIZE = 11;
  const ops = [colored(BLACK, textOperator(name, leftX, y, SIZE))];
  const nameWidth = helveticaWidth(name, SIZE);
  const pageStr = String(pageNumber);
  const pageWidth = helveticaWidth(pageStr, SIZE);
  const dotWidth = helveticaWidth('.', SIZE);
  const gapStart = leftX + nameWidth + 6;
  const gapEnd = rightX - pageWidth - 6;
  const dotsCount = Math.max(0, Math.floor((gapEnd - gapStart) / dotWidth));
  if (dotsCount > 0) {
    ops.push(colored(GRAY, textOperator('.'.repeat(dotsCount), gapStart, y, SIZE)));
  }
  ops.push(colored(BRAND_BLUE, textOperator(pageStr, rightX - pageWidth, y, SIZE)));
  return ops;
}

/**
 * The cover page, including the table of contents listed directly below (there is no
 * separate contents page). tocEntries is the { name, pageNumber } array computed in the
 * first phase of buildReportPdf(); when omitted (e.g. when testing coverPageContent on its
 * own) the contents block is not drawn.
 */
export function coverPageContent(state, tocEntries = []) {
  const { width, height } = A4_PORTRAIT;
  const ops = [imageDrawOperator(LETTERHEAD_IMAGE_NAME, 0, 0, width, height)];

  // Eyebrow label + title + rule to create visual hierarchy; three flat lines of black text
  // gave no sense of what mattered most. The type sizes are enlarged accordingly.
  ops.push(colored(BRAND_BLUE, textOperator('TEST REPORT', 40, height - 195, 14)));
  ops.push(colored(BLACK, textOperator(pdfSafeReportName(state.name), 40, height - 232, 32)));
  ops.push(lineOperator(40, height - 252, width - 40, height - 252, { stroke: BRAND_BLUE }));

  const testTimeY = height - 274;
  ops.push(colored(GRAY, textOperator(testTimeText(state), 40, testTimeY, 11)));

  // The table of contents sits directly below the cover content, styled with a small blue
  // label and dotted leaders joining each item name to its page number in brand blue.
  // (A pass/fail tally that used to be here was removed as unnecessary.)
  if (tocEntries.length > 0) {
    const tocHeaderY = testTimeY - 40;
    ops.push(colored(BRAND_BLUE, textOperator('CONTENTS', 40, tocHeaderY, 12)));
    let rowY = tocHeaderY - 28;
    for (const { name, pageNumber } of tocEntries) {
      ops.push(...tocRowOps(name, pageNumber, rowY, 40, width - 40));
      rowY -= 24;
    }
  }

  return { content: ops.join(' '), resources: FONT_RESOURCE, usesImages: [LETTERHEAD_IMAGE_NAME] };
}

const HEADER_HEIGHT = 28;
// Text baseline that centers footer text vertically in the blue bar (in the letterhead
// image the bar occupies roughly the bottom ~15.6pt of the page).
const LETTERHEAD_FOOTER_TEXT_Y = 5;

export function withHeaderFooter(page, { reportName, pageNumber, totalPages, width, height }) {
  const isPortrait = width < height;
  const ops = [];

  if (isPortrait) ops.push(imageDrawOperator(LETTERHEAD_IMAGE_NAME, 0, 0, width, height));
  ops.push(page.content);

  if (isPortrait) {
    // The letterhead image already carries the Xtramus branding, so no header text is added
    // (there is no room either: the item title almost touches the bottom of the letterhead
    // graphic). The report name and page number go in the blue footer bar instead (white
    // text; the background is dark enough for good contrast).
    const footerText = `${reportName}  —  ${pageNumber} / ${totalPages}`;
    ops.push(`1 1 1 rg ${textOperator(footerText, width / 2 - 80, LETTERHEAD_FOOTER_TEXT_Y, 9)}`);
  } else {
    // Landscape pages (currently only the Counter Report): the letterhead is portrait and
    // would be distorted on a landscape page, so the hand-drawn blue bars remain as a
    // fallback. After rectOperator({fill:...}) draws a blue bar, the fill color stays blue,
    // and text that does not reset it is drawn blue on the blue bar, completely invisible
    // (found only when rendering to an image; the same class of bug fixed in pdf-chart.js).
    // Header text on the blue bar is reset to white, and the footer page number on the
    // white page background is reset to black.
    ops.push(rectOperator(0, height - HEADER_HEIGHT, width, HEADER_HEIGHT,
                          { fill: [0.055, 0.314, 0.506] }));
    ops.push(`1 1 1 rg ${textOperator('Xtramus', 20, height - 20, 11)}`);
    ops.push(`1 1 1 rg ${textOperator(reportName, width / 2 - 40, height - 20, 9)}`);
    ops.push(`1 1 1 rg ${textOperator(new Date().toLocaleDateString('en-US'), width - 100, height - 20, 9)}`);

    const footerText = `${pageNumber} / ${totalPages}`;
    ops.push(`0 0 0 rg ${textOperator(footerText, width / 2 - 15, 20, 9)}`);
  }

  return {
    content: ops.join(' '),
    resources: page.resources,
    usesImages: isPortrait ? [LETTERHEAD_IMAGE_NAME] : [],
  };
}

/** The same line-rate constants as STANDARD_MEDIA_RATES in ui/export-excel.js. Both derive
 *  from MEDIA_SPEED_BPS in engine/nuconst.js, so the numbers cannot drift; each file just
 *  declares its own array (pure configuration data with no business logic, so separate
 *  declarations carry no risk of diverging logic). */
const STANDARD_MEDIA_RATES = [
  { label: '10M', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.M10] },
  { label: '100M', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.M100] },
  { label: '1G', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.G1] },
  { label: '2.5G', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.G2P5] },
  { label: '5G', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.G5] },
  { label: '10G', bps: MEDIA_SPEED_BPS[MEDIA_SPEED.G10] },
];

function theoreticalMaxFps(framesize, bps) {
  return Math.floor(Math.floor(bps / 8) / (framesize + 20));
}

// Mirrors the Counter Report styling in engine/xlsx-writer.js (borderless headerBlue +
// alternating light-grey stripeStyle) rather than the fully gridded tables of the item
// pages, so this page matches the Excel format exactly. The light grey 0.94 corresponds to
// Excel fillId5's FFF0F0F0 (240/255).
const COUNTER_STRIPE_GRAY = [0.94, 0.94, 0.94];
const COUNTER_ROW_HEIGHT = 16;
const COUNTER_HEADER_HEIGHT = 18;
const COUNTER_FONT_SIZE = 8;
const COUNTER_CELL_PAD = 5;

/**
 * Draw a table in the style of the Excel Counter Report: header in bold white on blue, no
 * borders; data rows alternate light grey when striped=true (like stripeStyle: index 0
 * unshaded, index 1 shaded, ...) and have no fill when striped=false (like the
 * theoreticalMaxFrameRateRows sub-table, which has no stripes in Excel). Returns the ops
 * array and the table's total height so the caller can lay out the next block below it.
 */
function excelStyleTableOps(columns, rows, x, topY, { striped }) {
  const ops = [];
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);

  ops.push(rectOperator(x, topY - COUNTER_HEADER_HEIGHT, totalWidth, COUNTER_HEADER_HEIGHT,
                        { fill: BRAND_BLUE }));
  const headerTextY = topY - COUNTER_HEADER_HEIGHT + (COUNTER_HEADER_HEIGHT - COUNTER_FONT_SIZE) / 2 + 2;
  let colX = x;
  for (const col of columns) {
    const textX = col.align === 'right'
      ? colX + col.width - COUNTER_CELL_PAD - helveticaWidth(col.label, COUNTER_FONT_SIZE)
      : colX + COUNTER_CELL_PAD;
    ops.push(colored([1, 1, 1], boldTextOperator(col.label, textX, headerTextY, COUNTER_FONT_SIZE)));
    colX += col.width;
  }

  rows.forEach((values, i) => {
    const rowTop = topY - COUNTER_HEADER_HEIGHT - i * COUNTER_ROW_HEIGHT;
    if (striped && i % 2 === 1) {
      ops.push(rectOperator(x, rowTop - COUNTER_ROW_HEIGHT, totalWidth, COUNTER_ROW_HEIGHT,
                            { fill: COUNTER_STRIPE_GRAY }));
    }
    const textY = rowTop - COUNTER_ROW_HEIGHT + (COUNTER_ROW_HEIGHT - COUNTER_FONT_SIZE) / 2 + 2;
    let cx = x;
    columns.forEach((col, j) => {
      const text = String(values[j]);
      const textX = col.align === 'right'
        ? cx + col.width - COUNTER_CELL_PAD - helveticaWidth(text, COUNTER_FONT_SIZE)
        : cx + COUNTER_CELL_PAD;
      ops.push(colored(BLACK, textOperator(text, textX, textY, COUNTER_FONT_SIZE)));
      cx += col.width;
    });
  });

  return { ops, height: COUNTER_HEADER_HEIGHT + rows.length * COUNTER_ROW_HEIGHT };
}

const COUNTER_LOG_COLUMNS = [
  { label: 'Item', width: 130, align: 'left' },
  { label: 'Frame Size', width: 65, align: 'right' },
  { label: 'Iteration', width: 55, align: 'right' },
  { label: 'Tx Port', width: 65, align: 'left' },
  { label: 'Rx Port', width: 65, align: 'left' },
  { label: 'Target', width: 65, align: 'right' },
  { label: 'Tx Packets', width: 85, align: 'right' },
  { label: 'Rx Packets', width: 85, align: 'right' },
  { label: 'Loss', width: 65, align: 'right' },
  { label: 'Loss (%)', width: 82, align: 'right' },
];

/**
 * Main title + optional test-time subtitle. The first page and continuation pages share
 * the same layout math, except that continuation pages omit the test time (saving space;
 * the first page already has it) and the title becomes "Counter Report (cont'd)". Returns
 * the current y coordinate for the caller to continue below.
 */
function counterPageHeaderOps(width, height, titleText, testTimeLine) {
  const ops = [];
  const titleY = height - HEADER_HEIGHT - 30;
  ops.push(rectOperator(40, titleY - 4, 4, TITLE_FONT_SIZE, { fill: BRAND_BLUE }));
  ops.push(colored(BLACK, boldTextOperator(titleText, 52, titleY, TITLE_FONT_SIZE)));
  ops.push(lineOperator(40, titleY - 14, width - 40, titleY - 14, { stroke: BRAND_BLUE }));
  let y = titleY - 14;
  if (testTimeLine) {
    y -= 16;
    ops.push(colored(GRAY, textOperator(testTimeLine, 40, y, 11)));
  }
  y -= 20;
  return { ops, y };
}

function counterLogRowCapacity(topY) {
  return Math.max(1, Math.floor((topY - PAGE_BOTTOM_MARGIN - COUNTER_HEADER_HEIGHT) / COUNTER_ROW_HEIGHT));
}

/** Height of the whole Theoretical Maximum Frame Rate sub-table (label + table), used to
 *  decide whether it still fits after the last batch of log rows; if not, it starts a new page. */
function fpsSectionHeight(fpsRowCount) {
  return 24 + 18 + COUNTER_HEADER_HEIGHT + fpsRowCount * COUNTER_ROW_HEIGHT;
}

function fpsSectionOps(x, topY, fpsColumns, fpsRows) {
  const ops = [];
  const labelY = topY - 24;
  ops.push(colored(BLACK,
    boldTextOperator('Theoretical Maximum Frame Rate (fps @ 100% line rate)', x, labelY, 11)));
  const tableTopY = labelY - 18;
  // alternate light-grey shading, consistent with the detailed log table.
  const fpsTable = excelStyleTableOps(fpsColumns, fpsRows, x, tableTopY, { striped: true });
  ops.push(...fpsTable.ops);
  return ops;
}

/**
 * Returns { content, resources, extraPages }, the same convention as itemPageContent().
 * When the detailed log table has too many rows (several items or many iterations easily
 * exceed one page) it continues on new pages, repeating the header. The Theoretical
 * Maximum Frame Rate sub-table follows the last batch of log rows and starts its own page
 * when there is not enough room, so it is never squeezed in or cut in half.
 */
export function counterReportPageContent(state) {
  const { width, height } = A4_LANDSCAPE;

  const dataRows = [];
  for (const q of state.queue) {
    const item = q.snapshot ?? state.items.find(i => i.id === q.itemId);
    if (!item || !q.counterLog?.length) continue;
    for (const entry of q.counterLog) {
      const detail = entry.checked ?? entry.raw;
      const tx = detail?.tx_packets ?? '—';
      const rx = detail?.rx_packets ?? '—';
      const loss = (typeof tx === 'number' && typeof rx === 'number') ? Math.max(0, tx - rx) : '—';
      const lossPct = (typeof loss === 'number' && tx) ? ((loss / tx) * 100).toFixed(1) : '—';
      dataRows.push([
        item.name, entry.framesize, entry.iteration,
        item.ports?.tx_port ? portKey(item.ports.tx_port) : '—',
        item.ports?.rx_port ? portKey(item.ports.rx_port) : '—',
        entry.target ?? '—', tx, rx, loss, lossPct,
      ]);
    }
  }

  const sizes = [...new Set(dataRows.map(row => row[1]))].sort((a, b) => a - b);
  const fpsColumns = [
    { label: 'Frame Size (bytes)', width: 120, align: 'right' },
    ...STANDARD_MEDIA_RATES.map(r => ({ label: r.label, width: 107, align: 'right' })),
  ];
  const fpsRows = sizes.map(fs => [fs, ...STANDARD_MEDIA_RATES.map(r => theoreticalMaxFps(fs, r.bps))]);

  const firstTopY = counterPageHeaderOps(width, height, 'Counter Report', testTimeText(state)).y;
  const contTopY = counterPageHeaderOps(width, height, "Counter Report (cont'd)", null).y;
  const rowChunks = paginateRows(dataRows, counterLogRowCapacity(firstTopY), counterLogRowCapacity(contTopY));

  const pages = [];
  rowChunks.forEach((chunk, i) => {
    const isFirst = i === 0;
    const isLast = i === rowChunks.length - 1;
    const header = isFirst
      ? counterPageHeaderOps(width, height, 'Counter Report', testTimeText(state))
      : counterPageHeaderOps(width, height, "Counter Report (cont'd)", null);
    const table = excelStyleTableOps(COUNTER_LOG_COLUMNS, chunk, 40, header.y, { striped: true });
    const ops = [...header.ops, ...table.ops];
    const y = header.y - table.height;

    if (isLast && sizes.length > 0) {
      if (y - fpsSectionHeight(fpsRows.length) < PAGE_BOTTOM_MARGIN) {
        // The space left on this page cannot hold the whole Theoretical Maximum Frame Rate
        // sub-table (label + header + at least one row), so close this page and give the
        // sub-table a fresh one instead of letting the page edge cut it in half.
        pages.push({ content: ops.join(' '), resources: FONT_RESOURCE });
        const fpsHeader = counterPageHeaderOps(width, height, "Counter Report (cont'd)", null);
        pages.push({
          content: [...fpsHeader.ops, ...fpsSectionOps(40, fpsHeader.y, fpsColumns, fpsRows)].join(' '),
          resources: FONT_RESOURCE,
        });
        return;
      }
      ops.push(...fpsSectionOps(40, y, fpsColumns, fpsRows));
    }
    pages.push({ content: ops.join(' '), resources: FONT_RESOURCE });
  });

  const [first, ...extraPages] = pages;
  return { ...first, extraPages };
}

/**
 * Two-phase assembly. Phase one produces the full content of each queue item and of the
 * Counter Report (itemPageContent()/counterReportPageContent() may add continuation pages
 * for long tables and return { content, extraPages }, so one item no longer means one
 * page; the real page count depends on the length of extraPages, which is why all content
 * is generated first to compute the page numbers the contents and headers/footers need).
 * Phase two builds the table of contents, adds headers and footers, and hands everything
 * to buildPdf() at once.
 */
export function buildReportPdf(state) {
  const itemEntries = state.queue
    .map(q => {
      const item = q.snapshot ?? state.items.find(i => i.id === q.itemId);
      return item ? { item, q } : null;
    })
    .filter(Boolean);

  // Phase one: produce the full page arrays of each item and the Counter Report (the cover
  // and the table of contents share one page, so there is no separate page 2), then
  // accumulate page numbers from the actual page counts; one item no longer means one page.
  const itemPageGroups = itemEntries.map(({ item, q }) => {
    const { content, resources, extraPages } = itemPageContent(item, q.lastResult ?? {});
    return [{ content, resources }, ...extraPages];
  });
  const { content: counterFirstContent, resources: counterResources, extraPages: counterExtraPages }
    = counterReportPageContent(state);
  const counterPageGroup = [{ content: counterFirstContent, resources: counterResources }, ...counterExtraPages];

  const tocEntries = [];
  let pageNumber = 2;   // 1 = cover
  itemEntries.forEach(({ item }, i) => {
    tocEntries.push({ name: item.name, pageNumber });
    pageNumber += itemPageGroups[i].length;
  });
  const counterReportPageNumber = pageNumber;
  tocEntries.push({ name: 'Counter Report', pageNumber: counterReportPageNumber });
  const totalPages = counterReportPageNumber + counterPageGroup.length - 1;
  const reportName = pdfSafeReportName(state.name);

  // Phase two: build every page with headers and footers (except the cover, which is itself the branded page)
  const pages = [];
  pages.push({
    ...coverPageContent(state, tocEntries), width: A4_PORTRAIT.width, height: A4_PORTRAIT.height,
  });

  let runningPageNumber = 2;
  for (const group of itemPageGroups) {
    for (const pageContent of group) {
      const wrapped = withHeaderFooter(pageContent, {
        reportName, pageNumber: runningPageNumber, totalPages,
        width: A4_PORTRAIT.width, height: A4_PORTRAIT.height,
      });
      pages.push({ ...wrapped, width: A4_PORTRAIT.width, height: A4_PORTRAIT.height });
      runningPageNumber += 1;
    }
  }

  for (const pageContent of counterPageGroup) {
    const wrapped = withHeaderFooter(pageContent, {
      reportName, pageNumber: runningPageNumber, totalPages,
      width: A4_LANDSCAPE.width, height: A4_LANDSCAPE.height,
    });
    pages.push({ ...wrapped, width: A4_LANDSCAPE.width, height: A4_LANDSCAPE.height });
    runningPageNumber += 1;
  }

  return buildPdf(pages, { [LETTERHEAD_IMAGE_NAME]: LETTERHEAD_IMAGE });
}
