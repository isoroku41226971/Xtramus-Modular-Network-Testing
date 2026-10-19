/**
 * Dry-run transport: records the requests JsonChannelEmitter would send, and derives
 * responses from the getter return values in a golden recording.
 *
 * With a real channel it is replaced by an HTTP transport; JsonChannelEmitter's
 * folding rules stay the same.
 *
 * Note: a response is a merged view of all values for the same (pidx, cidx) across
 * the whole recording, not a snapshot of that moment. That is fine for generating
 * the request sequence (we want the shape and count of requests), but it cannot be
 * used to verify values.
 */
export class GoldenTransport {
  constructor(goldenCalls) {
    this.requests = [];
    this.portCounters = {};     // { pidx: { cidx: value } }
    this.streamCounters = {};   // { pidx: { sid: { sid, tx_pkts, rx_pkts, rx_latency } } }
    this.mediaSpeeds = {};      // { pidx: value }

    for (const call of goldenCalls) {
      const [a0, a1] = call.a;
      if (call.m === 'get_counter_port') {
        (this.portCounters[a0] ??= {})[a1] = call.r;
      } else if (call.m === 'get_media_speed') {
        this.mediaSpeeds[a0] = call.r;
      } else if (call.m.startsWith('get_counter_stream_')) {
        const field = call.m.replace('get_counter_stream_', '');
        const slot = ((this.streamCounters[a0] ??= {})[a1] ??= { sid: a1 });
        slot[field] = call.r;
      }
    }
  }

  send(request) {
    this.requests.push(request);

    switch (request.op) {
      case 'read_counter_port':
        return { counters: this.portCounters[request.pidx] ?? {} };
      case 'read_counter_stream':
        return { streams: Object.values(this.streamCounters[request.pidx] ?? {}) };
      case 'begin_test':
        return {
          lease: 'L-dryrun',
          ports: Object.entries(this.mediaSpeeds).map(([pidx, speed]) => ({
            pidx: Number(pidx), media_speed: speed, link_down: false,
          })),
        };
      default:
        return { ok: true };
    }
  }
}
