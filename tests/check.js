const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const html = read("index.html");
const app = read("app.js");
const themeInit = read("theme-init.js");
const css = read("styles.css");
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
  ['<script src="theme-init.js"></script>', "theme-init.js"],
  ['<script src="app.js"></script>', "app.js"],
].forEach(([needle, name]) => {
  if (html.includes(needle)) pass(`index.html links ${name}`);
  else fail(`index.html does not link ${name}`);
});

if (html.indexOf("theme-init.js") < html.indexOf('href="styles.css"')) {
  pass("theme-init.js loads before the stylesheet");
} else {
  fail("theme-init.js should load before the stylesheet");
}

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

if (failed) process.exit(1);
