/**
 * Toggle switch replacing native <input type=checkbox> across the app, modeled on the
 * sliding effect of smoothui's Animated Toggle (github.com/educlopez/smoothui). That
 * component uses React + Motion for spring animation and has extra morph / icon variants,
 * which cannot be used in a project with zero npm dependencies and no build step. Only
 * its default (smooth slide) variant is recreated here with a native CSS transition; the
 * morph/icon variants are skipped (every toggle in the app is a plain on/off).
 *
 * It is a <button role="switch"> rather than <input type=checkbox>: buttons natively fire
 * click on Space/Enter, so no keyboard handling is needed, and role=switch + aria-checked
 * is the standard WAI-ARIA switch pattern, covering the accessibility requirements.
 *
 * Inside a <label>, the browser forwards clicks elsewhere on the label to the first
 * labelable child, and a button is labelable, so "click the text to toggle" works just
 * like a native checkbox without an extra onclick on the label.
 *
 * No jsdom, so this file has no automated tests.
 */

export function toggle(checked, onChange, { disabled = false, ariaLabel } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'switch';
  btn.setAttribute('role', 'switch');
  btn.disabled = disabled;   // a natively disabled button receives no click/focus, so nothing else is needed
  if (ariaLabel) btn.setAttribute('aria-label', ariaLabel);

  const thumb = document.createElement('span');
  thumb.className = 'switch-thumb';
  btn.append(thumb);

  let current = checked;
  btn.setAttribute('aria-checked', String(current));

  btn.onclick = () => {
    current = !current;
    btn.setAttribute('aria-checked', String(current));
    onChange(current);
  };

  return btn;
}
