/**
 * Numeric constants from the vendor SDK.
 *
 * These values appear verbatim in the arguments of the golden recordings (e.g.
 * get_counter_port(20, 40)), so a wrong value makes replay fail on that command
 * immediately. Taken from ../python-app/nuconst.py.
 */

// RX_BORADCAST is the vendor's original spelling, not a typo; changing it would break parity with Python
export const IDX_PORTCOUNTER_TX_PKT = 924;
export const IDX_PORTCOUNTER_RX_UNICAST = 40;
export const IDX_PORTCOUNTER_RX_BORADCAST = 24;

export const MEDIA_SPEED = Object.freeze({
  M10: 0, M100: 1, G1: 2, G10: 3, G2P5: 4, G5: 5, LINKDOWN: 255,
});

/** LINKDOWN is deliberately excluded: reading 0xFF must raise DeviceError, not mean a speed of 0. */
export const MEDIA_SPEED_BPS = Object.freeze({
  [MEDIA_SPEED.M10]: 10_000_000,
  [MEDIA_SPEED.M100]: 100_000_000,
  [MEDIA_SPEED.G1]: 1_000_000_000,
  [MEDIA_SPEED.G2P5]: 2_500_000_000,
  [MEDIA_SPEED.G5]: 5_000_000_000,
  [MEDIA_SPEED.G10]: 10_000_000_000,
});

export const ERROR_CRC = 1;
export const ERROR_ALIGN = 3;
