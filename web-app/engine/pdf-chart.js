/**
 * Draws the chart data computed by ui/chart-data.js:chartDataFor() as PDF vector
 * graphics. It consumes the same data as engine/xlsx-writer.js:chartXml(); only the
 * output syntax differs (OOXML vs. a PDF content stream).
 */

import {
  rectOperator, lineOperator, textOperator, rotatedTextOperator, helveticaWidth,
} from './pdf-writer.js';

const BRAND_BLUE = [0.082, 0.659, 0.871];
const GRIDLINE_GRAY = [0.8, 0.8, 0.8];
const BORDER_GRAY = [0.6, 0.6, 0.6];
// Darker than the gridlines (0.8), like Excel chart axis lines (visibly darker than gridlines).
const AXIS_LINE_GRAY = [0.3, 0.3, 0.3];
const BLACK = [0, 0, 0];

const TITLE_SIZE = 14;
const AXIS_TITLE_SIZE = 13;
const DATA_LABEL_SIZE = 9;
const CATEGORY_LABEL_SIZE = 9;
const TICK_LABEL_SIZE = 8;
const TICK_MARK_LENGTH = 4;

const TITLE_HEIGHT = 28;
const AXIS_LABEL_HEIGHT = 18;
// Distance of the vertical Y-axis title anchor from the chart's left edge (the glyph height extends to the right).
const VALUE_AXIS_TITLE_MARGIN = 14;
// Width reserved for tick labels, right-aligned just to the right of the Y-axis title.
const TICK_LABEL_MARGIN = 36;
// Distance of the X-axis title baseline from the bottom of the frame; too close and the
// descenders (e.g. "y", "g") get cut by the border.
const CATEGORY_AXIS_TITLE_MARGIN = 6;
const GRIDLINE_COUNT = 10;

/**
 * The fill color (rg) in a PDF content stream is persistent state that is not reset
 * around BT/ET text blocks: after drawing a blue bar, text that does not reset the
 * color inherits blue. All chart text goes through this wrapper so the fill is always
 * explicitly black, instead of relying on drawing order. Horizontal (textOperator)
 * and vertical (rotatedTextOperator) text each have a wrapper.
 */
function blackText(...args) {
  return `${rgb(BLACK)} rg ${textOperator(...args)}`;
}
function blackRotatedText(...args) {
  return `${rgb(BLACK)} rg ${rotatedTextOperator(...args)}`;
}

const rgb = ([r, g, b]) => `${r} ${g} ${b}`;

/**
 * Understands only the two format codes ui/chart-data.js:chartValueMeta() currently
 * produces; it is not a general Excel number-format parser (the project uses only
 * these two, so YAGNI). With no format code (measurement shape, e.g. latency) it
 * falls back to the raw number string.
 */
function formatChartValue(v, numFmt) {
  if (numFmt === '0.0"%"') return `${v.toFixed(1)}%`;
  if (numFmt === '#,##0') return Math.round(v).toLocaleString('en-US');
  return String(v);
}

/**
 * Heckbert's "nice number" algorithm (Graphics Gems), used only for measurement
 * charts without an explicit valueAxisMin/valueAxisMax (e.g. Broadcast Latency, for
 * which chart-data.js:chartValueMeta() returns undefined min/max). Simply dividing
 * dataMax into ten produced awkward ticks (e.g. 112.8/10 = 11.28), and arithmetic
 * like 112.8*7/10 produced binary floating-point noise such as 78.96000000000001.
 * Charts with a fixed 0-100 range, like throughput, are already integers and keep the
 * fixed ten divisions.
 */
function niceAxisMaxAndStep(dataMax, targetTicks) {
  if (dataMax <= 0) return { axisMax: targetTicks, step: 1 };
  const rawStep = dataMax / targetTicks;
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / 10 ** exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  const step = niceFraction * 10 ** exponent;
  const axisMax = Math.ceil(dataMax / step) * step;
  return { axisMax, step };
}

/** Removes floating-point noise left by division/multiplication (e.g. 112.8*7/10 =
 *  78.96000000000001), the same pattern pdf-writer.js:rotatedTextOperator() uses for
 *  cos/sin. Rounding to 6 decimal places hides double-precision noise without losing
 *  the precision the ticks need. */
function roundAxisValue(v) {
  return Math.round(v * 1e6) / 1e6;
}

