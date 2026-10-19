/** Cards for assembled test items. "Edit" opens the editor; "add to queue" queues the item. */

import { validateItem } from './messages.js';
import { queueBlockReason } from './queue.js';
import { parseCapture } from '../engine/capture-parser.js';
import { readDroppedFile } from './file-handle.js';

const isRunning = (state, id) =>
  state.queue.some(q => q.itemId === id && q.status === 'running');

/**
 * Lets a card accept a capture file directly: drop a .pcap / .pcapng on it to import,
 * without opening the editor first.
 *
 * **Only custom-packet cards (stream === 'Custom') get this**; for other tests the chassis
 * generates the frames from parameters, so there is no file to import.
 *
 * Not accepted while running, for the same reason the editor locks its form during a
 * run: that run uses a snapshot, so a change would not affect the running result, and
 * allowing it would only suggest it does.
 */
function attachCaptureDrop(card, item, store, running) {
  const existing = item.params?.stream?.pcap_file;
  const hint = document.createElement('div');
  hint.className = 'muted';
  if (running) {
    hint.textContent = '執行中,暫時不能更換擷取檔。';
  } else if (existing) {
    hint.textContent =
      `目前:${existing.fileName} · ${existing.packets.length} 筆封包(再拖一份可覆蓋)`;
  } else {
    hint.textContent = '可以直接把 .pcap / .pcapng 檔案拖到這張卡片匯入。';
  }
  card.append(hint);

  if (running) return;

  // On a parse failure nothing goes into the store, so no redraw happens; the error message
  // is attached to the card directly and stays until the next redraw
  const err = document.createElement('div');
  err.className = 'validate blocked';
  err.hidden = true;
  card.append(err);

  card.classList.add('accepts-capture');
  card.ondragover = ev => { ev.preventDefault(); card.classList.add('drop-over'); };
  card.ondragleave = () => card.classList.remove('drop-over');
  card.ondrop = async ev => {
    ev.preventDefault();
    card.classList.remove('drop-over');

    const dropped = await readDroppedFile(ev.dataTransfer);
    if (dropped === null) return;

    try {
      const { packets } = parseCapture(await dropped.file.arrayBuffer());
      store.dispatch({
        type: 'patch-item', id: item.id,
        patch: {
          params: {
            ...item.params,
            stream: { ...item.params?.stream,
                      pcap_file: { packets, fileName: dropped.file.name } },
          },
        },
      });
    } catch (e) {
      err.textContent = String(e?.message ?? e);
      err.hidden = false;
    }
  };
}

export function mountItems(el, store, { onEdit }) {
  // A drop that misses the card would make the browser open the file by default and
  // navigate away, losing unsaved project content. Blocking the default at the container
  // makes a missed drop quietly do nothing; it does not let other cards import, it just
  // keeps the user on the page.
  el.ondragover = ev => ev.preventDefault();
  el.ondrop = ev => ev.preventDefault();

  const render = () => {
    const state = store.getState();
    const { items } = state;
    el.replaceChildren();

    if (items.length === 0) {
      const p = document.createElement('span');
      p.style.opacity = '.5';
      p.textContent = '還沒有測試項。按上面的「＋ 新增測試項」挑一個起點。';
      el.append(p);
      return;
    }

    for (const item of items) {
      const v = validateItem(item);
      const card = document.createElement('div');
      card.className = `card ${v.level}`;

      const title = document.createElement('div');
      title.textContent = item.name;
      card.append(title);

      const desc = document.createElement('div');
      desc.className = 'muted';
      desc.textContent = [item.recipe.topology, item.recipe.stream,
        Array.isArray(item.recipe.reader) ? item.recipe.reader.join('+') : item.recipe.reader]
        .filter(Boolean).join(' · ');
      card.append(desc);

      if (v.messages.length > 0) {
        const note = document.createElement('div');
        note.className = `validate ${v.level}`;
        note.textContent = v.messages.join('　');
        card.append(note);
      }

      // This item cannot be queued right now. The reason comes from a different source than
      // v.messages (validateItem only checks the item itself and knows nothing about the
      // queue), so it gets its own hint instead of being squeezed into the one above.
      const blockReason = queueBlockReason(state, item);
      if (blockReason) {
        const note = document.createElement('div');
        note.className = 'validate warned';
        note.textContent = blockReason;
        card.append(note);
      }

      if (item.recipe.stream === 'Custom') {
        attachCaptureDrop(card, item, store, isRunning(state, item.id));
      }

      const edit = document.createElement('button');
      edit.textContent = '編輯';
      edit.onclick = () => onEdit(item);

      const add = document.createElement('button');
      add.textContent = '排入待測區';
      add.disabled = !v.canQueue || blockReason != null;
      add.onclick = () => store.dispatch({ type: 'enqueue', itemId: item.id });

      const del = document.createElement('button');
      del.textContent = '✕';
      del.onclick = () => store.dispatch({ type: 'remove-item', id: item.id });

      const bar = document.createElement('div');
      bar.append(edit, ' ', add, ' ', del);
      card.append(bar);
      el.append(card);
    }
  };

  store.subscribe(render);
  render();
}
