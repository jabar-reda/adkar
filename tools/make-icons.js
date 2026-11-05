// يولّد أيقونات التثبيت بصيغة PNG من تصميم favicon.svg نفسه، بدون أي مكتبة خارجية.
// شغّله من جذر المشروع: node tools/make-icons.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DESIGN_SIZE = 32;
const CORNER_RADIUS = 8;
const SUPERSAMPLING = 4;

const BACKGROUND_COLOR = { red: 13, green: 106, blue: 77 }; // #0d6a4d
const MARK_COLOR = { red: 246, green: 250, blue: 245 }; // #f6faf5

// رؤوس النجمة الثمانية في مساحة التصميم 32×32، مطابقة لمسار favicon.svg.
const STAR_POINTS = [
  [16, 6],
  [18.6, 13.4],
  [26, 16],
  [18.6, 18.6],
  [16, 26],
  [13.4, 18.6],
  [6, 16],
  [13.4, 13.4],
];

const ICONS = [
  // rounded: زوايا مستديرة وخلفية شفافة خارجها.
  // full-bleed: مربع كامل بخلفية خضراء، مناسب لأيقونة iOS والأيقونة المقنّعة.
  { fileName: "icon-192.png", size: 192, rounded: true },
  { fileName: "icon-512.png", size: 512, rounded: true },
  { fileName: "icon-maskable-512.png", size: 512, rounded: false },
  { fileName: "apple-touch-icon.png", size: 180, rounded: false },
];

function isInsideRoundedSquare(x, y, size, radius, rounded) {
  if (x < 0 || y < 0 || x > size || y > size) return false;
  if (!rounded) return true;
  const cornerX = x < radius ? radius : x > size - radius ? size - radius : x;
  const cornerY = y < radius ? radius : y > size - radius ? size - radius : y;
  const dx = x - cornerX;
  const dy = y - cornerY;
  return dx * dx + dy * dy <= radius * radius;
}

function isInsideStar(x, y) {
  let inside = false;
  for (let current = 0, previous = STAR_POINTS.length - 1; current < STAR_POINTS.length; previous = current++) {
    const [currentX, currentY] = STAR_POINTS[current];
    const [previousX, previousY] = STAR_POINTS[previous];
    const crossesRow = currentY > y !== previousY > y;
    if (!crossesRow) continue;
    const crossingX = ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX;
    if (x < crossingX) inside = !inside;
  }
  return inside;
}

function renderIcon(size, rounded) {
  const pixels = Buffer.alloc(size * size * 4);
  const samplesPerPixel = SUPERSAMPLING * SUPERSAMPLING;
  const scale = DESIGN_SIZE / size;

  for (let pixelY = 0; pixelY < size; pixelY += 1) {
    for (let pixelX = 0; pixelX < size; pixelX += 1) {
      let backgroundSamples = 0;
      let markSamples = 0;

      for (let sampleY = 0; sampleY < SUPERSAMPLING; sampleY += 1) {
        for (let sampleX = 0; sampleX < SUPERSAMPLING; sampleX += 1) {
          const designX = (pixelX + (sampleX + 0.5) / SUPERSAMPLING) * scale;
          const designY = (pixelY + (sampleY + 0.5) / SUPERSAMPLING) * scale;

          if (!isInsideRoundedSquare(designX, designY, DESIGN_SIZE, CORNER_RADIUS, rounded)) continue;
          backgroundSamples += 1;
          if (isInsideStar(designX, designY)) markSamples += 1;
        }
      }

      const offset = (pixelY * size + pixelX) * 4;
      if (backgroundSamples === 0) continue;

      const markShare = markSamples / backgroundSamples;
      pixels[offset] = Math.round(
        MARK_COLOR.red * markShare + BACKGROUND_COLOR.red * (1 - markShare)
      );
      pixels[offset + 1] = Math.round(
        MARK_COLOR.green * markShare + BACKGROUND_COLOR.green * (1 - markShare)
      );
      pixels[offset + 2] = Math.round(
        MARK_COLOR.blue * markShare + BACKGROUND_COLOR.blue * (1 - markShare)
      );
      pixels[offset + 3] = Math.round((backgroundSamples / samplesPerPixel) * 255);
    }
  }

  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // عمق البِت
  header[9] = 6; // RGBA
  header[10] = 0; // ضغط zlib
  header[11] = 0; // بلا فلترة
  header[12] = 0; // بلا تشابك

  const rowLength = size * 4;
  const raw = Buffer.alloc((rowLength + 1) * size);
  for (let row = 0; row < size; row += 1) {
    raw[row * (rowLength + 1)] = 0;
    pixels.copy(raw, row * (rowLength + 1) + 1, row * rowLength, (row + 1) * rowLength);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function main() {
  const outputDirectory = path.join(__dirname, "..", "icons");
  fs.mkdirSync(outputDirectory, { recursive: true });

  ICONS.forEach(({ fileName, size, rounded }) => {
    const png = encodePng(size, renderIcon(size, rounded));
    fs.writeFileSync(path.join(outputDirectory, fileName), png);
    console.log(`icons/${fileName} — ${size}x${size}، ${png.length} بايت`);
  });
}

main();
