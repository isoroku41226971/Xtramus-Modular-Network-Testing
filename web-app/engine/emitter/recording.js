import { CommandEmitter } from './emitter.js';

/**
 * Records every call in the golden-recording format, so it can be compared entry by
 * entry with the sequence recorded from Python.
 *
 * All 28 methods are recorded on purpose (including the local-state-only ones): the
 * Python-side FakeNscmd records them the same way, and dropping any one would
 * misalign the sequences.
 */
export class RecordingEmitter extends CommandEmitter {
  /**
   * @param values getter return values, shaped like { get_counter_port: { '20,4': 2976190 } }
   */
  constructor(values = {}) {
    super();
    this.values = values;
    this.calls = [];
  }

  _record(name, args) {
    this.calls.push({ m: name, a: [...args] });
  }

  _cached(name, args) {
    const value = this.values[name]?.[args.join(',')] ?? 0;
    this.calls.push({ m: name, a: [...args], r: value });
    return value;
  }
}
