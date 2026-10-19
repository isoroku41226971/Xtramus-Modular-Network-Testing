/**
 * Custom dropdown replacing native <select> across the app, recreating the open/close
 * animation, rotating chevron and keyboard navigation of smoothui's basic-dropdown
 * (github.com/educlopez/smoothui). That component depends on React + Motion (Framer
 * Motion) + lucide, which cannot be used in a project with zero npm dependencies and no
 * build step, so the same look and behavior are rebuilt in plain JS + CSS without its
 * code or dependencies.
 *
 * It was first tried on the five dimension menus in view-editor.js (inside a <dialog>,
 * where positioning problems are most likely: overflow-y:auto clipping, click-outside,
 * keyboard navigation) and then rolled out to every dropdown in view-editor.js.
 *
 * Animation uses CSS transitions, not a JS animation library; prefers-reduced-motion is
 * handled with a native CSS media query, simpler than smoothui's JS hook.
 *
 * No jsdom, so this file has no automated tests. The "which item does this key move to"
 * logic lives in ui/listbox-nav.js, which is covered by tests.
 */

import { nextIndex } from './listbox-nav.js';

// Same calling convention as the native <select> it replaced: listbox(options, value,
// onChange) returns an element ready for el.append(). disabled corresponds to
// <select disabled>, used for the check function when there is no valid option (view-editor.js).

let uid = 0;

