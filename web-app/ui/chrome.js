/**
 * Header and footer shared by both pages, modeled on Packet Studio's SiteHeader / SiteFooter.
 *
 * The background color is fixed and does not follow the light/dark theme: brand colors
 * should look the same in both.
 *
 * No jsdom, so this file has no automated tests. It only renders; there is no logic.
 */

/** Clicking the logo goes home (the workspace first asks whether to close the project). */
export function installChrome(doc, { onLogoClick = null, year = new Date().getFullYear() } = {}) {
  const header = doc.getElementById('site-header');
  if (header) {
    const brand = doc.createElement('button');
    brand.className = 'brand';
    // The "X" used to be wrapped in its own red <span>. The real company logo is all
    // blue/dark blue with no accent color, so the text is now a single color.
    brand.textContent = 'Xtramus XMNT';
    brand.onclick = () => onLogoClick?.();
    header.replaceChildren(brand);
  }

  const footer = doc.getElementById('site-footer');
  if (footer) footer.textContent = `© ${year} Xtramus`;
}
