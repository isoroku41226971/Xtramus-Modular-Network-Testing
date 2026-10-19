/**
 * Chart data computation, shared by the Excel (ui/export-excel.js) and PDF
 * (ui/export-pdf.js) exports; each draws the same data in its own format (OOXML chart
 * XML vs. PDF vector operators).
 */

import { chartableValue, resolveChartField } from './format.js';

/**
 * Value-axis title / range / number format, chosen by the field name actually used
 * (the string chartDataFor() gets from resolveChartField(), not item.shape.resultKey
 * itself; the two can differ, see resolveChartField()). Three cases:
 * - throughput: the converged value is a loading %, naturally 0-100 (for every test;
 *   Address Learning converges on a rate but reuses the same resultKey). A fixed axis
 *   range makes charts of different tests directly comparable, instead of auto-scaling
 *   visually exaggerating differences when a run happens to have low loading.
 * - converged_mac_count: no natural upper bound (DUT capacity varies by device), so it
 *   auto-scales and only gets a thousands-separated integer format.
 * - anything else (latency, or an unresolvable field): the hardware counter's real unit
 *   is not certain, so no made-up unit, number format or fixed range is applied; blank
 *   is better than wrong.
 */
export function chartValueMeta(field) {
  if (field === 'throughput') {
    return { title: 'Throughput (%)', min: 0, max: 100, numFmt: '0.0"%"' };
  }
  if (field === 'converged_mac_count') {
    return { title: 'MAC Count', min: undefined, max: undefined, numFmt: '#,##0' };
  }
  return { title: 'Latency', min: undefined, max: undefined, numFmt: undefined };
}

export function chartDataFor(item, results) {
  const framesizes = Object.keys(results ?? {});
  if (framesizes.length === 0) return null;
  const values = framesizes.map(fs => chartableValue(item, results[fs]));
  if (values.some(v => v == null)) return null;
  const field = resolveChartField(item, results[framesizes[0]]);
  const valueMeta = chartValueMeta(field);
  return {
    title: `${item.name} — ${valueMeta.title} vs Frame Size`,
    categories: framesizes.map(Number),
    values,
    categoryAxisTitle: 'Frame Size (bytes)',
    valueAxisTitle: valueMeta.title,
    valueAxisMin: valueMeta.min,
    valueAxisMax: valueMeta.max,
    valueNumFmt: valueMeta.numFmt,
  };
}
