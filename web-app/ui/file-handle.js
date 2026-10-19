/**
 * The single gateway to the File System Access API, plus a download fallback.
 *
 * Only Chromium browsers (Chrome / Edge) have the File System Access API; Firefox and
 * Safari do not. All other code asks canUseFileSystemAccess() first and never touches
 * window.showSaveFilePicker directly. Modeled on Packet Studio's
 * components/file-handle.ts, with the extension changed to .xmnt.
 *
 * No jsdom, so this file has no automated tests: it is all real browser APIs, and Node
 * does not even have window.showOpenFilePicker. It is verified manually in a browser.
 */

const XMNT_FILE_TYPES = [
  { description: 'XMNT 專案', accept: { 'application/json': ['.xmnt'] } },
];

export function canUseFileSystemAccess() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';
}

/** The file was deleted or moved, so the handle should be discarded. */
export function isFileMissing(e) {
  return e instanceof DOMException && e.name === 'NotFoundError';
}

/**
 * Run a file picker; returns null when the user cancels.
 *
 * Cancelling throws AbortError, which is not an error, so it becomes null here and
 * callers need not tell "the user chose not to save" apart from "saving failed".
 */
async function pick(run) {
  try {
    return await run();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null;
    throw e;
  }
}

async function write(handle, text) {
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();     // without close the content never reaches the disk
  } catch (e) {
    await writable.abort().catch(() => {});
    throw e;
  }
}

/** Only picks a file and reads its text, without validating it; .xmnt parsing lives in project-file.js. */
export async function openProjectFile() {
  const handle = await pick(
    async () => (await window.showOpenFilePicker({ multiple: false, types: XMNT_FILE_TYPES }))[0],
  );
  if (handle === null) return null;
  return { handle, text: await (await handle.getFile()).text() };
}

/**
 * Only picks a location, without writing. Kept separate from writing on purpose: the
 * user may rename the file in the system dialog, and the name inside the project must
 * match the final file name, so callers get the handle first, read handle.name, build
 * the content with that name, and only then call writeProjectFile.
 */
export async function pickSaveLocation(suggestedName) {
  return pick(() => window.showSaveFilePicker({ suggestedName, types: XMNT_FILE_TYPES }));
}

export async function writeProjectFile(handle, text) {
  // A handle from showOpenFilePicker is read-only, so ask before writing.
  // A button click counts as a user gesture, which the permission prompt requires
  if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      throw new Error('沒有寫入這個檔案的權限');
    }
  }
  await write(handle, text);
}

/**
 * Drop a single .xmnt file. getAsFileSystemHandle() must be called synchronously in
 * the event handler: the DataTransferItem becomes invalid once the event ends, so the
 * call itself (not its result) must be synchronous. Only the first file item is
 * handled; this is about one project, not a multi-file import.
 */
export async function readDroppedFile(dataTransfer) {
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file === null) continue;

    const handlePromise = typeof item.getAsFileSystemHandle === 'function'
      ? item.getAsFileSystemHandle()
      : Promise.resolve(null);
    const handle = await handlePromise.catch(() => null);

    return { file, handle: handle && handle.kind === 'file' ? handle : null };
  }
  return null;
}

/** Save-as fallback when the File System Access API is not supported. */
export function downloadText(text, filename, mimeType = 'application/json') {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Defer the release to the next tick: a synchronous revoke could free the blob before
  // the browser has queued the download
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Same download flow as downloadText, for binary content (e.g. a generated .xlsx).
 *  Deliberately not merged with downloadText, whose existing callers keep its
 *  signature unchanged. */
export function downloadBinary(bytes, filename, mimeType) {
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
