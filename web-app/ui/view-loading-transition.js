/**
 * Loading transition from the home page to the workspace. Purely decorative: it shows
 * for a fixed 600 ms and then resolves, and the caller decides what happens next (here,
 * navigation). It reflects no real progress; beginTest currently runs in simulation and
 * finishes almost instantly, and the transition's role stays the same once a real
 * channel is connected.
 *
 * No jsdom, so this file has no automated tests.
 */

const SHOW_DURATION_MS = 600;

export function showLoadingTransition() {
  const overlay = document.createElement('div');
  overlay.className = 'loading-transition';

  const box = document.createElement('div');
  box.className = 'loading-transition-box';

  const brand = document.createElement('div');
  brand.className = 'loading-transition-brand';
  brand.textContent = 'Xtramus';

  const msg = document.createElement('div');
  msg.className = 'loading-transition-msg';
  msg.textContent = '正在進入…';

  box.append(brand, msg);
  overlay.append(box);
  document.body.append(overlay);

  return new Promise(resolve => {
    setTimeout(() => {
      overlay.remove();
      resolve();
    }, SHOW_DURATION_MS);
  });
}
