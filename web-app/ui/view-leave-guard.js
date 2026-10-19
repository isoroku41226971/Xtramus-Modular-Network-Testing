/**
 * Confirmation before leaving with unsaved changes. Clicking the header logo and closing
 * the project both go through here.
 *
 * The browser's beforeunload cannot show custom text (an anti-phishing measure), so this
 * is the only place a clear message is possible: in-app exit paths ask whether to save
 * first, and only closing the tab or reloading falls back to the browser's generic message.
 *
 * No jsdom, so this file has no automated tests.
 */
export function confirmLeave(dialogEl, { onSave, onDiscard, canSave }) {
  return new Promise(resolveOuter => {
    dialogEl.replaceChildren();

    const title = document.createElement('h3');
    title.textContent = '有未儲存的變更';
    const body = document.createElement('p');
    body.className = 'muted';
    body.textContent = '要先儲存嗎?不儲存的話,這次的變更會不見。';

    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.onclick = () => { dialogEl.close(); resolveOuter('cancel'); };

    const discard = document.createElement('button');
    discard.textContent = '不儲存直接離開';
    discard.onclick = () => { dialogEl.close(); onDiscard(); resolveOuter('discard'); };

    const save = document.createElement('button');
    save.className = 'primary';
    save.textContent = '儲存';
    save.disabled = !canSave;
    if (!canSave) save.title = '這個瀏覽器不支援直接儲存,請用工具列的「另存新檔」';
    save.onclick = async () => {
      save.disabled = true;
      const ok = await onSave();
      if (ok) { dialogEl.close(); resolveOuter('save'); }
      else save.disabled = !canSave;    // saving failed or Save As was cancelled; stay in the dialog to retry
    };

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.append(cancel, discard, save);

    dialogEl.append(title, body, actions);
    dialogEl.showModal();
  });
}
