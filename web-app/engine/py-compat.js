/**
 * Pieces of the Python standard library that have no JS equivalent.
 */

/**
 * An equivalent of CPython's `round()`.
 *
 * The rule is round-half-to-even, applied to the **exact** value of the double, not
 * to its shortest literal representation. Both obvious JS approaches are wrong:
 *
 *   Math.round(v * 10**d) / 10**d   the multiplication adds error that can push the value across the tie
 *   v.toFixed(d)                    the spec rounds ties up, not to even
 *
 * In 2,800 random cases the naive approach disagreed with CPython 43 times (about
 * 1.5%). One of them, 89.0625 -> 89.062, is exactly the converged value in the
 * rfc2889.forwarding golden recording; getting it wrong breaks replay, and the
 * convergence path diverges midway.
 */
export function pyRound(value, digits = 0) {
  if (!Number.isFinite(value)) return value;

  // Take a long enough decimal expansion that the tie check sees the real value, not the
  // shortest representation. digits + 30 is ample for this project's value range
  // (loading 0-100, MAC count <= 65536).
  const exact = value.toFixed(Math.min(100, digits + 30));
  const negative = exact.startsWith('-');
  const [intPart, fracPart = ''] = (negative ? exact.slice(1) : exact).split('.');

  const keep = fracPart.slice(0, digits);
  const rest = fracPart.slice(digits);
  const half = '5' + '0'.repeat(Math.max(0, rest.length - 1));

  let roundUp;
  if (rest > half) {
    roundUp = true;
  } else if (rest < half) {
    roundUp = false;
  } else {
    // exact tie: round to even
    const lastKept = keep.length ? keep[keep.length - 1] : intPart[intPart.length - 1];
    roundUp = Number(lastKept) % 2 === 1;
  }

  let scaled = Number(intPart + keep);
  if (roundUp) scaled += 1;

  const result = scaled / 10 ** digits;
  return negative ? -result : result;
}
