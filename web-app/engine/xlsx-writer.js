/**
 * Hand-written OOXML (SpreadsheetML) writer that produces .xlsx content. It splits the
 * work with zip-writer.js: this layer only produces correct XML strings, and
 * buildZip() does the packaging.
 *
 * This layer knows nothing about XMNT's data model (items, queues, recipes); it only
 * understands the generic { name, rows, chart } shape. Deciding which rows/chart a
 * test item produces is ui/export-excel.js's job.
 */

import { buildZip } from './zip-writer.js';

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Convert a 0-based column index to Excel column letters (0->A, 25->Z, 26->AA). */
function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CJK_PATTERN = /[一-鿿]/;

/** In the monospace width estimate, a CJK character counts as two half-width characters; everything else counts as one. */
function displayWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    width += CJK_PATTERN.test(ch) ? 2 : 1;
  }
  return width;
}

/** Each column takes the widest cell's display width plus 2 for padding, capped at 60. */
function computeColumnWidths(rows) {
  const maxContentWidths = [];
  for (const row of rows) {
    row.cells.forEach((cellSpec, ci) => {
      const w = displayWidth(cellValue(cellSpec) ?? '');
      maxContentWidths[ci] = Math.max(maxContentWidths[ci] ?? 0, w);
    });
  }
  return maxContentWidths.map(w => Math.min(60, w + 2));
}