export function chartContent(chart, x, y, width, height) {
  const plotLeft = x + VALUE_AXIS_TITLE_MARGIN + TICK_LABEL_MARGIN;
  const plotRight = x + width - 10;
  const plotTop = y + height - TITLE_HEIGHT;
  const plotBottom = y + AXIS_LABEL_HEIGHT * 2;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotTop - plotBottom;

  const dataMax = Math.max(...chart.values);
  const axisMin = chart.valueAxisMin ?? 0;
  const hasExplicitRange = chart.valueAxisMin != null && chart.valueAxisMax != null;
  let axisMax;
  let gridlineCount;
  if (hasExplicitRange) {
    axisMax = chart.valueAxisMax;
    gridlineCount = GRIDLINE_COUNT;
  } else {
    const nice = niceAxisMaxAndStep(dataMax - axisMin, GRIDLINE_COUNT);
    axisMax = axisMin + nice.axisMax;
    gridlineCount = Math.round(nice.axisMax / nice.step);
  }
  const axisRange = axisMax - axisMin || 1;

  const ops = [];

  // frame (like Excel's chart-area border, enclosing the whole chart: title + plot area + labels)
  ops.push(rectOperator(x, y, width, height, { stroke: BORDER_GRAY }));

  // title (centered, with the full test name, unabbreviated, matching the Excel chart title)
  const titleWidth = helveticaWidth(chart.title, TITLE_SIZE);
  ops.push(blackText(chart.title, x + (width - titleWidth) / 2, y + height - 18, TITLE_SIZE));

  // Gridlines (horizontal, GRIDLINE_COUNT+1 including the baseline) plus each gridline's
  // tick label and Y-axis tick mark (Excel axis style: gridlines are light reference
  // lines, while the axis and its short tick marks are darker so the two are distinct)
  for (let i = 0; i <= gridlineCount; i++) {
    const gy = plotBottom + (plotHeight * i) / gridlineCount;
    ops.push(lineOperator(plotLeft, gy, plotRight, gy, { stroke: GRIDLINE_GRAY }));
    ops.push(lineOperator(plotLeft - TICK_MARK_LENGTH, gy, plotLeft, gy, { stroke: AXIS_LINE_GRAY }));

    const tickValue = roundAxisValue(axisMin + (axisRange * i) / gridlineCount);
    const tickText = formatChartValue(tickValue, chart.valueNumFmt);
    const tickWidth = helveticaWidth(tickText, TICK_LABEL_SIZE);
    ops.push(blackText(tickText, plotLeft - TICK_MARK_LENGTH - tickWidth - 4, gy - 3,
                       TICK_LABEL_SIZE));
  }

  // The axis lines themselves (vertical Y axis + horizontal X axis), drawn over the
  // gridlines in a darker color: they are the real plot-area boundary, not reference lines.
  ops.push(lineOperator(plotLeft, plotBottom, plotLeft, plotTop, { stroke: AXIS_LINE_GRAY }));
  ops.push(lineOperator(plotLeft, plotBottom, plotRight, plotBottom, { stroke: AXIS_LINE_GRAY }));

  // Bars + data labels + X-axis tick marks (no shadow: without alpha/blur support PDF
  // cannot draw Excel's soft shadow, and a hard grey rectangle would look worse)
  const n = chart.categories.length;
  const barSlot = plotWidth / n;
  const barWidth = barSlot * 0.6;
  chart.values.forEach((v, i) => {
    const barHeight = Math.max(0, ((v - axisMin) / axisRange) * plotHeight);
    const barX = plotLeft + barSlot * i + (barSlot - barWidth) / 2;
    ops.push(rectOperator(barX, plotBottom, barWidth, barHeight, { fill: BRAND_BLUE }));

    const barCenterX = barX + barWidth / 2;
    ops.push(lineOperator(barCenterX, plotBottom, barCenterX, plotBottom - TICK_MARK_LENGTH,
                          { stroke: AXIS_LINE_GRAY }));

    const labelText = formatChartValue(v, chart.valueNumFmt);
    const labelWidth = helveticaWidth(labelText, DATA_LABEL_SIZE);
    ops.push(blackText(labelText, barX + (barWidth - labelWidth) / 2,
                       plotBottom + barHeight + 4, DATA_LABEL_SIZE));

    const catText = String(chart.categories[i]);
    const catWidth = helveticaWidth(catText, CATEGORY_LABEL_SIZE);
    ops.push(blackText(catText, barX + (barWidth - catWidth) / 2, plotBottom - 14 - TICK_MARK_LENGTH,
                       CATEGORY_LABEL_SIZE));
  });

  // axis titles
  if (chart.categoryAxisTitle) {
    const t = chart.categoryAxisTitle;
    const tw = helveticaWidth(t, AXIS_TITLE_SIZE);
    ops.push(blackText(t, plotLeft + (plotWidth - tw) / 2, y + CATEGORY_AXIS_TITLE_MARGIN,
                       AXIS_TITLE_SIZE));
  }
  if (chart.valueAxisTitle) {
    // Vertical, reading bottom to top (the standard Y-axis title direction). The anchor's
    // x is the text baseline, with glyph height extending right; y is where the text
    // starts, extending up. It is centered vertically on the plot area and placed
    // against the chart's left edge.
    const t = chart.valueAxisTitle;
    const tw = helveticaWidth(t, AXIS_TITLE_SIZE);
    const anchorX = x + VALUE_AXIS_TITLE_MARGIN;
    const anchorY = plotBottom + (plotHeight - tw) / 2;
    ops.push(blackRotatedText(t, anchorX, anchorY, AXIS_TITLE_SIZE, 90));
  }

  return ops.join(' ');
}
