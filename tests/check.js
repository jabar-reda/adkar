const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const html = read("index.html");
const app = read("app.js");
const themeInit = read("theme-init.js");
const css = read("styles.css");
const faviconSvg = read("favicon.svg");
const faviconIco = fs.readFileSync(path.join(root, "favicon.ico"));
const manifestText = read("manifest.webmanifest");
const sw = read("sw.js");
const pwa = read("pwa.js");
const sim = fs.readFileSync(path.join(__dirname, "sim.js"), "utf8");

let failed = false;

function fail(message) {
  failed = true;
  console.log(`FAIL ${message}`);
}

function pass(message) {
  console.log(`PASS ${message}`);
}

/* ===== الصياغة ===== */
[
  ["app.js", app],
  ["theme-init.js", themeInit],
  ["sw.js", sw],
  ["pwa.js", pwa],
].forEach(([name, source]) => {
  try {
    new vm.Script(source, { filename: name });
    pass(`${name}: syntax OK`);
  } catch (error) {
    fail(`${name}: syntax error -> ${error.message}`);
  }
});

const openBraces = (css.match(/\{/g) || []).length;
const closeBraces = (css.match(/\}/g) || []).length;
if (openBraces === closeBraces) pass(`styles.css: ${openBraces} balanced rule blocks`);
else fail(`styles.css: ${openBraces} "{" but ${closeBraces} "}"`);

/* ===== بنية الملفات ===== */
if (/<style[\s>]/.test(html)) fail("index.html still contains an inline <style> block");
else pass("index.html has no inline style block");

if (/<script>[\s\S]*?<\/script>/.test(html)) fail("index.html still contains an inline script");
else pass("index.html has no inline script");

[
  ['<link rel="stylesheet" href="styles.css">', "styles.css"],
  ['<script src="config.js"></script>', "config.js"],
  ['<script src="theme-init.js"></script>', "theme-init.js"],
  ['<script src="pwa.js"></script>', "pwa.js"],
  ['<script src="app.js"></script>', "app.js"],
  ['<link rel="manifest" href="manifest.webmanifest">', "manifest.webmanifest"],
  ['<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">', "apple-touch-icon"],
].forEach(([needle, name]) => {
  if (html.includes(needle)) pass(`index.html links ${name}`);
  else fail(`index.html does not link ${name}`);
});

if (html.indexOf("theme-init.js") < html.indexOf('href="styles.css"')) {
  pass("theme-init.js loads before the stylesheet");
} else {
  fail("theme-init.js should load before the stylesheet");
}

if (html.indexOf("config.js") < html.indexOf("theme-init.js")) {
  pass("config.js loads before theme-init.js");
} else {
  fail("config.js must load before theme-init.js");
}

if (/window\.DOUAA_CONFIG/.test(app) && /window\.DOUAA_CONFIG/.test(themeInit)) {
  pass("app.js and theme-init.js share window.DOUAA_CONFIG");
} else {
  fail("app.js and theme-init.js must read the shared config");
}

/* ===== الأيقونة ===== */
[
  ['href="favicon.svg"', "favicon.svg"],
  ['href="favicon.ico"', "favicon.ico"],
].forEach(([needle, name]) => {
  if (html.includes(needle)) pass(`index.html links ${name}`);
  else fail(`index.html does not link ${name}`);
});

if (/viewBox="0 0 32 32"/.test(faviconSvg)) pass("favicon.svg has a 32px viewBox");
else fail("favicon.svg is missing the 32px viewBox");

if (/<title[\s>]/.test(faviconSvg)) pass("favicon.svg has a title");
else fail("favicon.svg is missing a title");

if (/<script|<image|href="http/i.test(faviconSvg)) {
  fail("favicon.svg contains a script, raster image or external reference");
} else {
  pass("favicon.svg is self-contained vector artwork");
}

const icoHeaderOk =
  faviconIco.length > 6 &&
  faviconIco[0] === 0 &&
  faviconIco[1] === 0 &&
  faviconIco[2] === 1 &&
  faviconIco[3] === 0;
if (icoHeaderOk) pass("favicon.ico has a valid ICO header");
else fail("favicon.ico has an invalid ICO header");

const icoCount = icoHeaderOk ? faviconIco.readUInt16LE(4) : 0;
if (icoCount === 3) pass("favicon.ico contains 3 image sizes");
else fail(`favicon.ico contains ${icoCount} image sizes instead of 3`);

const icoSizes = Array.from({ length: icoCount }, (_, index) => faviconIco[6 + index * 16]);
if (icoSizes.join(",") === "16,32,48") pass("favicon.ico sizes are 16, 32 and 48");
else fail(`favicon.ico sizes are ${icoSizes.join(", ")}`);

/* ===== المعرّفات ===== */
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const idSet = new Set(ids);

const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length === 0) pass(`index.html: ${ids.length} unique ids`);
else fail(`duplicate ids: ${[...new Set(duplicates)].join(", ")}`);

