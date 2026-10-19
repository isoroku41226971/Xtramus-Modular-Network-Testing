/**
 * Hand-written PDF writer, following engine/xlsx-writer.js: it writes PDF's own
 * object/xref/trailer structure directly, with no PDF library.
 *
 * It uses only PDF's built-in Helvetica standard font and embeds no font files.
 */

const A4_PORTRAIT = { width: 595, height: 842 };
const A4_LANDSCAPE = { width: A4_PORTRAIT.height, height: A4_PORTRAIT.width };

class ObjectWriter {
  constructor() {
    this.objects = [];   // { num, body }
    this.nextNum = 1;
  }

  /** Allocate a new object number whose body is filled later. Returns the number so other objects can reference it as "N 0 R". */
  reserve() {
    const num = this.nextNum++;
    this.objects.push({ num, body: null });
    return num;
  }

  /** Fill in the content for a number allocated by reserve(). */
  fill(num, body) {
    const entry = this.objects.find(o => o.num === num);
    entry.body = body;
  }

  /** reserve() + fill() in one step, for objects whose number is not needed in advance. */
  add(body) {
    const num = this.reserve();
    this.fill(num, body);
    return num;
  }
}

/**
 * All PDF content is latin1 (sanitizePdfText guarantees text only has code points
 * <= 0xFF, and the structural syntax is pure ASCII). latin1 maps one character to one
 * byte, so lengths and bytes can be computed without Node.js's Buffer, and the same
 * code runs in the browser (no global Buffer) and under `node --test`. */
function latin1Bytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xFF;
  return bytes;
}

/**
 * Body of an image XObject. Only JPEG (DCTDecode) is supported; the raw bytes are the
 * stream content, with no decode/re-encode. base64 is turned into a binary string with
 * the global atob() (built into browsers and Node 16+, no Buffer needed), whose result
 * already maps one character to one byte, matching latin1Bytes()'s assumption.
 */
function imageXObjectBody(base64, widthPx, heightPx) {
  const jpegBytes = atob(base64);
  return `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} `
    + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode `
    + `/Length ${jpegBytes.length} >>\nstream\n${jpegBytes}\nendstream`;
}

/** Draw an image filling the given rectangle (x,y is the lower-left corner in PDF coordinates). */
export function imageDrawOperator(name, x, y, width, height) {
  return `q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q`;
}

/**
 * Build the complete PDF bytes. Each page is { width, height, content, resources,
 * usesImages? }. sharedImages is { name: { base64, width, height } }: each image is
 * embedded only once here (e.g. the letterhead background used on every page), and
 * pages list the names they reference in usesImages instead of copying the data.
 */
export function buildPdf(pages, sharedImages = {}) {
  const w = new ObjectWriter();

  const pagesNum = w.reserve();
  const catalogNum = w.add(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>`);

  const imageObjNums = {};
  for (const [name, { base64, width, height }] of Object.entries(sharedImages)) {
    imageObjNums[name] = w.add(imageXObjectBody(base64, width, height));
  }

  const pageNums = pages.map(page => {
    const contentLength = page.content.length;
    const contentNum = w.add(
      `<< /Length ${contentLength} >>\nstream\n${page.content}\nendstream`,
    );
    const resourceEntries = Object.entries(page.resources)
      .map(([name, dict]) => `/${name} ${dict}`).join(' ');
    const xObjectEntries = (page.usesImages ?? [])
      .map(name => `/${name} ${imageObjNums[name]} 0 R`).join(' ');
    const xObjectResource = xObjectEntries ? ` /XObject << ${xObjectEntries} >>` : '';
    const pageNum = w.add(
      `<< /Type /Page /Parent ${pagesNum} 0 R `
      + `/MediaBox [0 0 ${page.width} ${page.height}] `
      + `/Resources << /Font << ${resourceEntries} >>${xObjectResource} >> `
      + `/Contents ${contentNum} 0 R >>`,
    );
    return pageNum;
  });

  w.fill(pagesNum,
    `<< /Type /Pages /Kids [${pageNums.map(n => `${n} 0 R`).join(' ')}] `
    + `/Count ${pageNums.length} >>`);

  return assemble(w, catalogNum);
}

