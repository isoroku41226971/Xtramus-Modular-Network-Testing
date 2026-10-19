/**
 * Cursor-following glow on the home page hero. Purely decorative; it affects no
 * interaction logic.
 *
 * container is usually the .home element itself. ui/view-home.js's render() calls
 * el.replaceChildren() on every change, but el (the container) is never replaced, so
 * listeners are attached here once instead of on every render() (re-attaching would
 * stack duplicate listeners and lose the current position/rAF state).
 *
 * Returns the created <div>, which the caller inserts into the DOM and re-inserts on
 * every redraw. The element is created only once here; re-inserting it is not
 * re-creating it, so its listeners and the closure state survive.
 *
 * With prefers-reduced-motion or on touch devices without a mouse (pointer: coarse)
 * it is disabled and returns null: no element, no listeners, no resources. The caller
 * must handle having nothing to insert.
 *
 * No jsdom, so this file has no automated tests; it is verified manually in a browser.
 */
export function mountCursorGlow(container) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
  if (matchMedia('(pointer: coarse)').matches) return null;

  const el = document.createElement('div');
  el.className = 'home-deco home-cursor-glow';
  el.setAttribute('aria-hidden', 'true');

  // Interpolation factor for the springy delayed follow. Originally 0.14, lowered to 0.08
  // after hands-on testing asked for a slower trail: the smaller the value, the slower it
  // follows and the more frames it takes to close the same fraction of the gap.
  const FOLLOW_FACTOR = 0.08;
  const SETTLE_PX = 0.5;        // closer than this to the target counts as caught up
  const ROTATE_DEG = 12;

  let targetX = 0;
  let targetY = 0;
  let curX = 0;
  let curY = 0;
  let rafId = null;

  function paint() {
    el.style.transform = `translate(${curX}px, ${curY}px) rotate(${ROTATE_DEG}deg)`;
  }

  function frame() {
    curX += (targetX - curX) * FOLLOW_FACTOR;
    curY += (targetY - curY) * FOLLOW_FACTOR;
    paint();

    const settled = Math.abs(targetX - curX) < SETTLE_PX && Math.abs(targetY - curY) < SETTLE_PX;
    // Idle optimization: once caught up, stop spinning. Opacity fades are handled
    // entirely by a CSS transition (the listeners below only set el.style.opacity), so
    // stopping this rAF loop does not affect whether the fade-out can still play.
    if (settled) { rafId = null; return; }
    rafId = requestAnimationFrame(frame);
  }

  function ensureRunning() {
    if (rafId == null) rafId = requestAnimationFrame(frame);
  }

  // Hide the glow over any main content (cards, drop zone, title/description text,
  // toggle, footer status). Rather than listing elements one by one, use the existing
  // .home-content boundary: ui/view-home.js's render() wraps the title, subtitle,
  // toggle, cards, drop zone and footer in it (only the decorative shapes and this glow
  // sit directly under .home), so it naturally covers all main content without a list
  // of selectors, and new content needs no change here. The check uses e.target (the
  // innermost element under the pointer for mousemove/mouseenter) with closest(), so
  // nothing has to be looked up or remembered; moving back to empty background brings
  // the glow back automatically.
  const overContent = target => target.closest?.('.home-content') != null;

  container.addEventListener('mouseenter', e => {
    const r = container.getBoundingClientRect();
    // On enter, jump straight to the position instead of animating from the old
    // position (or the origin), which would look like a blob flying in from a corner
    // rather than fading in. curX/targetX are already equal ("caught up"), so there is
    // nothing to follow and no reason to call ensureRunning().
    curX = targetX = e.clientX - r.left;
    curY = targetY = e.clientY - r.top;
    paint();
    el.style.opacity = overContent(e.target) ? '0' : '1';
  });

  container.addEventListener('mousemove', e => {
    const r = container.getBoundingClientRect();
    targetX = e.clientX - r.left;
    targetY = e.clientY - r.top;
    el.style.opacity = overContent(e.target) ? '0' : '1';
    ensureRunning();
  });

  container.addEventListener('mouseleave', () => {
    // Only change opacity and let the CSS transition fade it out; the rAF loop is
    // independent of visibility and keeps running on its own while there is distance to cover.
    el.style.opacity = '0';
  });

  return el;
}
