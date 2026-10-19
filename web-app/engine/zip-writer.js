/**
 * Minimal ZIP container writer implementing only what .xlsx needs: the stored
 * (uncompressed) method, with no encryption, multi-disk or ZIP64. It is the mirror
 * image of engine/capture-parser.js: that file hand-writes a binary-format reader,
 * this one a writer.
 *
 * Format details (PKZIP APPNOTE.TXT): each entry is "local file header + data", and
 * the file ends with a central directory plus the EOCD (end of central directory).
 * With the stored method the compressed size equals the uncompressed size: both are
 * the raw byte length.
 */

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

// The DOS date/time is fixed at 2026-01-01 00:00:00. An entry's mtime does not affect
// the .xlsx content (the report's start/end times are written into the worksheet,
// not here), and a fixed value makes the output reproducible (same input, same
// bytes), which makes it easy to compare in tests.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = buildCrcTable();

/** Standard CRC-32 (the zlib/PKZIP variant). */
export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Small helper for accumulating output: collect chunks in an array and concatenate once at the end, avoiding repeated reallocation. */
class ByteWriter {
  constructor() { this.chunks = []; this.length = 0; }

  u16(v) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v, true);
    return this._push(b);
  }
  u32(v) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v, true);
    return this._push(b);
  }
  bytes(u8) { return this._push(u8); }

  _push(u8) { this.chunks.push(u8); this.length += u8.length; return this; }

  toUint8Array() {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) { out.set(chunk, offset); offset += chunk.length; }
    return out;
  }
}

/**
 * @param entries [{ path: string, bytes: Uint8Array }, ...]; path uses forward slashes,
 *   e.g. 'xl/worksheets/sheet1.xml'
 * @returns Uint8Array: the complete ZIP file bytes
 */
export function buildZip(entries) {
  const encoder = new TextEncoder();
  const local = new ByteWriter();
  const central = new ByteWriter();
  const offsets = [];

  for (const { path, bytes } of entries) {
    const nameBytes = encoder.encode(path);
    const crc = crc32(bytes);
    offsets.push(local.length);

    local.u32(LOCAL_FILE_HEADER_SIG);
    local.u16(20);              // version needed to extract(2.0)
    local.u16(0);                // general purpose bit flag
    local.u16(0);                // compression method:0 = stored
    local.u16(DOS_TIME);
    local.u16(DOS_DATE);
    local.u32(crc);
    local.u32(bytes.length);     // compressed size
    local.u32(bytes.length);     // uncompressed size
    local.u16(nameBytes.length);
    local.u16(0);                // extra field length
    local.bytes(nameBytes);
    local.bytes(bytes);
  }

  entries.forEach(({ path, bytes }, i) => {
    const nameBytes = encoder.encode(path);
    const crc = crc32(bytes);

    central.u32(CENTRAL_DIR_SIG);
    central.u16(20);             // version made by
    central.u16(20);             // version needed to extract
    central.u16(0);              // general purpose bit flag
    central.u16(0);              // compression method
    central.u16(DOS_TIME);
    central.u16(DOS_DATE);
    central.u32(crc);
    central.u32(bytes.length);
    central.u32(bytes.length);
    central.u16(nameBytes.length);
    central.u16(0);              // extra field length
    central.u16(0);              // file comment length
    central.u16(0);              // disk number start
    central.u16(0);              // internal file attributes
    central.u32(0);              // external file attributes
    central.u32(offsets[i]);     // relative offset of local header
    central.bytes(nameBytes);
  });

  const centralOffset = local.length;
  const out = new ByteWriter();
  out.bytes(local.toUint8Array());
  out.bytes(central.toUint8Array());

  out.u32(EOCD_SIG);
  out.u16(0);                    // number of this disk
  out.u16(0);                    // disk where central directory starts
  out.u16(entries.length);       // records on this disk
  out.u16(entries.length);       // total records
  out.u32(central.length);       // size of central directory
  out.u32(centralOffset);        // offset of start of central directory
  out.u16(0);                    // comment length

  return out.toUint8Array();
}
