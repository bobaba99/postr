/**
 * A minimal PNG decoder (8-bit RGB or RGBA, not interlaced; zlib only), for
 * reading a browser's screenshot pixel by pixel in bare Node. Ported from
 * the follow-up review of fix 04 (R2-paint's tools/png.mjs).
 */
import zlib from 'node:zlib';

/** Decode a PNG buffer into a sampler over its pixels. */
export function decodePNG(buf) {
  let off = 8;
  let w = 0; let h = 0; let depth = 0; let ctype = 0; let interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`unsupported PNG: depth ${depth}, interlace ${interlace}`);
  const bpp = ctype === 6 ? 4 : ctype === 2 ? 3 : 0;
  if (!bpp) throw new Error(`unsupported PNG colour type ${ctype}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y += 1) {
    const ft = raw[p]; p += 1;
    const row = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? out[row + x - bpp] : 0;
      const b = y > 0 ? out[row - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[row - stride + x - bpp] : 0;
      let v = raw[p]; p += 1;
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c); const pb = Math.abs(a - c); const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[row + x] = v & 255;
    }
  }
  const at = (x, y) => (y * w + x) * bpp;
  return {
    w, h,
    rgb(x, y) { const i = at(x, y); return [out[i], out[i + 1], out[i + 2]]; },
    /** The mean of the three channels. */
    lum(x, y) { const i = at(x, y); return (out[i] + out[i + 1] + out[i + 2]) / 3; },
  };
}
