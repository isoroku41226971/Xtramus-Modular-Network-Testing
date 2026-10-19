/**
 * Packet-capture parser for both classic PCAP and PCAPNG. Pure functions, no DOM.
 *
 * The two are **completely different** formats, not extensions of each other:
 *   PCAP    a 24-byte global header followed by "16-byte packet header + data" records
 *   PCAPNG  a sequence of blocks, each carrying its own type and length; the byte
 *           order is in the SHB's byte-order magic, and the interface link type is
 *           in the IDB
 *
 * The only export is parseCapture(), which dispatches on the leading magic.
 */

// Classic PCAP: the writer stores this constant in its native byte order, so the
// reader can infer the order: reading MAGIC as little-endian means the file is
// little-endian, reading the byte-swapped value means big-endian.
const PCAP_MAGIC = 0xa1b2c3d4;
const PCAP_MAGIC_SWAPPED = 0xd4c3b2a1;
// Same layout with nanosecond timestamps; both tcpdump and Wireshark produce it
const PCAP_MAGIC_NANO = 0xa1b23c4d;
const PCAP_MAGIC_NANO_SWAPPED = 0x4d3cb2a1;

const PCAP_GLOBAL_HEADER_LEN = 24;
const PCAP_RECORD_HEADER_LEN = 16;

// PCAPNG block types. The SHB value is a byte palindrome, so it can be read before
// the byte order is known; the spec designs it that way on purpose.
const BLOCK_SECTION_HEADER = 0x0a0d0d0a;
const BLOCK_INTERFACE_DESCRIPTION = 0x00000001;
const BLOCK_SIMPLE_PACKET = 0x00000003;
const BLOCK_ENHANCED_PACKET = 0x00000006;

const PCAPNG_BYTE_ORDER_MAGIC = 0x1a2b3c4d;
const PCAPNG_BYTE_ORDER_MAGIC_SWAPPED = 0x4d3c2b1a;
const PCAPNG_BLOCK_HEADER_LEN = 12;   // type(4) + totalLen(4) + trailing totalLen(4)

/** Only Ethernet captures can be replayed on the chassis's Ethernet ports. */
const LINKTYPE_ETHERNET = 1;

/**
 * Hard limit of the vendor SDK's set_udf_payload() (../python-app/nucommand.py
 * line 202). Anything longer is **silently truncated**: the user thinks full frames
 * are replayed while the receiver gets cut-off data. Rejecting the whole file here
 * is better than letting that corruption reach the wire.
 */
const MAX_PAYLOAD_BYTES = 1024;

function macString(bytes, offset) {
  return Array.from(bytes.slice(offset, offset + 6))
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(':');
}

/**
 * Validate one packet and add it to the result. Length and link-type checks live
 * here so both formats share the same rules.
 */
function pushPacket(packets, bytes, offset, length, linkType) {
  const nth = packets.length + 1;

  if (linkType !== LINKTYPE_ETHERNET) {
    throw new Error(
      `第 ${nth} 筆封包的 link type 是 ${linkType},不是乙太網路(${LINKTYPE_ETHERNET})`
      + ' —— 這種擷取檔的內容不是乙太網路訊框,重放到機箱上沒有意義');
  }
  if (length > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `第 ${nth} 筆封包長度 ${length} bytes 超過 ${MAX_PAYLOAD_BYTES} bytes`
      + '(vendor SDK 的 UDF payload 上限,超過會被靜默截斷,因此拒絕整份檔案)');
  }
  if (length < 6) {
    throw new Error(`第 ${nth} 筆封包只有 ${length} bytes,不足解析目的 MAC`);
  }

  packets.push({
    bytes: Array.from(bytes.slice(offset, offset + length)),
    dmac: macString(bytes, offset),
  });
}

// --- classic PCAP ---

function parseClassicPcap(arrayBuffer, littleEndian) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const linkType = view.getUint32(20, littleEndian);
  const packets = [];
  let offset = PCAP_GLOBAL_HEADER_LEN;

  while (offset < arrayBuffer.byteLength) {
    if (offset + PCAP_RECORD_HEADER_LEN > arrayBuffer.byteLength) {
      throw new Error(`檔案在偏移 ${offset} 處被截斷(封包標頭不完整)`);
    }
    const inclLen = view.getUint32(offset + 8, littleEndian);
    offset += PCAP_RECORD_HEADER_LEN;

    if (offset + inclLen > arrayBuffer.byteLength) {
      throw new Error(`檔案在偏移 ${offset} 處被截斷(封包內容不完整)`);
    }
    pushPacket(packets, bytes, offset, inclLen, linkType);
    offset += inclLen;
  }

  return packets;
}