function colsXml(widths) {
  if (widths.length === 0) return '';
  const cols = widths.map((w, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return `<cols>${cols}</cols>`;
}

function sheetViewsXml(sheet) {
  if (!sheet.freezeHeaderRow) return '';
  return '<sheetViews><sheetView workbookViewId="0">'
    + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
    + '</sheetView></sheetViews>';
}

function autoFilterXml(sheet) {
  if (!sheet.autoFilter || sheet.rows.length === 0) return '';
  const lastCol = sheet.rows[0].cells.length - 1;
  if (lastCol < 0) return '';
  return `<autoFilter ref="A1:${colLetter(lastCol)}1"/>`;
}

/** sheet.merges is a list of ready-made ref strings (e.g. "A2:A3"); building them is the
 *  caller's (ui/export-excel.js) job, and this only emits them in OOXML order. They
 *  must come after <autoFilter> and before <drawing> (CT_Worksheet's fixed element
 *  order); anywhere else and Excel reports the file as corrupt. */
function mergeCellsXml(merges) {
  if (!merges || merges.length === 0) return '';
  const cells = merges.map(ref => `<mergeCell ref="${ref}"/>`).join('');
  return `<mergeCells count="${merges.length}">${cells}</mergeCells>`;
}

/** Named style -> cellXfs index, following the declaration order of <cellXfs> in STYLES_XML. */
const STYLE_INDEX = {
  bold: 1,
  headerBlue: 2,
  headerBlueBordered: 3,
  pass: 4,
  fail: 5,
  label: 6,
  warning: 7,
  bordered: 8,
  borderedInt: 9,
  borderedFloat: 10,
  headerBlueBorderedRight: 11,
  borderedRight: 12,
  headerBlueCenter: 13,
  stripe: 14,
  borderedCenter: 15,
  headerBlueBorderedCenter: 16,
  passGreen: 17,
  failRed: 18,
  center: 19,
};

function cellValue(cellSpec) {
  return (cellSpec !== null && typeof cellSpec === 'object') ? cellSpec.value : cellSpec;
}

function cellStyleName(cellSpec, rowStyle) {
  if (cellSpec !== null && typeof cellSpec === 'object') {
    return cellSpec.style ?? rowStyle;
  }
  return rowStyle;
}

function cellXml(ref, value, styleName) {
  const styleIndex = STYLE_INDEX[styleName] ?? 0;
  const styleAttr = styleIndex ? ` s="${styleIndex}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${escapeXml(value ?? '')}</t></is></c>`;
}

function rowsXml(rows) {
  return rows.map((row, ri) => {
    const cells = row.cells.map((cellSpec, ci) =>
      cellXml(`${colLetter(ci)}${ri + 1}`, cellValue(cellSpec), cellStyleName(cellSpec, row.style))).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
}

function sheetXml(sheet, hasChart, columnWidths) {
  const drawing = hasChart ? '<drawing r:id="rId1"/>' : '';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + sheetViewsXml(sheet)
    + colsXml(columnWidths)
    + `<sheetData>${rowsXml(sheet.rows)}</sheetData>`
    + autoFilterXml(sheet)
    + mergeCellsXml(sheet.merges)
    + drawing
    + '</worksheet>';
}

/** Chart height (rows) and width (columns). At 20 rows the title touches the plot area,
 *  and data labels on bars near the axis maximum overlap the title (seen in Excel); 28
 *  rows fixes the overlap but makes the chart too large. 22 rows balances the two, and
 *  the width was narrowed from 10 to 8 columns at the same time. */
const CHART_HEIGHT_ROWS = 22;
const CHART_WIDTH_COLS = 8;

function drawingXml(anchorRow) {
  const fromRow = anchorRow ?? 0;
  const toRow = fromRow + CHART_HEIGHT_ROWS;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<xdr:wsDr '
    + 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" '
    + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<xdr:twoCellAnchor>'
    + '<xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff>'
    + `<xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
    + `<xdr:to><xdr:col>${CHART_WIDTH_COLS}</xdr:col><xdr:colOff>0</xdr:colOff>`
    + `<xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
    + '<xdr:graphicFrame macro="">'
    + '<xdr:nvGraphicFramePr>'
    + '<xdr:cNvPr id="2" name="Chart"/>'
    + '<xdr:cNvGraphicFramePr/>'
    + '</xdr:nvGraphicFramePr>'
    + '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
    + '<a:graphic>'
    + '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
    + '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>'
    + '</a:graphicData></a:graphic>'
    + '</xdr:graphicFrame>'
    + '<xdr:clientData/>'
    + '</xdr:twoCellAnchor>'
    + '</xdr:wsDr>';
}

function drawingRelsXml(chartIndex) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" '
    + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" '
    + `Target="../charts/chart${chartIndex}.xml"/>`
    + '</Relationships>';
}

function sheetRelsXml(chartIndex) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" '
    + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" '
    + `Target="../drawings/drawing${chartIndex}.xml"/>`
    + '</Relationships>';
}

function chartAxisTitleXml(text) {
  if (!text) return '';
  return '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r>'
    + `<a:t>${escapeXml(text)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`;
}

/** Value-axis limits; without them Excel auto-scales (both omitted when min/max are undefined). */
function valueScalingXml(min, max) {
  const maxXml = max != null ? `<c:max val="${max}"/>` : '';
  const minXml = min != null ? `<c:min val="${min}"/>` : '';
  return `<c:scaling><c:orientation val="minMax"/>${maxXml}${minXml}</c:scaling>`;
}

/** Data labels and value-axis ticks share one number format; when absent nothing is written and Excel's default applies. */
function numFmtXml(formatCode) {
  return formatCode ? `<c:numFmt formatCode="${escapeXml(formatCode)}" sourceLinked="0"/>` : '';
}

/** Chart data is embedded as literals (numLit/strLit) rather than linked cell ranges: this
 *  is a snapshot visualization in a report, not an interactive workbook, so it need not
 *  stay linked to the table contents. */
function chartXml(chart) {
  const cats = chart.categories.map((c, i) =>
    `<c:pt idx="${i}"><c:v>${escapeXml(c)}</c:v></c:pt>`).join('');
  const vals = chart.values.map((v, i) =>
    `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');
  const n = chart.categories.length;
  const numFmt = numFmtXml(chart.valueNumFmt);

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" '
    + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<c:chart>'
    + '<c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r>'
    + `<a:t>${escapeXml(chart.title)}</a:t></a:r></a:p></c:rich></c:tx>`
    + '<c:overlay val="0"/></c:title>'
    + '<c:plotArea><c:layout/>'
    + '<c:barChart>'
    + '<c:barDir val="col"/>'
    + '<c:grouping val="clustered"/>'
    + '<c:varyColors val="0"/>'
    + '<c:ser>'
    + '<c:idx val="0"/><c:order val="0"/>'
    + '<c:spPr><a:solidFill><a:srgbClr val="15A8DE"/></a:solidFill>'
    + '<a:effectLst><a:outerShdw blurRad="40000" dist="20000" dir="5400000" rotWithShape="0">'
    + '<a:srgbClr val="000000"><a:alpha val="40000"/></a:srgbClr>'
    + '</a:outerShdw></a:effectLst></c:spPr>'
    + `<c:dLbls>${numFmt}<c:showLegendKey val="0"/><c:showVal val="1"/>`
    + '<c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/>'
    + '<c:showBubbleSize val="0"/></c:dLbls>'
    + `<c:cat><c:strLit><c:ptCount val="${n}"/>${cats}</c:strLit></c:cat>`
    + `<c:val><c:numLit><c:ptCount val="${n}"/>${vals}</c:numLit></c:val>`
    + '</c:ser>'
    + '<c:gapWidth val="150"/>'
    + '<c:axId val="111111111"/><c:axId val="222222222"/>'
    + '</c:barChart>'
    + '<c:catAx>'
    + '<c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling>'
    + '<c:delete val="0"/><c:axPos val="b"/>'
    + chartAxisTitleXml(chart.categoryAxisTitle)
    + '<c:crossAx val="222222222"/>'
    + '</c:catAx>'
    + '<c:valAx>'
    + `<c:axId val="222222222"/>${valueScalingXml(chart.valueAxisMin, chart.valueAxisMax)}`
    + '<c:delete val="0"/><c:axPos val="l"/>'
    // The color explicitly matches GRIDLINE_GRAY in engine/pdf-chart.js ([0.8,0.8,0.8] -> CC)
    // instead of Excel's theme default, so gridlines look the same in both export formats.
    + '<c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="CCCCCC"/>'
    + '</a:solidFill></a:ln></c:spPr></c:majorGridlines>'
    + chartAxisTitleXml(chart.valueAxisTitle)
    + numFmt
    + '<c:crossAx val="111111111"/>'
    + '</c:valAx>'
    + '</c:plotArea>'
    + '<c:plotVisOnly val="1"/>'
    + '</c:chart>'
    + '</c:chartSpace>';
}

function workbookXml(sheets) {
  const entries = sheets.map((s, i) =>
    `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<sheets>${entries}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount) {
  const sheetRels = Array.from({ length: sheetCount }, (_, i) =>
    `<Relationship Id="rId${i + 1}" `
    + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
    + `Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  const stylesRel = `<Relationship Id="rId${sheetCount + 1}" `
    + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
    + 'Target="styles.xml"/>';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheetRels + stylesRel + '</Relationships>';
}

function contentTypesXml(sheetCount, chartCount) {
  const sheetOverrides = Array.from({ length: sheetCount }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" `
    + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
    .join('');
  const chartOverrides = Array.from({ length: chartCount }, (_, i) => (
    `<Override PartName="/xl/charts/chart${i + 1}.xml" `
    + 'ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>'
    + `<Override PartName="/xl/drawings/drawing${i + 1}.xml" `
    + 'ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
  )).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" '
    + 'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" '
    + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" '
    + 'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + sheetOverrides + chartOverrides
    + '</Types>';
}

const ROOT_RELS_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" '
  + 'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
  + 'Target="xl/workbook.xml"/>'
  + '</Relationships>';

const STYLES_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<numFmts count="2">'
  + '<numFmt numFmtId="164" formatCode="#,##0"/>'
  + '<numFmt numFmtId="165" formatCode="#,##0.###"/>'
  + '</numFmts>'
  + '<fonts count="9">'
  + '<font><sz val="11"/><name val="微軟正黑體"/></font>'
  + '<font><b/><sz val="11"/><name val="微軟正黑體"/></font>'
  + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="微軟正黑體"/></font>'
  + '<font><sz val="11"/><color rgb="FF0E5081"/><name val="微軟正黑體"/></font>'
  + '<font><sz val="11"/><color rgb="FFC8756A"/><name val="微軟正黑體"/></font>'
  + '<font><sz val="11"/><color rgb="FF8A6A1F"/><name val="微軟正黑體"/></font>'
  // Index 6: for the title row (headerBlueCenter) only, one size larger than the other
  // header styles (12 instead of 11).
  + '<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="微軟正黑體"/></font>'
  // Indexes 7/8: for passGreen/failRed only. The colors match the PDF export (defined in
  // ui/export-pdf.js, not engine/pdf-chart.js: GREEN=[0.09,0.55,0.2] -> 178C33,
  // RED=[0.75,0.1,0.1] -> BF1A1A), so the passed row on the detail sheet uses the same
  // colors in the web view, PDF and Excel.
  + '<font><sz val="11"/><color rgb="FF178C33"/><name val="微軟正黑體"/></font>'
  + '<font><sz val="11"/><color rgb="FFBF1A1A"/><name val="微軟正黑體"/></font>'
  + '</fonts>'
  + '<fills count="7">'
  + '<fill><patternFill patternType="none"/></fill>'
  + '<fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FF0E5081"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFE3F3FB"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFF5E4E1"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/></patternFill></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFFBF0DA"/></patternFill></fill>'
  + '</fills>'
  + '<borders count="2">'
  + '<border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left style="thin"/><right style="thin"/><top style="thin"/>'
  + '<bottom style="thin"/><diagonal/></border>'
  + '</borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="20">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="left"/></xf>'
  + '<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="0" fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="0" fontId="5" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="left" wrapText="1"/></xf>'
  + '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="right"/></xf>'
  + '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="right"/></xf>'
  + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="right"/></xf>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="right"/></xf>'
  // headerBlueCenter (13): the title row uses the 12pt font at index 6 (not index 2,
  // shared by the other header styles) and spans only the 2 columns of the basic info
  // (the caller, ui/export-excel.js, decides the column count).
  + '<xf numFmtId="0" fontId="6" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" '
  + 'applyAlignment="1"><alignment horizontal="centerContinuous"/></xf>'
  + '<xf numFmtId="0" fontId="0" fillId="5" borderId="0" xfId="0" applyFill="1"/>'
  // borderedCenter (15) / headerBlueBorderedCenter (16): for the Tx/Rx data cells and the
  // headers of the mesh XY grid (meshGridRows() in ui/export-excel.js), centered the
  // same way as in the PDF export (ui/export-pdf.js).
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="center"/></xf>'
  // headerBlueBorderedCenter (16): adds vertical="center" for merged cells (in the mesh XY
  // grid the sender column merges the Tx/Rx rows vertically, see
  // ui/export-excel.js:meshGridRows()); on single-row cells (the header row) it changes nothing.
  + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>'
  // passGreen (17) / failRed (18): colored text with no fill, right-aligned with a border
  // like borderedRight, for the passed row on the detail sheet (instead of plain
  // true/false). They are separate from the dark-filled pass (4) / fail (5) styles on
  // the Overview sheet, which are unchanged.
  + '<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="right"/></xf>'
  + '<xf numFmtId="0" fontId="8" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" '
  + 'applyAlignment="1"><alignment horizontal="right"/></xf>'
  // center (19): plain text centered across columns, with no fill/border/bold. Unlike
  // headerBlueCenter (13, bold white on blue for the title banner), it is for plain
  // description rows in the basic-info block, such as "Benchmark : ...".
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" '
  + 'applyAlignment="1"><alignment horizontal="centerContinuous"/></xf>'
  + '</cellXfs>'
  + '</styleSheet>';

/**
 * @param sheets [{ name: string, rows: [{cells: (string|number)[]}], chart? }]
 * @returns Uint8Array: the complete .xlsx file bytes
 */
export function buildXlsx(sheets) {
  const encoder = new TextEncoder();
  const chartSheetIndexes = [];   // 0-based sheet indexes, mapping in order to drawing1/chart1, drawing2/chart2, ...
  sheets.forEach((s, i) => { if (s.chart) chartSheetIndexes.push(i); });

  const entries = [
    { path: '[Content_Types].xml',
      bytes: encoder.encode(contentTypesXml(sheets.length, chartSheetIndexes.length)) },
    { path: '_rels/.rels', bytes: encoder.encode(ROOT_RELS_XML) },
    { path: 'xl/workbook.xml', bytes: encoder.encode(workbookXml(sheets)) },
    { path: 'xl/_rels/workbook.xml.rels', bytes: encoder.encode(workbookRelsXml(sheets.length)) },
    { path: 'xl/styles.xml', bytes: encoder.encode(STYLES_XML) },
  ];

  sheets.forEach((sheet, i) => {
    const hasChart = Boolean(sheet.chart);
    const columnWidths = computeColumnWidths(sheet.rows);
    entries.push({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      bytes: encoder.encode(sheetXml(sheet, hasChart, columnWidths)),
    });
    if (hasChart) {
      const chartIndex = chartSheetIndexes.indexOf(i) + 1;   // 1-based
      entries.push({
        path: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`,
        bytes: encoder.encode(sheetRelsXml(chartIndex)),
      });
    }
  });

  chartSheetIndexes.forEach((sheetIdx, j) => {
    const chartIndex = j + 1;
    const anchorRow = sheets[sheetIdx].chart.anchorRow;
    entries.push({ path: `xl/drawings/drawing${chartIndex}.xml`, bytes: encoder.encode(drawingXml(anchorRow)) });
    entries.push({
      path: `xl/drawings/_rels/drawing${chartIndex}.xml.rels`,
      bytes: encoder.encode(drawingRelsXml(chartIndex)),
    });
    entries.push({
      path: `xl/charts/chart${chartIndex}.xml`,
      bytes: encoder.encode(chartXml(sheets[sheetIdx].chart)),
    });
  });

  return buildZip(entries);
}