const missingUsed = [...app.matchAll(/getElementById\("([^"]+)"\)/g)]
  .map((match) => match[1])
  .filter((id) => !idSet.has(id));

if (missingUsed.length === 0) pass("all getElementById references exist");
else missingUsed.forEach((id) => fail(`missing id in index.html: ${id}`));

const missingSim = [...sim.matchAll(/register\("([^"]+)"/g)]
  .map((match) => match[1])
  .filter((id) => !idSet.has(id));

if (missingSim.length === 0) pass("every simulated element exists in index.html");
else missingSim.forEach((id) => fail(`tests/sim.js registers an unknown id: ${id}`));

/* ===== العمل بدون إنترنت: الخطوط ===== */
if (/fonts\.(?:googleapis|gstatic)\.com/.test(html + css)) {
  fail("index.html or styles.css still requests Google Fonts");
} else {
  pass("no external font request remains");
}

const fontFiles = [
  ...new Set([...css.matchAll(/url\("(fonts\/[^"]+\.woff2)"\)/g)].map((match) => match[1])),
];

if (fontFiles.length === 8) pass("styles.css declares 8 local woff2 files");
else fail(`styles.css declares ${fontFiles.length} local woff2 files instead of 8`);

const swapCount = (css.match(/font-display:\s*swap/g) || []).length;
if (swapCount === 8) pass("every local font uses font-display: swap");
else fail(`font-display: swap appears ${swapCount} times instead of 8`);

fontFiles.forEach((file) => {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) {
    fail(`missing font file: ${file}`);
    return;
  }
  const magic = fs.readFileSync(fullPath).subarray(0, 4).toString("ascii");
  if (magic === "wOF2") pass(`${file}: valid woff2 file`);
  else fail(`${file}: invalid woff2 magic "${magic}"`);
});

["fonts/LICENSE-AMIRI.txt", "fonts/LICENSE-IBM-PLEX.txt"].forEach((license) => {
  if (fs.existsSync(path.join(root, license))) pass(`${license}: present`);
  else fail(`missing font license: ${license}`);
});

/* ===== مانيفست التثبيت والأيقونات ===== */
const manifestIconPaths = [];

function readPngSize(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

let manifest = null;
try {
  manifest = JSON.parse(manifestText);
  pass("manifest.webmanifest: valid JSON");
} catch (error) {
  fail(`manifest.webmanifest: invalid JSON -> ${error.message}`);
}

if (manifest) {
  ["name", "short_name", "start_url", "scope", "display", "lang", "dir"].forEach((field) => {
    if (typeof manifest[field] === "string" && manifest[field]) pass(`manifest has ${field}`);
    else fail(`manifest is missing ${field}`);
  });

  if (manifest.start_url === "./" && manifest.scope === "./") {
    pass("manifest uses relative start_url and scope");
  } else {
    fail("manifest must use relative start_url and scope for GitHub Pages");
  }

  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const iconSizes = [];

  icons.forEach((icon) => {
    if (typeof icon.src !== "string") {
      fail("manifest contains an icon without src");
      return;
    }
    manifestIconPaths.push(icon.src);
    iconSizes.push(icon.sizes);

    const size = readPngSize(path.join(root, icon.src));
    if (!size) {
      fail(`manifest icon is missing or not a PNG: ${icon.src}`);
    } else if (`${size.width}x${size.height}` !== icon.sizes) {
      fail(`${icon.src}: ${size.width}x${size.height} does not match sizes ${icon.sizes}`);
    } else {
      pass(`${icon.src}: ${icon.sizes} PNG`);
    }
  });

  if (iconSizes.includes("192x192") && iconSizes.includes("512x512")) {
    pass("manifest has 192 and 512 icons");
  } else {
    fail("manifest needs 192x192 and 512x512 icons");
  }

  if (icons.some((icon) => String(icon.purpose).includes("maskable"))) {
    pass("manifest has a maskable icon");
  } else {
    fail("manifest needs a maskable icon");
  }
}

/* ===== Service Worker ===== */
const shellMatch = sw.match(/const SHELL_FILES = \[([\s\S]*?)\];/);
const shellFiles = shellMatch
  ? [...shellMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1])
  : [];

if (shellFiles.length > 0) pass(`sw.js precaches ${shellFiles.length} files`);
else fail("sw.js has no SHELL_FILES list");

if (shellFiles.includes("./") && shellFiles.includes("index.html")) {
  pass("sw.js caches the app start URL");
} else {
  fail("sw.js must cache ./ and index.html");
}

const missingShell = shellFiles
  .filter((file) => file !== "./")
  .filter((file) => !fs.existsSync(path.join(root, file)));
if (missingShell.length === 0) pass("every precached file exists on disk");
else missingShell.forEach((file) => fail(`sw.js precaches a missing file: ${file}`));

const requiredShell = [
  "index.html",
  "styles.css",
  "config.js",
  "theme-init.js",
  "app.js",
  "pwa.js",
  "manifest.webmanifest",
  "favicon.svg",
  "favicon.ico",
  ...fontFiles,
  ...manifestIconPaths,
];
const notPrecached = requiredShell.filter((file) => !shellFiles.includes(file));
if (notPrecached.length === 0) pass("sw.js precaches every app asset");
else notPrecached.forEach((file) => fail(`sw.js does not precache: ${file}`));

if (/const CACHE_NAME = "douaa-tracker-shell-v\d+";/.test(sw)) {
  pass("sw.js has a versioned cache name");
} else {
  fail("sw.js cache name must be douaa-tracker-shell-v<number>");
}

/* ===== تسجيل التثبيت ===== */
["install-app", "install-note"].forEach((id) => {
  if (idSet.has(id)) pass(`index.html has #${id}`);
  else fail(`index.html is missing #${id}`);
});

if (/const SW_URL = "sw.js";/.test(pwa) && /serviceWorker\.register\(SW_URL\)/.test(pwa)) {
  pass("pwa.js registers sw.js");
} else {
  fail("pwa.js does not register sw.js");
}

if (html.indexOf("pwa.js") < html.indexOf("app.js")) pass("pwa.js loads before app.js");
else fail("pwa.js must load before app.js");

if (failed) process.exit(1);
