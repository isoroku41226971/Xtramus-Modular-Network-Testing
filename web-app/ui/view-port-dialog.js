/**
 * Port picker dialog, using the native <dialog> (no dependencies; showModal() provides the
 * backdrop and Esc-to-close).
 *
 * No jsdom, so this file has no automated tests. Grouping, selectability and conflict
 * explanations live in project.js.
 */

import { groupPortsByBoard, isSelectable, conflictNotes, portKey } from './project.js';
import { portLabel } from './ports.js';
import { toggle } from './view-toggle.js';

export function openPortDialog(dialogEl, { ports, preselect = [], onConfirm }) {
  dialogEl.replaceChildren();

  const title = document.createElement('h3');
  title.textContent = '選擇這次要用的埠位';
  dialogEl.append(title);

  // without a gateway there are no ports to pick (the normal case until a real channel is connected), so state the way out plainly
  if (!ports.available) {
    const p = document.createElement('p');
    p.className = 'dialog-note';
    p.textContent = '無法連上通道服務,請改用模擬模式。';
    const close = document.createElement('button');
    close.textContent = '關閉';
    close.onclick = () => dialogEl.close();
    dialogEl.append(p, close);
    dialogEl.showModal();
    return;
  }

  // ports used last time but unavailable now are flagged, not blocked; the user can pick others and continue
  for (const n of conflictNotes(preselect, ports.ports)) {
    const note = document.createElement('div');
    note.className = 'dialog-note';
    note.textContent = `上次用的 ${portKey(n.port)} 現在${n.reason},請改選別的`;
    dialogEl.append(note);
  }

  const chosen = new Set();
  const wanted = new Set(preselect.map(portKey));

  const err = document.createElement('div');
  err.className = 'dialog-note';
  err.hidden = true;

  const cancel = document.createElement('button');
  cancel.textContent = '取消';
  cancel.onclick = () => dialogEl.close();

  const confirm = document.createElement('button');
  confirm.className = 'primary';
  confirm.textContent = '確認並進入';

  for (const group of groupPortsByBoard(ports.ports)) {
    const box = document.createElement('div');
    box.className = 'port-group';
    const b = document.createElement('b');
    b.textContent = group.label;
    box.append(b);

    for (const p of group.ports) {
      const ok = isSelectable(p);
      const line = document.createElement('label');
      line.className = ok ? 'port-line' : 'port-line off';

      const initiallyChecked = ok && wanted.has(portKey(p.port));
      if (initiallyChecked) chosen.add(portKey(p.port));

      const sw = toggle(initiallyChecked, checkedNow => {
        if (checkedNow) chosen.add(portKey(p.port));
        else chosen.delete(portKey(p.port));
        confirm.disabled = chosen.size === 0;
      }, { disabled: !ok });

      line.append(sw, ` ${portLabel(p)}`);
      box.append(line);
    }
    dialogEl.append(box);
  }

  confirm.disabled = chosen.size === 0;
  confirm.onclick = async () => {
    confirm.disabled = true;
    err.hidden = true;
    const picked = ports.ports
      .filter(p => chosen.has(portKey(p.port)))
      .map(p => p.port);
    try {
      await onConfirm(picked);
    } catch (e) {
      // if the ports can't be had (409), stay in the dialog so the user can pick again instead of starting over
      err.textContent = String(e?.message ?? e);
      err.hidden = false;
      confirm.disabled = false;
    }
  };

  const actions = document.createElement('div');
  actions.className = 'dialog-actions';
  actions.append(cancel, confirm);
  dialogEl.append(err, actions);
  dialogEl.showModal();
}
