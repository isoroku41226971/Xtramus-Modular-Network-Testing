/**
 * Turns validation results into on-screen hints. Pure functions, no DOM.
 *
 * The three states are kept distinct on purpose:
 *   incomplete  not every dimension is chosen; the user needs to see what is still
 *               missing, not a pile of rule errors
 *   blocked     would crash or silently compute wrong results; stop it
 *   warned      valid but possibly not what was intended; warn, but allow it
 */

import { DIMENSIONS, validateRecipe } from '../engine/catalog.js';
import { buildRecipeForValidation, SHAPES_WITHOUT_CHECK } from './spec-build.js';
import { portFieldsFor, allowedChecksFor } from './item-edit.js';

export const DIMENSION_LABELS = {
  topology: 'Topology(拓樸)',
  learning: 'Learning(學習)',
  stream: 'Stream(封包)',
  trigger: 'Trigger(觸發)',
  reader: 'Reader(讀取)',
};

/** What "filled in" means for ports: a single port must be a triple, and a mesh list needs at least one entry. */
function hasPort(v) {
  if (v == null) return false;
  return Array.isArray(v[0]) ? v.length > 0 : v.length === 3;
}

export function validateItem(item) {
  const missing = DIMENSIONS.filter(d => !item.recipe?.[d]);

  // without a topology we don't know which ports are needed, so only report the missing dimensions
  const missingPorts = item.recipe?.topology
    ? portFieldsFor(item).filter(f => !hasPort(item.ports?.[f]))
    : [];

  // skip the compatibility rules until everything is chosen; a half-built recipe trips many rules and those messages would bury the point
  if (missing.length > 0 || missingPorts.length > 0) {
    const messages = [];
    if (missing.length > 0) {
      messages.push(`還要選:${missing.map(d => DIMENSION_LABELS[d]).join('、')}`);
    }
    if (missingPorts.length > 0) {
      messages.push(`還要指定埠位:${missingPorts.join('、')}`);
    }
    return { level: 'incomplete', canQueue: false, messages };
  }

  const { blocks, warnings } = validateRecipe(buildRecipeForValidation(item));
  const messages = blocks.map(r => r.message);

  // A shape that uses shape.check must have a check that actually works; otherwise
  // buildSpec throws "unknown check". The engine's check-must-match-reader has an
  // `r.check != null` guard, so it catches "wrong choice" but misses "nothing to choose
  // from" (e.g. StreamLatency fits no check at all).
  //
  // The measurement and pure-send shapes ignore shape.check (buildSpec never reads it for
  // them); use the shared SHAPES_WITHOUT_CHECK list rather than hard-coding strings here.
  if (!SHAPES_WITHOUT_CHECK.has(item.shape?.kind)
      && !allowedChecksFor(item).includes(item.shape?.check)
      && !blocks.some(r => r.id === 'check-must-match-reader')) {
    messages.push('這個 Reader 沒有可用的判別函式,或還沒選 —— '
                + '請改用「量測(無判定)」形狀,或換一個 Reader。');
  }

  if (messages.length > 0) {
    return { level: 'blocked', canQueue: false, messages };
  }
  if (warnings.length > 0) {
    return { level: 'warned', canQueue: true, messages: warnings.map(r => r.message) };
  }
  return { level: 'ok', canQueue: true, messages: [] };
}
