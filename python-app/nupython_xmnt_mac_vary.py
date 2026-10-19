from typing import List, Tuple

BLOCK_SIZE = 256


def _compute_mac_vary_blocks(count: int) -> List[Tuple[int, int]]:
    """Split count MACs into blocks and return [(block_index, block_count), ...].
    Hardware DA/SA vary covers at most 256 addresses at a time, so a count above 256
    is split into several blocks. Each block_count is at most 256, the last block may
    be smaller, and the block counts sum to exactly count."""
    if count < 1:
        raise ValueError(f"count must be >= 1, got {count}")
    blocks = []
    remaining = count
    block_index = 0
    while remaining > 0:
        block_count = min(BLOCK_SIZE, remaining)
        blocks.append((block_index, block_count))
        remaining -= block_count
        block_index += 1
    return blocks


def _mac_vary_block_base_mac(block_index: int) -> str:
    """Return the synthetic base MAC for this block. The second-to-last byte encodes
    block_index (to tell blocks apart); the last byte always starts at 00 and is
    incremented by the hardware vary mechanism within the block. block_index tops out
    at 255, for a theoretical maximum of 256 blocks x 256 addresses = 65536."""
    if not (0 <= block_index <= 255):
        raise ValueError(f"block_index must be 0..255, got {block_index}")
    return "02:00:00:00:{:02X}:00".format(block_index)
