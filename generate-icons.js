// Generate simple PNG icons for the extension
const fs = require("fs");

function createPNG(size) {
  // Create a minimal valid PNG with a red play-queue icon
  // Using raw PNG generation (no dependencies)

  const { Buffer } = require("buffer");
  const zlib = require("zlib");

  const width = size;
  const height = size;

  // Create pixel data (RGBA)
  const pixels = Buffer.alloc(width * height * 4, 0);

  // Fill with transparent background
  for (let i = 0; i < width * height * 4; i += 4) {
    pixels[i] = 0;     // R
    pixels[i + 1] = 0; // G
    pixels[i + 2] = 0; // B
    pixels[i + 3] = 0; // A
  }

  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.42;

  // Draw circle background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = (y * width + x) * 4;

      if (dist <= r) {
        // Red circle
        pixels[idx] = 204;     // R
        pixels[idx + 1] = 36;  // G
        pixels[idx + 2] = 36;  // B
        pixels[idx + 3] = 255; // A

        // Draw play triangle (white)
        const nx = (x - cx) / r;
        const ny = (y - cy) / r;

        // Triangle: points at (-0.3, -0.4), (-0.3, 0.4), (0.45, 0)
        if (isInsideTriangle(nx, ny, -0.25, -0.35, -0.25, 0.35, 0.4, 0)) {
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        }

        // Draw small queue lines on the left
        const lx = nx;
        const ly = ny;
        // Three horizontal lines in bottom-right area
        if (lx >= 0.15 && lx <= 0.55) {
          if ((ly >= 0.45 && ly <= 0.52) || (ly >= 0.57 && ly <= 0.64)) {
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = 200;
          }
        }
      }
    }
  }

  // Build PNG file
  // Add filter bytes (0 = None) before each row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = createChunk("IHDR", (() => {
    const buf = Buffer.alloc(13);
    buf.writeUInt32BE(width, 0);
    buf.writeUInt32BE(height, 4);
    buf[8] = 8;  // bit depth
    buf[9] = 6;  // color type: RGBA
    buf[10] = 0; // compression
    buf[11] = 0; // filter
    buf[12] = 0; // interlace
    return buf;
  })());

  // IDAT chunk
  const idat = createChunk("IDAT", compressed);

  // IEND chunk
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const { Buffer } = require("buffer");

  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, "ascii");
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function isInsideTriangle(px, py, x1, y1, x2, y2, x3, y3) {
  const d1 = sign(px, py, x1, y1, x2, y2);
  const d2 = sign(px, py, x2, y2, x3, y3);
  const d3 = sign(px, py, x3, y3, x1, y1);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function sign(px, py, x1, y1, x2, y2) {
  return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
}

// Generate icons
[16, 48, 128].forEach((size) => {
  const png = createPNG(size);
  fs.writeFileSync(`icons/icon${size}.png`, png);
  console.log(`Generated icon${size}.png`);
});
