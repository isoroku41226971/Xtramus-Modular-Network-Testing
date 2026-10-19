/**
 * Colored dot for port status, borrowing the color vocabulary of smoothui's Dot Morph
 * Button (github.com/educlopez/smoothui): blue means available, red means taken. That
 * component is an interactive idle/loading/success button built on React + Motion; none
 * of that is needed here (this is a static availability marker, not a button), so only
 * the colors are borrowed, not its dependencies or state machine.
 *
 * No jsdom, so this file has no automated tests.
 */

export function statusDot(available) {
  const dot = document.createElement('span');
  dot.className = `status-dot ${available ? 'status-dot-available' : 'status-dot-occupied'}`;
  dot.setAttribute('aria-hidden', 'true');   // decorative only; text describing the status always sits next to it
  return dot;
}
