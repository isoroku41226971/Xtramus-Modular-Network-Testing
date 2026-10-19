/**
 * Home page: two cards (new project / open project), plus a drop zone and a hidden
 * <input type=file> fallback for browsers without the File System Access API.
 *
 * Flat design: icons are inline SVG (paths borrowed from lucide-icons, an MIT-licensed
 * open-source icon set; only the drawings are borrowed, no package is installed).
 * render() wraps the content in a .home-content container plus two decorative divs,
 * purely so the content stacks above the decorations (CSS z-index layers).
 *
 * The cursor-following glow: mountCursorGlow() from ui/cursor-glow.js is called once in
 * mountHome() (not on every render()), because the element it creates carries JS state
 * (current position, rAF handle, listeners); render()'s el.replaceChildren() just
 * re-inserts that same element rather than re-creating it.
 *
 * No jsdom, so this file has no automated tests.
 */

import { portLabel } from './ports.js';
import { isSelectable } from './project.js';
import { statusDot } from './view-status-dot.js';
import { toggle } from './view-toggle.js';
import { mountCursorGlow } from './cursor-glow.js';

// lucide-icons' plus / folder-open, with stroke-width raised from the default 2 to 2.4
// (the design calls for bold geometric strokes of 2-2.5px). The SVG strings are hard-coded
// constants, not user input, so assigning them with innerHTML poses no XSS risk.
const ICON_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M5 12h14"/><path d="M12 5v14"/></svg>';
const ICON_FOLDER_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
  + 'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 '
  + '1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 '
  + '2 0 0 1 2 2v2"/></svg>';

function card(iconSvg, title, desc, onClick, variant) {
  const btn = document.createElement('button');
  btn.className = `home-card home-card-${variant}`;

  const iconCircle = document.createElement('span');
  iconCircle.className = 'home-card-icon';
  iconCircle.innerHTML = iconSvg;

  const t = document.createElement('span');
  t.className = 'title';
  t.textContent = title;

  const d = document.createElement('span');
  d.className = 'muted';
  d.textContent = desc;

  btn.append(iconCircle, t, d);
  btn.onclick = () => onClick();
  return btn;
}

export function mountHome(el, {
  store, ports, canOpenViaPicker, onCreateNew, onOpenViaPicker, onOpenViaInput, onDropFile,
}) {
  let error = null;
  let inputEl = null;

  // Called only once, not inside render(): el (the .home container itself) is never
  // replaced by render()'s el.replaceChildren() (only its children are rebuilt), so the
  // listeners and rAF state survive every render(). render() only re-inserts this same
  // element instead of calling mountCursorGlow() again (which would stack duplicate
  // listeners and reset the animation position on every redraw).
  const cursorGlowEl = mountCursorGlow(el);

  const render = () => {
    const { simulate } = store.getState();
    const ps = ports.getState();
    el.replaceChildren();

    // background decorations: z-index 0, beneath .home-content (z-index 1)
    const decoCircle = document.createElement('div');
    decoCircle.className = 'home-deco home-deco-circle';
    const decoSquare = document.createElement('div');
    decoSquare.className = 'home-deco home-deco-square';
    el.append(decoCircle, decoSquare);
    // cursorGlowEl is the single element created once at the top of mountHome(); it is only
    // re-inserted here (el.replaceChildren() just removed it), not re-created, so the
    // current follow position and listeners are kept. null means it is disabled for this
    // device/setting (prefers-reduced-motion or touch), and there is nothing to do.
    if (cursorGlowEl) el.append(cursorGlowEl);

    const content = document.createElement('div');
    content.className = 'home-content';
    el.append(content);

    const h = document.createElement('h1');
    h.textContent = 'XMNT';
    const fullName = document.createElement('p');
    fullName.className = 'home-fullname';
    fullName.textContent = 'Xtramus Modular Network Testing';
    const sub = document.createElement('p');
    sub.className = 'muted home-subtitle';
    sub.textContent = '模組化網路測試 —— 組裝測試項、排入待測區、對機箱執行';
    content.append(h, fullName, sub);

    const simLabel = document.createElement('label');
    simLabel.className = 'switch-field';
    const simBtn = toggle(simulate === true,
      v => store.dispatch({ type: 'set-simulate', value: v }),
      { ariaLabel: '模擬模式(不連機箱)' });
    simLabel.append(simBtn, ' 模擬模式(不連機箱)');
    content.append(simLabel);

    const cards = document.createElement('div');
    cards.className = 'home-cards';
    cards.append(
      card(ICON_PLUS, '建立新專案', '從頭組裝', () => onCreateNew(), 'primary'),
      card(ICON_FOLDER_OPEN, '開啟專案', '開啟 .xmnt 專案檔', () => {
        if (canOpenViaPicker) { onOpenViaPicker(); return; }
        inputEl?.click();
      }, 'deep'),
    );
    content.append(cards);

    const drop = document.createElement('div');
    drop.className = 'dropzone';
    drop.textContent = '或把 .xmnt 檔案拖曳到這裡';
    drop.ondragover = ev => { ev.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = ev => {
      ev.preventDefault();
      drop.classList.remove('over');
      onDropFile(ev);
    };
    content.append(drop);

    // browsers without the File System Access API use this for "Open project"
    inputEl = document.createElement('input');
    inputEl.type = 'file';
    inputEl.accept = '.xmnt';
    inputEl.hidden = true;
    inputEl.onchange = () => {
      const file = inputEl.files?.[0];
      if (file) onOpenViaInput(file);
      inputEl.value = '';     // clear it so the same file can be picked twice in a row
    };
    content.append(inputEl);

    if (error) {
      const p = document.createElement('p');
      p.className = 'validate blocked';
      p.textContent = error;
      content.append(p);
    }

    const foot = document.createElement('div');
    foot.className = 'muted';
    if (ps.available) {
      ps.ports.forEach((p, i) => {
        if (i > 0) foot.append('　·　');
        const entry = document.createElement('span');
        entry.className = 'port-status';
        entry.append(statusDot(isSelectable(p)), portLabel(p));
        foot.append(entry);
      });
    } else {
      foot.textContent = ps.error
        ? `無法連上通道服務(${ps.error})。可以先用模擬模式組裝與試跑,不需要機箱。`
        : '尚未連上通道服務。可以先用模擬模式組裝與試跑,不需要機箱。';
    }
    content.append(foot);
  };

  store.subscribe(render);
  render();

  return {
    refresh: render,
    setError(text) { error = text; render(); },
  };
}