// --- PCAPNG ---

function parsePcapng(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const packets = [];

  let offset = 0;
  let littleEndian = true;   // the first block is always an SHB, which immediately sets the real value
  let linkTypes = [];

  while (offset + PCAPNG_BLOCK_HEADER_LEN <= arrayBuffer.byteLength) {
    const blockType = view.getUint32(offset, littleEndian);

    if (blockType === BLOCK_SECTION_HEADER) {
      // The byte order comes from the byte-order magic at the start of the body. It
      // must be read in an order-independent way: read it as little-endian, and if
      // it doesn't match, the file is big-endian.
      const magic = view.getUint32(offset + 8, true);
      if (magic === PCAPNG_BYTE_ORDER_MAGIC) littleEndian = true;
      else if (magic === PCAPNG_BYTE_ORDER_MAGIC_SWAPPED) littleEndian = false;
      else throw new Error(`PCAPNG 的 byte-order magic 不合法:0x${magic.toString(16)}`);

      // a new section: interface numbering restarts at 0
      linkTypes = [];
    }

    const blockLen = view.getUint32(offset + 4, littleEndian);
    if (blockLen < PCAPNG_BLOCK_HEADER_LEN || blockLen % 4 !== 0) {
      throw new Error(
        `PCAPNG 在偏移 ${offset} 處的區塊長度不合法:${blockLen}`
        + '(必須至少 12 且是 4 的倍數)');
    }
    if (offset + blockLen > arrayBuffer.byteLength) {
      throw new Error(`PCAPNG 在偏移 ${offset} 處被截斷(區塊超出檔案結尾)`);
    }

    if (blockType === BLOCK_INTERFACE_DESCRIPTION) {
      linkTypes.push(view.getUint16(offset + 8, littleEndian));
    } else if (blockType === BLOCK_ENHANCED_PACKET) {
      const interfaceId = view.getUint32(offset + 8, littleEndian);
      const capturedLen = view.getUint32(offset + 20, littleEndian);
      pushPacket(packets, bytes, offset + 28, capturedLen, linkTypes[interfaceId]);
    } else if (blockType === BLOCK_SIMPLE_PACKET) {
      // An SPB records only the original length, not the captured length; what can
      // actually be read is bounded by the remaining block space (the block ends with
      // padding, so take the smaller of the two)
      const originalLen = view.getUint32(offset + 8, littleEndian);
      const available = blockLen - PCAPNG_BLOCK_HEADER_LEN - 4;
      pushPacket(packets, bytes, offset + 12,
        Math.min(originalLen, available), linkTypes[0]);
    }
    // per the spec, skip any other block type using its own length

    offset += blockLen;
  }

  return packets;
}

// --- public entry point ---

export function parseCapture(arrayBuffer) {
  if (arrayBuffer.byteLength < PCAPNG_BLOCK_HEADER_LEN) {
    throw new Error(`檔案太短(${arrayBuffer.byteLength} bytes),不是合法的擷取檔`);
  }

  const view = new DataView(arrayBuffer);
  const head = view.getUint32(0, true);
  let packets;

  if (head === PCAP_MAGIC || head === PCAP_MAGIC_NANO) {
    if (arrayBuffer.byteLength < PCAP_GLOBAL_HEADER_LEN) {
      throw new Error(`檔案太短(${arrayBuffer.byteLength} bytes),不足 PCAP 全域標頭`);
    }
    packets = parseClassicPcap(arrayBuffer, true);
  } else if (head === PCAP_MAGIC_SWAPPED || head === PCAP_MAGIC_NANO_SWAPPED) {
    if (arrayBuffer.byteLength < PCAP_GLOBAL_HEADER_LEN) {
      throw new Error(`檔案太短(${arrayBuffer.byteLength} bytes),不足 PCAP 全域標頭`);
    }
    packets = parseClassicPcap(arrayBuffer, false);
  } else if (head === BLOCK_SECTION_HEADER) {
    packets = parsePcapng(arrayBuffer);
  } else {
    throw new Error(
      `無法辨識的檔案格式(開頭是 0x${head.toString(16)})`
      + ' —— 只支援傳統 PCAP 與 PCAPNG');
  }

  if (packets.length === 0) {
    throw new Error('這個檔案裡沒有任何封包,沒有東西可以重放');
  }
  return { packets };
}
