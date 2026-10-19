/**
 * Three error classes, one per handling strategy.
 */

class XmntError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** The recipe itself is invalid or a parameter is out of range. Caught before running; no command is sent. */
export class ConfigError extends XmntError {
  retryable = false;
}

/** Channel-level failure: HTTP error, CORS, timeout, expired lease. Retryable, but never silently swallowed. */
export class ChannelError extends XmntError {
  retryable = true;
}

/**
 * A fault reported by the chassis: link down, media_speed=255, or a port index that
 * cannot be resolved.
 *
 * retryable is deliberately false: pressure traffic with sub-96-bit gaps once put a
 * line card into a fault state that needed a physical reseat, and the symptom was
 * exactly this (no ports could be found). Automatic retries would only waste time
 * and hide the real cause.
 */
export class DeviceError extends XmntError {
  retryable = false;
}
