/**
 * The .xmnt project file format and its serialization. Pure functions; the file system
 * side is in file-handle.js.
 *
 * Only test items and queue order are saved: no lease and no run results. The queue is
 * stored as an array of itemIds (queueIds are regenerated on open); it is an array, not
 * a set, because the same item can be queued twice.
 */

export const PROJECT_FILE_FORMAT = 'xmnt-project';
export const PROJECT_FILE_VERSION = 1;
export const DEFAULT_PROJECT_NAME = '未命名專案';

export function serializeProjectFile({ name, items, queue }) {
  return JSON.stringify({
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    name,
    items,
    queue: (queue ?? []).map(q => q.itemId),
  }, null, 2);
}

/**
 * Parse failures always return { ok:false, error } instead of throwing, so callers need
 * no try/catch and a broken file cannot take down the page.
 */
export function parseProjectFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是合法的 JSON' };
  }
  if (parsed?.format !== PROJECT_FILE_FORMAT) {
    return { ok: false, error: '不是 .xmnt 專案檔' };
  }
  if (parsed.version !== PROJECT_FILE_VERSION) {
    return { ok: false, error: `不支援的版本:${parsed.version}` };
  }
  if (!Array.isArray(parsed.items)) {
    return { ok: false, error: '缺少 items' };
  }
  if (!Array.isArray(parsed.queue)) {
    return { ok: false, error: '缺少 queue' };
  }
  return {
    ok: true,
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : DEFAULT_PROJECT_NAME,
    items: parsed.items,
    queue: parsed.queue,
  };
}

/**
 * Snapshot used to detect unsaved changes. The queue keeps only itemIds: queueIds change
 * on every rebuild, and comparing them would show "unsaved" right after saving with no
 * changes.
 */
export function projectSnapshot({ name, items, queue }) {
  return JSON.stringify({ name, items, queue: (queue ?? []).map(q => q.itemId) });
}

/**
 * Turn the name the user typed into a valid file name. The extension is not added again
 * if it is already correct: typing test1.xmnt and choosing xmnt would otherwise give
 * test1.xmnt.xmnt, which really happens.
 */
export function safeFilename(name, extension = 'xmnt') {
  const cleaned = name.replace(/[/\\:*?"<>|]/g, '_').trim();
  const suffix = `.${extension}`;

  if (cleaned.toLowerCase().endsWith(suffix.toLowerCase())) {
    const stem = cleaned.slice(0, -suffix.length);
    return stem ? cleaned : `${DEFAULT_PROJECT_NAME}${suffix}`;
  }
  return `${cleaned || DEFAULT_PROJECT_NAME}${suffix}`;
}

/**
 * The inverse of safeFilename. The extension match is case-insensitive because the
 * system save dialog may return an uppercase extension.
 */
export function projectNameFromFilename(filename, extension = 'xmnt') {
  const suffix = `.${extension}`;
  const stem = filename.toLowerCase().endsWith(suffix.toLowerCase())
    ? filename.slice(0, -suffix.length)
    : filename;
  return stem || DEFAULT_PROJECT_NAME;
}
