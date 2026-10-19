/**
 * Toolbar: project name + unsaved marker + Save / Save As.
 *
 * Without a file handle, "Save" does not silently become Save As; it shows a "this is a
 * new, unsaved project" prompt, following Packet Studio's original design: a silent switch
 * would make users think they were overwriting a file while actually creating another.
 *
 * Returns { isDirty, save, supported } so the caller can wire up the leave confirmations
 * (logo / close project / beforeunload); those paths also need to know whether there are
 * unsaved changes and to trigger a save, and should not each recompute that.
 *
 * The savedSnapshot baseline is locked to the store's contents at mount time (the moment
 * this function is called), so callers must call it as early as possible (main-workspace.js
 * does so at the top), not after any async work (such as loading the handle from
 * IndexedDB); otherwise edits made while waiting would be mistaken for the original state.
 *
 * No jsdom, so this file has no automated tests. The projectSnapshot used for the dirty
 * check lives in project-file.js, which is covered by tests.
 */

import {
  canUseFileSystemAccess, isFileMissing, pickSaveLocation, writeProjectFile, downloadText,
} from './file-handle.js';
import {
  serializeProjectFile, projectSnapshot, safeFilename, projectNameFromFilename,
} from './project-file.js';

export function mountSaveBar(el, {
  store, getHandle, setHandle, needSaveAsDialog, saveAsDialog,
}) {
  const supported = canUseFileSystemAccess();
  let savedSnapshot = projectSnapshot(store.getState());
  let message = null;
  let messageTimer = null;

  const dirty = () => projectSnapshot(store.getState()) !== savedSnapshot;

  function flash(kind, text) {
    message = { kind, text };
    if (messageTimer !== null) clearTimeout(messageTimer);
    // the success message fades after a few seconds, since a lingering "Saved" after further edits would mislead; errors stay
    messageTimer = kind === 'ok' ? setTimeout(() => { message = null; render(); }, 3000) : null;
    render();
  }

  async function writeCurrent(handle) {
    await writeProjectFile(handle, serializeProjectFile(store.getState()));
  }

  function openNeedSaveAsDialog() {
    return new Promise(resolve => {
      needSaveAsDialog.replaceChildren();
      const h = document.createElement('h3');
      h.textContent = '這是尚未儲存的新專案';
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = '要先指定儲存位置。之後按「儲存」就會直接寫回同一個檔案,不會再問。';

      const cancel = document.createElement('button');
      cancel.textContent = '取消';
      cancel.onclick = () => { needSaveAsDialog.close(); resolve(false); };

      const go = document.createElement('button');
      go.className = 'primary';
      go.textContent = '另存新檔';
      go.onclick = () => { needSaveAsDialog.close(); resolve(true); };

      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      actions.append(cancel, go);

      needSaveAsDialog.append(h, p, actions);
      needSaveAsDialog.showModal();
    });
  }

  function openSaveAsNameDialog(defaultName) {
    return new Promise(resolve => {
      saveAsDialog.replaceChildren();
      const h = document.createElement('h3');
      h.textContent = '另存新檔';

      const label = document.createElement('label');
      label.className = 'field';
      const span = document.createElement('span');
      span.textContent = '專案名稱';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = defaultName;
      label.append(span, input);

      const cancel = document.createElement('button');
      cancel.textContent = '取消';
      cancel.onclick = () => { saveAsDialog.close(); resolve(null); };

      const go = document.createElement('button');
      go.className = 'primary';
      go.textContent = '儲存';
      go.onclick = () => { saveAsDialog.close(); resolve(input.value); };

      const actions = document.createElement('div');
      actions.className = 'dialog-actions';
      actions.append(cancel, go);

      saveAsDialog.append(h, label, actions);
      saveAsDialog.showModal();
    });
  }

  async function saveAs() {
    const name = await openSaveAsNameDialog(store.getState().name);
    if (name === null) return false;      // user cancelled

    if (!supported) {
      const filename = safeFilename(name);
      const finalName = projectNameFromFilename(filename);
      store.dispatch({ type: 'rename-project', name: finalName });
      downloadText(serializeProjectFile(store.getState()), filename);
      savedSnapshot = projectSnapshot(store.getState());
      flash('ok', `已下載 ${filename}`);
      return true;
    }

    let handle;
    try {
      handle = await pickSaveLocation(safeFilename(name));
    } catch (e) {
      flash('error', e instanceof Error ? e.message : String(e));
      return false;
    }
    if (handle === null) return false;    // user cancelled in the system dialog

    // trust what is on disk: the user may have renamed the file in the system dialog
    const finalName = projectNameFromFilename(handle.name);
    store.dispatch({ type: 'rename-project', name: finalName });
    try {
      await writeCurrent(handle);
    } catch (e) {
      flash('error', e instanceof Error ? e.message : String(e));
      return false;
    }
    await setHandle(handle);
    savedSnapshot = projectSnapshot(store.getState());
    flash('ok', `已儲存到 ${handle.name}`);
    return true;
  }

  async function save() {
    if (!supported) return false;         // the button is already disabled; this is a safeguard
    const handle = getHandle();
    if (!handle) {
      const wantsSaveAs = await openNeedSaveAsDialog();
      return wantsSaveAs ? saveAs() : false;
    }
    try {
      await writeCurrent(handle);
      savedSnapshot = projectSnapshot(store.getState());
      flash('ok', `已儲存到 ${handle.name}`);
      return true;
    } catch (e) {
      if (isFileMissing(e)) {
        await setHandle(null);
        flash('error', '原本的檔案已經不在了,請用「另存新檔」');
        return false;
      }
      flash('error', e instanceof Error ? e.message : String(e));
      return false;
    }
  }

  function render() {
    el.replaceChildren();

    const name = document.createElement('span');
    name.textContent = store.getState().name;
    el.append(name);

    if (dirty()) {
      const dot = document.createElement('span');
      dot.className = 'unsaved-dot';
      dot.textContent = '● 未儲存';
      el.append(dot);
    }

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '儲存';
    saveBtn.disabled = !supported;
    saveBtn.onclick = () => { void save(); };
    el.append(saveBtn);

    const saveAsBtn = document.createElement('button');
    saveAsBtn.textContent = '另存新檔';
    saveAsBtn.onclick = () => { void saveAs(); };
    el.append(saveAsBtn);

    if (!supported) {
      const note = document.createElement('span');
      note.className = 'muted';
      note.textContent = '這個瀏覽器不支援寫回原檔,請用「另存新檔」';
      el.append(note);
    }

    if (message) {
      const m = document.createElement('span');
      m.className = message.kind === 'ok' ? 'muted' : 'validate blocked';
      m.textContent = message.text;
      el.append(m);
    }
  }

  store.subscribe(render);
  render();

  return { isDirty: dirty, save, supported };
}
