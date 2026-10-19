import { CommandEmitter } from './emitter.js';

const FLOAT_TOLERANCE = 1e-9;

export class ReplayMismatchError extends Error {
  constructor(message, { index, expected, actual }) {
    super(message);
    this.name = 'ReplayMismatchError';
    this.index = index;
    this.expected = expected;
    this.actual = actual;
  }
}

function argsMatch(expected, actual) {
  if (expected.length !== actual.length) return false;
  return expected.every((e, i) => {
    const a = actual[i];
    if (typeof e === 'number' && typeof a === 'number') {
      return Math.abs(e - a) <= FLOAT_TOLERANCE;
    }
    return e === a;
  });
}

/**
 * Within a **contiguous run** of these methods, order is not compared, only which
 * calls were made.
 *
 * Why relax it: Python's `_clear_counters()` iterates a `set`, whose order comes
 * from CPython's hash table. {10,20,40,41,42,43} actually iterates as
 * [40,41,10,42,43,20], neither ascending nor insertion order. That is a CPython
 * implementation accident, not behavior this test should pin; clearing counters on
 * different ports is commutative anyway.
 *
 * The only alternative would be reproducing CPython's hash probing in JS production
 * code, leaving behind code nobody understands that breaks whenever CPython changes
 * its hashing.
 *
 * The relaxation is narrow: within one contiguous run, **the multiset of calls must
 * be identical** (one missing, one extra, or one different port still fails); only
 * the order is ignored.
 */
const UNORDERED_RUN_METHODS = new Set(['clear_counter_port', 'clear_counter_stream']);

/**
 * Compares calls against a golden recording entry by entry and replays the recorded
 * return values.
 *
 * Any deviation throws **at the point of deviation** with its index, instead of a
 * hard-to-trace "final result differs" failure, so it points straight at the command
 * where things went wrong.
 */
export class ReplayEmitter extends CommandEmitter {
  constructor(goldenCalls) {
    super();
    this.golden = goldenCalls;
    this.cursor = 0;
    this.consumed = new Set();   // indexes already matched within the unordered run
  }

  /** End (exclusive) of the contiguous run, starting at cursor, whose methods all belong to the unordered group. */
  _runEnd() {
    let end = this.cursor;
    while (end < this.golden.length && UNORDERED_RUN_METHODS.has(this.golden[end].m)) end += 1;
    return end;
  }

  /** Advance cursor to the next position not yet matched. */
  _advance() {
    this.cursor += 1;
    while (this.consumed.has(this.cursor)) this.cursor += 1;
  }

  _next(name, args) {
    if (this.cursor >= this.golden.length) {
      throw new ReplayMismatchError(
        `第 ${this.cursor} 筆:黃金檔只有 ${this.golden.length} 筆,但還想呼叫 ${name}`,
        { index: this.cursor, expected: null, actual: { m: name, a: args } });
    }
    const expected = this.golden[this.cursor];

    if (expected.m === name && argsMatch(expected.a, args)) {
      this._advance();
      return expected;
    }

    // inside an unordered run, look ahead in the same run for a matching call not yet matched
    if (UNORDERED_RUN_METHODS.has(expected.m) && UNORDERED_RUN_METHODS.has(name)) {
      const end = this._runEnd();
      for (let i = this.cursor + 1; i < end; i += 1) {
        if (this.consumed.has(i)) continue;
        if (this.golden[i].m === name && argsMatch(this.golden[i].a, args)) {
          this.consumed.add(i);
          return this.golden[i];
        }
      }
    }

    throw new ReplayMismatchError(
      `第 ${this.cursor} 筆不符:黃金檔是 ${expected.m}(${JSON.stringify(expected.a)}),`
      + `實際呼叫 ${name}(${JSON.stringify(args)})`,
      { index: this.cursor, expected, actual: { m: name, a: args } });
  }

  _record(name, args) { this._next(name, args); }

  _cached(name, args) { return this._next(name, args).r; }

  /** Confirm the golden recording is exhausted. Too few calls is a deviation, just like too many. */
  assertExhausted() {
    if (this.cursor < this.golden.length && this.consumed.has(this.cursor)) {
      this._advance();
    }
    if (this.cursor !== this.golden.length) {
      const expected = this.golden[this.cursor];
      throw new ReplayMismatchError(
        `黃金檔還有 ${this.golden.length - this.cursor} 筆沒被呼叫,`
        + `下一筆應該是 ${expected.m}(${JSON.stringify(expected.a)})`,
        { index: this.cursor, expected, actual: null });
    }
  }
}
