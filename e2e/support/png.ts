/**
 * A single-purpose PNG reader for the screenshots `Page.screenshot()`/`Locator.screenshot()`
 * produce: Chromium's own encoder writes 8-bit, non-interlaced PNGs, colour type 2 (RGB) for an
 * opaque capture or 6 (RGBA) for one with a transparent background (`omitBackground: true`) —
 * measured: an ordinary `clip` screenshot over the page's own opaque surface comes back as type 2.
 * It exists only so a spec can read what a page actually painted, pixel by pixel —
 * `forced-colors.spec.ts`'s PD-LEDGER-2 label-legibility check needs that, since a native
 * `<button>`'s forced-colors paint can diverge from its own `getComputedStyle` (the bug that check
 * proves fixed). Not a general PNG reader: anything other than colour type 2 or 6, bit depth 8, no
 * interlace throws, since this file never has to read anything else.
 */
import { inflateSync } from "node:zlib";

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel, unfiltered. */
  data: Buffer;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Parses the chunk stream for `IHDR`'s fields and every `IDAT`'s bytes, concatenated in file order
 *  (a PNG encoder may split the compressed stream across several `IDAT` chunks). */
function readChunks(buf: Buffer): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  idat: Buffer;
} {
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts: Buffer[] = [];

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buf.subarray(dataStart, dataStart + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4; // + 4 skips the trailing CRC this reader never checks
  }

  return { width, height, bitDepth, colorType, interlace, idat: Buffer.concat(idatParts) };
}

export function decodePng(buf: Buffer): DecodedPng {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("decodePng: not a PNG");

  const { width, height, bitDepth, colorType, interlace, idat } = readChunks(buf);
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(
      `decodePng only reads 8-bit RGB/RGBA, non-interlaced PNGs — got bitDepth=${bitDepth}, ` +
        `colorType=${colorType}, interlace=${interlace} (not a Chromium screenshot?)`,
    );
  }

  // Type 2 (RGB) has no alpha byte per pixel; type 6 (RGBA) does. Unfiltering works in the source's
  // own channel count, then every pixel is copied into a 4-channel RGBA output, alpha forced to 255
  // for type 2 — callers (`distinctPixelRatio`) only ever read RGB, but a fixed shape is one fewer
  // thing for them to branch on.
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(idat);
  const stride = width * channels;
  const unfiltered = Buffer.alloc(height * stride);

  // `Buffer#readUInt8`/`writeUInt8`, never `buf[i]`: `noUncheckedIndexedAccess` (tsconfig.json)
  // types a typed array's bracket index as `number | undefined`, which the arithmetic below has no
  // use for — every offset here is derived from `width`/`height`, already known to be in range.
  for (let y = 0; y < height; y++) {
    const filterType = raw.readUInt8(y * (stride + 1));
    const rowStart = y * (stride + 1) + 1;
    const prevRow = y > 0 ? (y - 1) * stride : -1;

    for (let x = 0; x < stride; x++) {
      const rawByte = raw.readUInt8(rowStart + x);
      const a = x >= channels ? unfiltered.readUInt8(y * stride + x - channels) : 0;
      const b = prevRow >= 0 ? unfiltered.readUInt8(prevRow + x) : 0;
      const c = prevRow >= 0 && x >= channels ? unfiltered.readUInt8(prevRow + x - channels) : 0;
      let value: number;
      switch (filterType) {
        case 0:
          value = rawByte;
          break;
        case 1:
          value = rawByte + a;
          break;
        case 2:
          value = rawByte + b;
          break;
        case 3:
          value = rawByte + Math.floor((a + b) / 2);
          break;
        case 4:
          value = rawByte + paeth(a, b, c);
          break;
        default:
          throw new Error(`decodePng: unknown filter type ${filterType}`);
      }
      unfiltered.writeUInt8(value & 0xff, y * stride + x);
    }
  }

  if (channels === 4) return { width, height, data: unfiltered };

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba.writeUInt8(unfiltered.readUInt8(i * 3), i * 4);
    rgba.writeUInt8(unfiltered.readUInt8(i * 3 + 1), i * 4 + 1);
    rgba.writeUInt8(unfiltered.readUInt8(i * 3 + 2), i * 4 + 2);
    rgba.writeUInt8(255, i * 4 + 3);
  }
  return { width, height, data: rgba };
}

/**
 * The fraction of `png`'s pixels whose RGB differs from the image's own most common colour by more
 * than `tolerance` on any channel. A tight screenshot of one word's own text node is either flat
 * (the label painted the same colour as its backplate — invisible) or a mix of the backplate and the
 * glyphs' anti-aliased edges (legible); this distinguishes the two without needing to read the text
 * itself. Quantises to 3-bit buckets per channel before counting the mode, so JPEG-free PNG's exact
 * anti-aliasing noise doesn't split one visual colour into many single-pixel "modes".
 */
export function distinctPixelRatio(png: DecodedPng, tolerance = 24): number {
  const total = png.width * png.height;
  if (total === 0) return 0;

  const counts = new Map<string, number>();
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const key = `${png.data.readUInt8(o) >> 3},${png.data.readUInt8(o + 1) >> 3},${png.data.readUInt8(o + 2) >> 3}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let modeKey = "";
  let modeCount = -1;
  for (const [key, count] of counts) {
    if (count > modeCount) {
      modeKey = key;
      modeCount = count;
    }
  }
  const bucket = modeKey.split(",");
  const mr = Number(bucket[0] ?? "0") << 3;
  const mg = Number(bucket[1] ?? "0") << 3;
  const mb = Number(bucket[2] ?? "0") << 3;

  let distinct = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const dr = Math.abs(png.data.readUInt8(o) - mr);
    const dg = Math.abs(png.data.readUInt8(o + 1) - mg);
    const db = Math.abs(png.data.readUInt8(o + 2) - mb);
    if (dr > tolerance || dg > tolerance || db > tolerance) distinct++;
  }

  return distinct / total;
}