/** Assemble the filled objects into the final PDF bytes: header, object bodies, xref, trailer. */
function assemble(objectWriter, rootNum) {
  const chunks = ['%PDF-1.7\n%\xE2\xE3\xCF\xD3\n'];
  const offsets = new Map();   // objNum -> byte offset (from the start of the file)
  let pos = chunks[0].length;

  for (const { num, body } of objectWriter.objects) {
    offsets.set(num, pos);
    const text = `${num} 0 obj\n${body}\nendobj\n`;
    chunks.push(text);
    pos += text.length;
  }

  const xrefOffset = pos;
  const maxNum = objectWriter.nextNum - 1;
  const xrefLines = ['0000000000 65535 f \n'];
  for (let n = 1; n <= maxNum; n++) {
    const off = offsets.get(n) ?? 0;
    xrefLines.push(`${String(off).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`xref\n0 ${maxNum + 1}\n${xrefLines.join('')}`);
  chunks.push(`trailer\n<< /Size ${maxNum + 1} /Root ${rootNum} 0 R >>\n`);
  chunks.push(`startxref\n${xrefOffset}\n%%EOF\n`);

  return latin1Bytes(chunks.join(''));
}

/** ASCII substitutes for known symbols, so one or two symbols don't make the whole text throw. */
const KNOWN_SUBSTITUTIONS = { '→': '->', '—': '-' };

/**
 * The PDF standard font (Helvetica) supports neither CJK nor most non-Latin-1
 * symbols. Known symbols are substituted and anything else throws, so the problem
 * surfaces at export time instead of producing garbled text or question marks that
 * look like correct output.
 */
export function sanitizePdfText(text) {
  let out = '';
  for (const ch of text) {
    if (ch in KNOWN_SUBSTITUTIONS) { out += KNOWN_SUBSTITUTIONS[ch]; continue; }
    const code = ch.codePointAt(0);
    if (code > 0xFF) {
      throw new RangeError(
        `PDF 匯出不支援這個字元:${JSON.stringify(ch)}(U+${code.toString(16)})——`
        + `PDF 只用標準 Helvetica 字型,沒有內嵌中文字型。`);
    }
    out += ch;
  }
  return out;
}

/** Character widths from Adobe's standard Helvetica.afm, in 1/1000 em. Covers only ASCII
 *  32-126; sanitized text is guaranteed to stay in that range (sanitizePdfText rejects the rest). */
const HELVETICA_WIDTHS = {
  32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191,
  40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278,
  48: 556, 49: 556, 50: 556, 51: 556, 52: 556, 53: 556, 54: 556, 55: 556,
  56: 556, 57: 556, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556,
  64: 1015, 65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778,
  72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778,
  80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944,
  88: 667, 89: 667, 90: 611, 91: 278, 92: 278, 93: 278, 94: 469, 95: 556,
  96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556,
  104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556,
  111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556,
  118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334, 124: 260,
  125: 334, 126: 584,
};

/** Width of the text in Helvetica at the given size, in points. Used for centering/right alignment. */
export function helveticaWidth(text, fontSize) {
  let units = 0;
  for (const ch of text) {
    units += HELVETICA_WIDTHS[ch.codePointAt(0)] ?? 556;   // unknown characters get a typical width
  }
  return units / 1000 * fontSize;
}

/** PDF string escaping: ( ) \ each get a preceding backslash. */
function escapePdfString(text) {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/** Content-stream fragment that draws one line of Helvetica text at (x,y).
 *  The font resource is always named F1; callers of buildPdf() must provide
 *  F1: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' in resources. */
export function textOperator(text, x, y, fontSize) {
  const safe = sanitizePdfText(text);
  const escaped = escapePdfString(safe);
  return `BT /F1 ${fontSize} Tf ${x} ${y} Td (${escaped}) Tj ET`;
}

/** Like textOperator but with the bold font resource F2; callers must also provide
 *  F2: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold
 *  /Encoding /WinAnsiEncoding >>' in resources. For titles/headers that need emphasis. */
export function boldTextOperator(text, x, y, fontSize) {
  const safe = sanitizePdfText(text);
  const escaped = escapePdfString(safe);
  return `BT /F2 ${fontSize} Tf ${x} ${y} Td (${escaped}) Tj ET`;
}

/**
 * Rotated text. A vertical axis title (e.g. a chart's Y-axis title, read bottom to
 * top) needs Tm (the text matrix) rather than Td (a plain translation) to rotate.
 * angleDegrees is counter-clockwise; 90 is the standard Y-axis title direction.
 */
export function rotatedTextOperator(text, x, y, fontSize, angleDegrees) {
  const safe = sanitizePdfText(text);
  const escaped = escapePdfString(safe);
  const rad = (angleDegrees * Math.PI) / 180;
  // Math.cos(Math.PI/2) is not exactly 0 (floating-point error, about 6e-17). Rounding to
  // 6 decimals makes the common angles (0/90/180/270) come out as clean 0s instead of
  // leaving meaningless floating-point noise in the PDF matrix.
  const round = n => Math.round(n * 1e6) / 1e6;
  const a = round(Math.cos(rad));
  const b = round(Math.sin(rad));
  const c = round(-Math.sin(rad));
  const d = round(Math.cos(rad));
  return `BT /F1 ${fontSize} Tf ${a} ${b} ${c} ${d} ${x} ${y} Tm (${escaped}) Tj ET`;
}

const rgb = ([r, g, b]) => `${r} ${g} ${b}`;

/** Rectangle path. At least one of fill/stroke is required; both colors are [r,g,b] on a 0-1 scale. */
export function rectOperator(x, y, w, h, { fill, stroke } = {}) {
  const parts = [];
  if (fill) parts.push(`${rgb(fill)} rg`);
  if (stroke) parts.push(`${rgb(stroke)} RG`);
  parts.push(`${x} ${y} ${w} ${h} re`);
  if (fill && stroke) parts.push('B');
  else if (fill) parts.push('f');
  else parts.push('S');
  return parts.join(' ');
}

/** A straight line. */
export function lineOperator(x1, y1, x2, y2, { stroke = [0, 0, 0] } = {}) {
  return `${rgb(stroke)} RG ${x1} ${y1} m ${x2} ${y2} l S`;
}

export { A4_PORTRAIT, A4_LANDSCAPE };
