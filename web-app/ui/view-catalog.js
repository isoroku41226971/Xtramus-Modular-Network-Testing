/**
 * The picker for adding a test item: 10 presets + one blank custom item.
 *
 * Picking only creates the item; it is **not queued** and the editor does not open. To
 * tune parameters, press "Edit" on the card. If adding an item also queued it, a user who
 * only wanted to assemble something to look at would find the queue filling up on its own.
 *
 * No jsdom, so this file has no automated tests; the logic lives in item-edit.js.
 */

import { PRESETS } from '../engine/catalog.js';
import { blankItem, itemFromPreset, defaultPortsFor } from './item-edit.js';

/** Create a test item with default ports. Shared by the picker and the quick-add bar. */
function addItem(store, item) {
  const leased = store.getState().project?.ports ?? [];
  item.ports = defaultPortsFor(item.recipe.topology, leased);
  store.dispatch({ type: 'add-item', item });
}

/**
 * Click feedback: a small bounce on press (see .chip.pop in style.css) confirming the hit.
 * Used only by the quick-add bar: clicking a chip in the picker (mountCatalog) closes the
 * dialog in the same synchronous turn, before the animation can paint a single frame, so
 * it would never be visible there.
 *
 * Remove, force a reflow, then add: if the user clicks again while the animation is
 * still playing, adding a class that is already present does not restart the animation,
 * so it is removed first and the browser must settle the "no class" state before
 * re-adding it replays the animation.
 */
function bounceChip(btn) {
  btn.classList.remove('pop');
  void btn.offsetWidth;
  btn.classList.add('pop');
  btn.addEventListener('animationend', () => btn.classList.remove('pop'), { once: true });
}

/** Quick-add bar: 10 presets; one click creates a test item (again without queuing it). */
export function mountQuickAdd(el, store) {
  el.replaceChildren();
  for (const [key, preset] of Object.entries(PRESETS)) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = preset.label;
    btn.onclick = () => { bounceChip(btn); addItem(store, itemFromPreset(key)); };
    el.append(btn);
  }
}

export function mountCatalog(dialogEl, store) {
  const add = item => {
    addItem(store, item);
    dialogEl.close();
  };

  const render = () => {
    dialogEl.replaceChildren();

    const title = document.createElement('h3');
    title.textContent = '新增測試項';
    dialogEl.append(title);

    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = '挑一個起點。加進來之後按卡片上的「編輯」調參數。';
    dialogEl.append(hint);

    const list = document.createElement('div');
    list.className = 'picker';
    for (const [key, preset] of Object.entries(PRESETS)) {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.textContent = preset.label;
      btn.onclick = () => add(itemFromPreset(key));
      list.append(btn);
    }
    dialogEl.append(list);

    // blank custom item: no dimension chosen yet, assembled from scratch in the editor
    const custom = document.createElement('button');
    custom.className = 'chip custom';
    custom.textContent = '＋ 自訂(空白,從頭組裝)';
    custom.onclick = () => add(blankItem());

    const cancel = document.createElement('button');
    cancel.textContent = '取消';
    cancel.onclick = () => dialogEl.close();

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.append(cancel);
    dialogEl.append(custom, actions);
  };

  return { open() { render(); dialogEl.showModal(); } };
}