export function listbox(options, value, onChange, { disabled = false } = {}) {
  const id = `listbox-${(uid += 1)}`;
  const activeDescendantId = i => `${id}-opt-${i}`;

  const wrap = document.createElement('div');
  wrap.className = 'listbox';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'listbox-trigger';
  trigger.disabled = disabled;   // a natively disabled button receives no click/focus, so nothing else is needed
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'listbox-label';

  const chevron = document.createElement('span');
  chevron.className = 'listbox-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';

  trigger.append(label, chevron);
  wrap.append(trigger);

  const panel = document.createElement('ul');
  panel.className = 'listbox-panel';
  panel.id = id;
  panel.setAttribute('role', 'listbox');
  panel.hidden = true;

  // The panel is deliberately not a child of wrap; it is attached elsewhere only while open.
  // view-editor.js's field() wraps every field in <label class="field">, and browsers give
  // <label> built-in behavior: a click anywhere inside it is forwarded to the first
  // labelable form control inside (here, trigger).
  //
  // If the panel stayed inside wrap (and so inside the <label>), clicking an option would
  // make the browser synthesize an extra click on trigger. That click lands right after
  // choose() has set open back to false, so trigger.onclick sees open===false, treats it as
  // "the user wants to open", and reopens the panel. Because choose() already updated
  // currentValue, the reopened panel highlights the new option, which looks like "the
  // selection worked but the panel didn't close" when it actually worked and was then
  // reopened by accident.
  //
  // Where it attaches cannot simply be document.body: when a <dialog> is opened with
  // showModal(), the browser promotes the whole dialog (with its translucent backdrop) to
  // the separate top layer, and anything outside the top layer, whatever its z-index, ends
  // up beneath the backdrop and receives no clicks (the first version of this fix hit
  // exactly that: the panel vanished).
  //
  // The fix is to attach it to trigger's nearest ancestor <dialog> (found with closest()
  // on every open rather than cached, covering any future nesting). A <dialog> is not a
  // <label>, so the click-forwarding problem above does not apply, and it is still in the
  // top-layer subtree, rendered above the backdrop and clickable. Outside any <dialog> it
  // falls back to document.body (the component is currently used only inside dialogs; the
  // fallback is for the future).
  function portalTarget() {
    return trigger.closest('dialog') ?? document.body;
  }

  function positionPanel() {
    const r = trigger.getBoundingClientRect();
    panel.style.left = `${r.left}px`;
    panel.style.top = `${r.bottom + 4}px`;
    panel.style.width = `${r.width}px`;
  }

  // Mutable internal state rather than an immutable snapshot of the arguments: the onChange
  // of fields like tx_port / aggregate / check function calls only revalidate(), not
  // render() (a full redraw would wipe text half-typed in other fields; that is
  // deliberate), so after a selection the component cannot rely on the caller redrawing
  // and must manage its own display state, just like a native <select>.
  let currentValue = value;

  const currentIndex = () => options.findIndex(([v]) => v === currentValue);
  let activeIndex = currentIndex();
  let open = false;

  function syncLabel() {
    const found = options.find(([v]) => v === currentValue);
    label.textContent = found ? found[1] : '(未選)';
  }
  syncLabel();

  function renderOptions() {
    panel.replaceChildren();
    options.forEach(([v, text], i) => {
      const li = document.createElement('li');
      li.id = activeDescendantId(i);
      li.className = 'listbox-option';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(v === currentValue));
      li.textContent = text;
      if (i === activeIndex) li.classList.add('active');
      li.onmouseenter = () => setActive(i);
      li.onclick = () => choose(i);
      panel.append(li);
    });
  }

  function setActive(i) {
    activeIndex = i;
    for (const li of panel.children) li.classList.remove('active');
    const li = panel.children[i];
    if (li) {
      li.classList.add('active');
      trigger.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    }
  }

  function openPanel() {
    if (open) return;
    open = true;
    renderOptions();
    portalTarget().append(panel);     // attached on every open, removed on close
    positionPanel();
    panel.hidden = false;
    // If removing hidden and adding .open happen in the same style calculation, the browser
    // jumps straight to the transition's end state without animating. A synchronous reflow
    // in between (reading offsetHeight) forces the browser to settle "hidden removed" first,
    // so .open actually triggers the transition.
    //
    // This used to be done with requestAnimationFrame, but rAF never fires while the tab is
    // hidden (the browser tooling used to test this project backgrounds tabs, which exposed
    // the bug); a synchronous reflow works whether or not the tab is visible.
    void panel.offsetHeight;
    wrap.classList.add('open');       // chevron rotation: the chevron is still inside wrap, so this works
    panel.classList.add('open');      // panel visibility: the panel is no longer inside wrap, so a
                                       // .listbox.open descendant selector can't reach it; mark it directly
    trigger.setAttribute('aria-expanded', 'true');
    activeIndex = currentIndex() >= 0 ? currentIndex() : 0;
    setActive(activeIndex);
  }

  function closePanel({ refocusTrigger = false } = {}) {
    if (!open) return;
    open = false;
    wrap.classList.remove('open');
    panel.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    // remove it only after the animation finishes, or the transition would not be visible
    const done = () => { if (!open) panel.remove(); };
    panel.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 200);          // safety net for when the transition is skipped (reduced motion)
    if (refocusTrigger) trigger.focus();
  }

  function choose(i) {
    const picked = options[i];
    if (!picked) return;
    currentValue = picked[0];
    syncLabel();
    onChange(picked[0]);
    closePanel({ refocusTrigger: true });
  }

  trigger.onclick = () => { if (open) closePanel({ refocusTrigger: true }); else openPanel(); };

  trigger.onkeydown = ev => {
    if (!open && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp'
        || ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      openPanel();
      return;
    }
    if (!open) return;

    if (ev.key === 'Escape') { ev.preventDefault(); closePanel({ refocusTrigger: true }); return; }
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); choose(activeIndex); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(ev.key)) {
      ev.preventDefault();
      setActive(nextIndex(activeIndex, ev.key, options.length));
    }
  };

  // Close on outside click by listening on the whole document rather than checking blur on
  // wrap: options are <li> elements, not focusable, so clicking one never moves focus off
  // trigger, and blur/focusout cannot tell "clicked an option" from "clicked outside".
  //
  // wrap.contains is not enough: while open the panel is attached outside wrap, so
  // panel.contains must be checked too.
  //
  // view-editor.js redraws everything on almost every field change (el.replaceChildren()),
  // so a listener added on every listbox() call with no matching removal would pile up.
  // It cleans up after itself: once wrap has been removed from the document by a redraw,
  // the next click detaches this listener from document and also removes any panel still
  // attached (e.g. when the redraw happened while the panel was open).
  const onDocumentClick = ev => {
    if (!document.contains(wrap)) {
      document.removeEventListener('click', onDocumentClick);
      panel.remove();
      return;
    }
    if (!wrap.contains(ev.target) && !panel.contains(ev.target)) closePanel();
  };
  document.addEventListener('click', onDocumentClick);

  return wrap;
}
