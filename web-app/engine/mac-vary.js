import { ConfigError } from './errors.js';

export const BLOCK_SIZE = 256;

/**
 * Split count MACs into blocks and return [[blockIndex, blockCount], ...].
 *
 * Hardware DA/SA vary covers at most 256 addresses at a time, so a count above 256
 * is split into several blocks. Each blockCount is at most 256, the last block may
 * be smaller, and the block counts sum to exactly count.
 *
 * The blockIndex limit is deliberately not checked here; that is macVaryBlockBaseMac()'s job.
 */
export function computeMacVaryBlocks(count) {
  if (count < 1) {
    throw new ConfigError(`count 必須 >= 1,收到 ${count}`);
  }
  const blocks = [];
  let remaining = count;
  let blockIndex = 0;
  while (remaining > 0) {
    const blockCount = Math.min(BLOCK_SIZE, remaining);
    blocks.push([blockIndex, blockCount]);
    remaining -= blockCount;
    blockIndex += 1;
  }
  return blocks;
}

/**
 * Return the synthetic base MAC for this block.
 *
 * The second-to-last byte encodes blockIndex (to tell blocks apart); the last byte
 * always starts at 00 and is incremented by the hardware vary mechanism within the
 * block. The theoretical maximum is 256 x 256 = 65536.
 */
export function macVaryBlockBaseMac(blockIndex) {
  if (!(blockIndex >= 0 && blockIndex <= 255)) {
    throw new ConfigError(`blockIndex 必須是 0..255,收到 ${blockIndex}`);
  }
  const hex = blockIndex.toString(16).toUpperCase().padStart(2, '0');
  return `02:00:00:00:${hex}:00`;
}
