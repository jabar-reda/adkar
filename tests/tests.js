// اختبارات adkar كلها في ملف واحد: البنية، محاكاة DOM، وسلوك التطبيق.
// الاستخدام: node tests/tests.js أو npm test
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

/* وحدات app/modules/*.js صارت ES modules، وتقييمها يحتاج vm.SourceTextModule
   المتاح خلف علم --experimental-vm-modules فقط. إن لم يكن العلم مفعّلاً نعيد
   تشغيل هذا الملف نفسه به، فيعمل الأمر `node tests/tests.js` كما هو. */
if (typeof vm.SourceTextModule !== "function") {
  if (process.env.ADKAR_VM_MODULES === "1") {
    console.error("vm.SourceTextModule unavailable; run: node --experimental-vm-modules tests/tests.js");
    process.exit(1);
  }
  const { spawnSync } = require("node:child_process");
  const relaunch = spawnSync(
    process.execPath,
    ["--experimental-vm-modules", __filename],
    { stdio: "inherit", env: { ...process.env, ADKAR_VM_MODULES: "1" } }
  );
  process.exit(relaunch.status === null ? 1 : relaunch.status);
}

const ENTRY_FILE = path.join(ROOT, "app", "app.js");
const MODULE_DIR = path.join(ROOT, "app", "modules");
const MODULE_FILES = fs
  .readdirSync(MODULE_DIR)
  .filter((name) => name.endsWith(".js"))
  .sort()
  .map((name) => path.join(MODULE_DIR, name));
const ENTRY_SOURCE = fs.readFileSync(ENTRY_FILE, "utf8");
const MODULE_SOURCES = MODULE_FILES.map((file) => ({
  name: path.relative(ROOT, file).replace(/\\/g, "/"),
  source: fs.readFileSync(file, "utf8"),
}));
const readModule = (name) =>
  (MODULE_SOURCES.find((entry) => entry.name === "app/modules/" + name) || { source: "" }).source;
// مصدر الدخول والوحدات مجتمعين: فحوص النصوص تبحث عن الرمز حيث انتقل.
const APP_SOURCE = [ENTRY_SOURCE, ...MODULE_SOURCES.map((entry) => entry.source)].join("\n");

const STORAGE_SOURCE = read("app/storage.js");

// بيانات الأذكار تُقرأ من app/data.js مباشرة: تقييمه في سياق معزول بـ window فارغ،
// فلا اعتماد على تعابير نمطية تفكك نص المصدر.
const DATA_SOURCE = read("app/data.js");
const ADKAR_DATA = vm.runInNewContext(DATA_SOURCE + "\nwindow.ADKAR_DATA;", { window: {} });
const ALL_ITEMS = [
  ADKAR_DATA.MORNING_ITEMS,
  ADKAR_DATA.WAKE_ITEMS,
  ADKAR_DATA.EVENING_ITEMS,
  ADKAR_DATA.SLEEP_ITEMS,
].flat();
const DHIKR_COUNTS = new Map(ALL_ITEMS.map((item) => [item.id, item.count]));
const MORNING_ITEM_IDS = ADKAR_DATA.MORNING_ITEMS.map((item) => item.id);
const EVENING_ITEM_IDS = ADKAR_DATA.EVENING_ITEMS.map((item) => item.id);

let passed = 0;
let failed = 0;

function check(label, condition, details = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL ${label}${details ? " -> " + details : ""}`);
  }
}

function pass(message) {
  check(message, true);
}

function fail(message) {
  check(message, false);
}

/* ===== 1) البنية والملفات ===== */
(function runStaticChecks() {
  const html = read("index.html");
  const app = APP_SOURCE;
  const themeInit = read("app/theme-init.js");
  const dataSource = read("app/data.js");
  const css = read("app/styles.css");
  const faviconSvg = read("app/favicon.svg");
  const faviconIco = fs.readFileSync(path.join(ROOT, "favicon.ico"));
  const testsSource = fs.readFileSync(__filename, "utf8");

  const stateSource = readModule("state.js");
  const pruneBody = stateSource.slice(stateSource.indexOf("function pruneDays"), stateSource.indexOf("function getDay", stateSource.indexOf("function pruneDays")));
  if (pruneBody.indexOf("updateStreakStats(state);") >= 0 && pruneBody.indexOf("updateStreakStats(state);") < pruneBody.indexOf("delete state.days")) pass("streak statistics update before day pruning");
  else fail("streak statistics must update before day pruning");

  if (app.includes('navigator.locks.request("adkar-progress-write"')) pass("cross-tab writes use the Web Locks API");
  else fail("cross-tab writes are not serialized with Web Locks");

  if (app.includes("function readLegacyLocalStorage") && app.includes("ADKAR_STORAGE.set(STORAGE_KEY, legacy)")) pass("native migration copies legacy localStorage progress into the adapter");
  else fail("native migration from legacy localStorage is missing");

  if (app.includes("ADKAR_STORAGE.isNative") && !app.includes("window.Capacitor")) pass("platform detection comes from the storage adapter");
  else fail("app.js must detect the platform through ADKAR_STORAGE.isNative only");

  const allItemIds = ALL_ITEMS.map((item) => item.id);
  if (allItemIds.length === 50 && new Set(allItemIds).size === 38) pass("all 38 unique dhikr IDs across 50 list entries");
  else fail(`dhikr explicit IDs: ${allItemIds.length} entries, ${new Set(allItemIds).size} unique`);

  const missingCounts = ALL_ITEMS.filter((item) => !Number.isInteger(item.count) || item.count < 0);
  if (missingCounts.length === 0 && ADKAR_DATA.DHIKR && typeof ADKAR_DATA.DHIKR === "object") pass("every dhikr record carries a non-negative count");
  else fail(`dhikr counts malformed: ${missingCounts.map((item) => item.id).join(", ")}`);

  if (fs.existsSync(path.join(ROOT, "tests/cross-tab-sync.html"))) pass("two-context browser synchronization fixture exists");
  else fail("missing two-context browser synchronization fixture");

  /* ===== الصياغة ===== */
  [
    ["app/data.js", dataSource],
    ["app/storage.js", STORAGE_SOURCE],
    ["app/theme-init.js", themeInit],
  ].forEach(([name, source]) => {
    try {
      new vm.Script(source, { filename: name });
      pass(`${name}: syntax OK`);
    } catch (error) {
      fail(`${name}: syntax error -> ${error.message}`);
    }
  });

  [{ name: "app/app.js", source: ENTRY_SOURCE }, ...MODULE_SOURCES].forEach(({ name, source }) => {
    try {
      new vm.SourceTextModule(source, { identifier: name });
      pass(`${name}: module syntax OK`);
    } catch (error) {
      fail(`${name}: module syntax error -> ${error.message}`);
    }
  });

  const openBraces = (css.match(/\{/g) || []).length;
  const closeBraces = (css.match(/\}/g) || []).length;
  if (openBraces === closeBraces) pass(`styles.css: ${openBraces} balanced rule blocks`);
  else fail(`styles.css: ${openBraces} "{" but ${closeBraces} "}"`);

  /* دالة حماية خلية CSV تُقيَّم معزولة من وحدتها، فتُفحص الحماية من
     حقن الصيغ والتغليف حتى لو غيّرت صياغة الملف لاحقاً. */
  const utilsSource = readModule("utils.js");
  const csvCellStart = utilsSource.indexOf("function csvCell");
  const csvCellEnd = utilsSource.indexOf("export function", csvCellStart);
  const csvCellSource = utilsSource.slice(
    csvCellStart,
    csvCellEnd === -1 ? utilsSource.length : csvCellEnd
  );
  try {
    const csvCell = vm.runInNewContext("(" + csvCellSource + ")");
    const csvCases = [
      ["'=1+1", csvCell("=1+1")],
      ["\"'=a,\"\"b\"\"\"", csvCell("=a,\"b\"")],
      ["'@SUM(A1)", csvCell("@SUM(A1)")],
      ["نعم", csvCell("نعم")],
      ["2026-11-15", csvCell("2026-11-15")],
      ["\"سطر\"\"داخل الخلية\"", csvCell('سطر"داخل الخلية')],
    ];
    const wrongCsv = csvCases.filter(([expected, actual]) => expected !== actual);
    if (wrongCsv.length === 0) pass("csvCell neutralizes formulas and wraps correctly");
    else fail(`csvCell output mismatch: ${JSON.stringify(wrongCsv[0])}`);
  } catch (error) {
    fail(`csvCell could not be evaluated -> ${error.message}`);
  }

  /* ===== بنية الملفات ===== */
  if (/<style[\s>]/.test(html)) fail("index.html still contains an inline <style> block");
  else pass("index.html has no inline style block");

  if (/<script>[\s\S]*?<\/script>/.test(html)) fail("index.html still contains an inline script");
  else pass("index.html has no inline script");

  [
    ['<link rel="stylesheet" href="app/styles.css">', "app/styles.css"],
    ['<script src="app/config.js"></script>', "app/config.js"],
    ['<script src="app/storage.js"></script>', "app/storage.js"],
    ['<script src="app/theme-init.js"></script>', "app/theme-init.js"],
    ['<script src="app/data.js"></script>', "app/data.js"],
    ['<script type="module" src="app/app.js"></script>', "app/app.js"],
  ].forEach(([needle, name]) => {
    if (html.includes(needle)) pass(`index.html links ${name}`);
    else fail(`index.html does not link ${name}`);
  });

  if (html.indexOf("app/theme-init.js") < html.indexOf('href="app/styles.css"')) {
    pass("theme-init.js loads before the stylesheet");
  } else {
    fail("theme-init.js should load before the stylesheet");
  }

  if (html.indexOf("app/config.js") < html.indexOf("app/storage.js")) {
    pass("config.js loads before storage.js");
  } else {
    fail("config.js must load before storage.js");
  }

  if (html.indexOf("app/storage.js") < html.indexOf("app/theme-init.js")) {
    pass("storage.js loads before theme-init.js");
  } else {
    fail("storage.js must load before theme-init.js");
  }

  if (html.indexOf("app/data.js") >= 0 && html.indexOf("app/data.js") < html.indexOf("app/app.js")) {
    pass("data.js loads before app.js");
  } else {
    fail("data.js must load before app.js");
  }

  /* ===== سياسة الأمان ===== */
  const CSP_POLICY = "default-src 'self'; style-src 'self'; img-src 'self' data:";
  const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  if (cspMatch && cspMatch[1] === CSP_POLICY) {
    pass("index.html declares the expected content security policy");
  } else {
    fail(`CSP meta tag missing or unexpected (expected: ${CSP_POLICY})`);
  }

  if (/\sstyle=/.test(html)) fail("index.html contains an inline style attribute");
  else pass("index.html has no inline style attribute");

  if (/window\.ADKAR_CONFIG/.test(app) && /window\.ADKAR_CONFIG/.test(themeInit)) {
    pass("app.js and theme-init.js share window.ADKAR_CONFIG");
  } else {
    fail("app.js and theme-init.js must read the shared config");
  }

  /* ===== الأيقونة ===== */
  [
    ['href="app/favicon.svg"', "favicon.svg"],
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

  const missingSim = [...testsSource.matchAll(/register\("([^"]+)"/g)]
    .map((match) => match[1])
    .filter((id) => !idSet.has(id));

  if (missingSim.length === 0) pass("every simulated element exists in index.html");
  else missingSim.forEach((id) => fail(`tests/tests.js registers an unknown id: ${id}`));

  const colophonIcons = (html.match(/class="colophon-icon"/g) || []).length;
  if (colophonIcons === 2) pass("footer shows one icon per social link");
  else fail(`footer has ${colophonIcons} colophon icons instead of 2`);

  if (html.includes('class="colophon-copy">© <span id="app-year"></span>')) {
    pass("footer keeps the copyright year on one line");
  } else {
    fail("footer copyright line lost its year element");
  }

  /* ===== الخطوط المحلية ===== */
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
    const fullPath = path.join(ROOT, "app", file);
    if (!fs.existsSync(fullPath)) {
      fail(`missing font file: ${file}`);
      return;
    }
    const magic = fs.readFileSync(fullPath).subarray(0, 4).toString("ascii");
    if (magic === "wOF2") pass(`${file}: valid woff2 file`);
    else fail(`${file}: invalid woff2 magic "${magic}"`);
  });

  ["fonts/LICENSE-AMIRI.txt", "fonts/LICENSE-IBM-PLEX.txt"].forEach((license) => {
    if (fs.existsSync(path.join(ROOT, "app", license))) pass(`${license}: present`);
    else fail(`missing font license: ${license}`);
  });

})();

/* ===== 2) محاكاة DOM وسلوك التطبيق ===== */
async function runSimulationTests() {
const root = path.join(__dirname, "..");
const config = fs.readFileSync(path.join(root, "app", "config.js"), "utf8");
const themeInit = fs.readFileSync(path.join(root, "app", "theme-init.js"), "utf8");
const data = fs.readFileSync(path.join(root, "app", "data.js"), "utf8");

/* ===== DOM مصغّر للاختبار ===== */
class ClassList {
  constructor() {
    this.set = new Set();
  }
  add(...names) {
    names.forEach((name) => this.set.add(name));
  }
  remove(...names) {
    names.forEach((name) => this.set.delete(name));
  }
  contains(name) {
    return this.set.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this.set.has(name) : force;
    if (on) this.set.add(name);
    else this.set.delete(name);
    return on;
  }
}

class Element {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.id = "";
    this._className = "";
    this.classList = new ClassList();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.attributes = {};
    this.style = {};
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.focused = false;
    this.scrolled = false;
  }
  get className() {
    return this._className;
  }
  set className(value) {
    this._className = String(value);
    this.classList.set = new Set(this._className.split(/\s+/).filter(Boolean));
  }
  append(...nodes) {
    nodes.forEach((node) => {
      node.parentNode = this;
      this.children.push(node);
    });
  }
  replaceChildren(...nodes) {
    this.children.forEach((node) => {
      node.parentNode = null;
    });
    this.children = [];
    this.append(...nodes);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === "id") this.id = String(value);
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }
  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }
  dispatch(type, extra = {}) {
    let node = this;
    while (node) {
      (node.listeners[type] || []).forEach((handler) => handler({ target: this, ...extra }));
      node = node.parentNode;
    }
  }
  click() {
    if (this.disabled) return;
    this.dispatch("click");
  }
  focus() {
    this.focused = true;
  }
  scrollIntoView() {
    this.scrolled = true;
  }
  get isConnected() {
    let node = this;
    while (node) {
      if (node === document.body) return true;
      node = node.parentNode;
    }
    return false;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((node) => node !== this);
    this.parentNode = null;
  }
  querySelector(selector) {
    return findAll(this, selector)[0] || null;
  }
  querySelectorAll(selector) {
    return findAll(this, selector);
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (matches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
}

function matches(node, selector) {
  return String(selector)
    .split(",")
    .map((part) => part.trim())
    .some((part) => {
      if (!part) return false;
      if (part.startsWith(".")) return node.classList.contains(part.slice(1));
      if (part === "[data-font-size]") return "fontSize" in node.dataset;
      if (part === "[data-theme]") return "theme" in node.dataset;
      return node.tagName === part.toUpperCase();
    });
}

function findAll(root, selector) {
  const found = [];
  const walk = (node) => {
    node.children.forEach((child) => {
      if (matches(child, selector)) found.push(child);
      walk(child);
    });
  };
  walk(root);
  return found;
}

const byId = new Map();

function make(tag, props = {}) {
  const node = new Element(tag);
  Object.assign(node, props);
  return node;
}

function register(id, tag, props = {}) {
  const node = make(tag, { ...props, id });
  byId.set(id, node);
  return node;
}

const document = {
  documentElement: new Element("html"),
  body: new Element("body"),
  title: "",
  visibilityState: "visible",
  listeners: {},
  createElement: (tag) => new Element(tag),
  getElementById: (id) => byId.get(id) || null,
  querySelector: (selector) => findAll(document.body, selector)[0] || null,
  querySelectorAll: (selector) => findAll(document.body, selector),
  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  },
};

const page = make("div", { className: "page" });
document.body.append(page);

const tablist = make("nav", { className: "period-tabs" });
page.append(tablist);

const tabMorning = register("tab-morning", "button", {
  className: "tab",
  dataset: { period: "morning" },
});
tabMorning.append(make("span", { className: "tab-count" }));
const tabEvening = register("tab-evening", "button", {
  className: "tab",
  dataset: { period: "evening" },
});
tabEvening.append(make("span", { className: "tab-count" }));
tablist.append(tabMorning, tabEvening);

const panel = make("section", { className: "period-panel" });
page.append(panel);

register("period-title", "h2");
register("period-hint", "p");
register("time-left", "p");
register("progress-text", "p");
register("progress-bar", "div");
register("progress-fill", "div");
register("next-incomplete", "button");
register("dhikr-list", "ol");
register("storage-warning", "p", { hidden: true });

const viewingNote = register("viewing-note", "div", { hidden: true });
const viewingNoteText = register("viewing-note-text", "p");
const viewingToday = register("viewing-today", "button");
viewingNote.append(viewingNoteText, viewingToday);

const supplementGroup = register("supplement-group", "section", { hidden: true });
const supplementList = register("supplement-list", "ol");
register("supplement-title", "h2");
register("supplement-note", "p");
register("supplement-progress", "p");
register("supplement-bar", "div");
register("supplement-fill", "div");

supplementGroup.append(
  byId.get("supplement-title"),
  byId.get("supplement-note"),
  byId.get("supplement-progress"),
  byId.get("supplement-bar"),
  byId.get("supplement-fill"),
  supplementList
);

panel.append(
  viewingNote,
  byId.get("period-title"),
  byId.get("period-hint"),
  byId.get("time-left"),
  byId.get("progress-text"),
  byId.get("progress-bar"),
  byId.get("progress-fill"),
  byId.get("next-incomplete"),
  byId.get("dhikr-list"),
  byId.get("storage-warning"),
  supplementGroup
);

const footer = make("footer", { className: "site-footer" });
page.append(footer);

register("reset-day", "button");
register("date-greg", "span");
register("date-hijri", "span");
register("live", "p");
register("undo-bar", "div", { hidden: true });
register("undo-text", "span");
register("undo-button", "button");
register("backup-status", "p");
register("backup-reminder", "p");
register("import-confirm", "div", { hidden: true });
register("import-summary", "p");
register("export-backup", "button");
register("export-csv", "button");
register("import-backup", "button");
register("import-apply", "button");
register("import-merge", "button");
register("import-cancel", "button");
register("import-paste", "button");

register("streak-current", "span");
register("streak-best", "span");
register("streak-note", "span");
register("weekly-summary", "p");
register("calendar-month", "p");
register("calendar-prev", "button");
register("calendar-next", "button");
register("calendar-grid", "div");
register("calendar-detail", "p");

const counterDialog = register("counter-dialog", "dialog");
counterDialog.open = false;
counterDialog.showModal = function showModal() {
  this.open = true;
  document.body.classList.add("is-dialog-open");
};
counterDialog.close = function close() {
  this.open = false;
  document.body.classList.remove("is-dialog-open");
  this.dispatch("close");
};
register("counter-title", "h2");
register("counter-text", "div");
register("counter-count", "p");
register("counter-fill", "div");
register("counter-button", "button");
register("counter-close", "button");
register("counter-reset", "button");

counterDialog.append(
  byId.get("counter-title"),
  byId.get("counter-text"),
  byId.get("counter-count"),
  byId.get("counter-fill"),
  byId.get("counter-button"),
  byId.get("counter-close"),
  byId.get("counter-reset")
);
document.body.append(counterDialog);

const importFile = register("import-file", "input");
importFile.files = [];

/* نافذة النسخة الاحتياطية: نتيجة التصدير/الاستيراد ونص النسخة القابل للنسخ */
const backupDialog = register("backup-dialog", "dialog");
backupDialog.open = false;
backupDialog.showModal = function showModal() {
  this.open = true;
  document.body.classList.add("is-dialog-open");
};
backupDialog.close = function close() {
  this.open = false;
  document.body.classList.remove("is-dialog-open");
  this.dispatch("close");
};
register("backup-dialog-title", "h2");
register("backup-dialog-message", "p");
register("backup-dialog-text", "textarea");
register("backup-dialog-close", "button");
register("backup-copy", "button");
register("backup-download", "button");
register("backup-verify", "button");
backupDialog.append(
  byId.get("backup-dialog-title"),
  byId.get("backup-dialog-message"),
  byId.get("backup-dialog-text"),
  byId.get("backup-dialog-close"),
  byId.get("backup-copy"),
  byId.get("backup-download"),
  byId.get("backup-verify")
);
document.body.append(backupDialog);

/* تذييل الهوية */
register("app-version", "span");
register("app-year", "span");
register("app-author", "span");
register("app-github", "a");
register("app-instagram", "a");

const fontButtons = [
  ["small", "صغير"],
  ["medium", "متوسط"],
  ["large", "كبير"],
  ["xlarge", "كبير جداً"],
].map(([size, label]) => {
  const button = make("button", { className: "segment", dataset: { fontSize: size } });
  button.textContent = label;
  footer.append(button);
  return button;
});

const themeButtons = [
  ["auto", "تلقائي (القسم)"],
  ["time", "حسب الوقت"],
  ["morning", "صباح"],
  ["evening", "مساء"],
].map(([theme, label]) => {
  const button = make("button", { className: "segment", dataset: { theme } });
  button.textContent = label;
  footer.append(button);
  return button;
});

footer.append(
  byId.get("streak-current"),
  byId.get("streak-best"),
  byId.get("streak-note"),
  byId.get("weekly-summary"),
  byId.get("calendar-month"),
  byId.get("calendar-prev"),
  byId.get("calendar-next"),
  byId.get("calendar-grid"),
  byId.get("calendar-detail"),
  byId.get("backup-reminder"),
  byId.get("backup-status"),
  byId.get("import-confirm"),
  byId.get("export-backup"),
  byId.get("export-csv"),
  byId.get("import-backup"),
  importFile,
  byId.get("import-apply"),
  byId.get("import-merge"),
  byId.get("import-cancel"),
  byId.get("import-paste"),
  byId.get("app-version"),
  byId.get("app-year"),
  byId.get("app-author"),
  byId.get("app-github"),
  byId.get("app-instagram"),
  byId.get("reset-day"),
  byId.get("date-greg"),
  byId.get("date-hijri")
);

page.append(byId.get("undo-bar"), byId.get("live"));
byId.get("undo-bar").append(byId.get("undo-text"), byId.get("undo-button"));

/* ===== بيئة التشغيل ===== */
const storage = new Map();
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const RealDate = Date;
let currentTime = new RealDate(2026, 9, 31, 10, 0, 0);
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(currentTime.getTime());
    else super(...args);
  }
  static now() {
    return currentTime.getTime();
  }
}

function setHour(hour) {
  currentTime = new RealDate(2026, 9, 31, hour, 0, 0);
  document.visibilityState = "visible";
  (document.listeners.visibilitychange || []).forEach((handler) => handler());
}

const timers = new Map();
let timerId = 0;
let lastBlob = null;

const sandbox = {
  console,
  document,
  localStorage,
  Date: FakeDate,
  Intl,
  Math,
  JSON,
  Map,
  Set,
  Promise,
  Error,
  Number,
  String,
  Boolean,
  Array,
  Object,
  RegExp,
  setTimeout: (fn) => {
    timerId += 1;
    timers.set(timerId, fn);
    return timerId;
  },
  clearTimeout: (id) => timers.delete(id),
  setInterval: () => 1,
  clearInterval: () => {},
  Blob: class Blob {
    constructor(parts, options = {}) {
      this.parts = parts;
      this.type = options.type;
    }
  },
  // بديل File.text في WebView قديم داخل أندرويد (FileReader متوفر دائماً).
  FileReader: class FileReader {
    readAsText(file) {
      this.result = typeof file.__text === "string" ? file.__text : "";
      if (typeof this.onload === "function") this.onload();
    }
  },
  URL: {
    createObjectURL: (blob) => {
      lastBlob = blob;
      return "blob:test";
    },
    revokeObjectURL: () => {},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.window.innerWidth = 400;
sandbox.window.matchMedia = () => ({ matches: false });
sandbox.window.getSelection = () => "";

const windowListeners = new Map();
sandbox.addEventListener = (type, handler) => {
  if (!windowListeners.has(type)) windowListeners.set(type, []);
  windowListeners.get(type).push(handler);
};
async function dispatchWindowEvent(type, event) {
  for (const handler of (windowListeners.get(type) || [])) {
    await handler(event);
  }
}

vm.createContext(sandbox);

/* ===== تشغيل سكربتات الصفحة ===== */
vm.runInContext(config, sandbox);
vm.runInContext(STORAGE_SOURCE, sandbox);
vm.runInContext(themeInit, sandbox);
vm.runInContext(data, sandbox);

/* ملفات ES modules تُقرأ من القرص وتُربط ثم تُقيَّم في سياق الصفحة نفسه،
   فتصل إلى document وlocalStorage مثل السكربتات الكلاسيكية تماماً. */
const moduleCache = new Map();
function pageModule(file) {
  if (moduleCache.has(file)) return moduleCache.get(file);
  const module = new vm.SourceTextModule(fs.readFileSync(file, "utf8"), {
    identifier: file,
    context: sandbox,
  });
  moduleCache.set(file, module);
  return module;
}
const linkPageModule = (specifier, referencingModule) =>
  pageModule(path.resolve(path.dirname(referencingModule.identifier), specifier));

const entryModule = pageModule(path.join(root, "app", "app.js"));
await entryModule.link(linkPageModule);
await entryModule.evaluate();

/* ===== أدوات الاختبار ===== */

const list = byId.get("dhikr-list");
const nextButton = byId.get("next-incomplete");
const timeLeft = byId.get("time-left");
const undoBar = byId.get("undo-bar");
const undoText = byId.get("undo-text");
const undoButton = byId.get("undo-button");
const settings = () => JSON.parse(storage.get("adkar.settings.v1") || "{}");
const state = () => JSON.parse(storage.get("adkar.v1") || '{"days":{}}');
const previousTitleKey = (period, title) => {
  const source = String(title).normalize("NFKC").trim();
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return period + "-" + (hash >>> 0).toString(36);
};
const itemKeys = {
  morning0: "morning-ayat-al-kursi",
  morning1: "morning-surah-al-ikhlas",
  morning2: "morning-surah-al-falaq",
  evening0: "evening-ayat-al-kursi",
  wake0: "wake-wake-after-sleep",
  sleep0: "sleep-last-two-baqarah",
};

const pill = (index) => list.children[index].querySelector(".pill");
const resetItem = (index) => list.children[index].querySelector(".undo");
const sleepPill = (index) => supplementList.children[index].querySelector(".pill");

check("initial morning items = 16", list.children.length === 16, String(list.children.length));
check(
  "next button shows remaining 16",
  nextButton.textContent === "التالي — بقي ١٦",
  nextButton.textContent
);
check(
  "countdown morning = 5 hours left",
  timeLeft.textContent === "المتبقي: ٥ ساعات",
  timeLeft.textContent
);
check(
  "tab title shows morning remaining",
  document.title === "(١٦) أذكار الصباح",
  document.title
);
check(
  "initial current streak is zero",
  byId.get("streak-current").textContent === "٠",
  byId.get("streak-current").textContent
);
check(
  "initial best streak is zero",
  byId.get("streak-best").textContent === "٠",
  byId.get("streak-best").textContent
);
check(
  "initial weekly summary is empty",
  byId.get("weekly-summary").textContent.includes("٠/٧ أيام كاملة"),
  byId.get("weekly-summary").textContent
);
check(
  "initial backup reminder",
  byId.get("backup-reminder").textContent.includes("لم تصدّر"),
  byId.get("backup-reminder").textContent
);
check(
  "footer shows the app version in Arabic digits",
  byId.get("app-version").textContent === "١.١.١",
  byId.get("app-version").textContent
);
check(
  "footer shows the current year",
  byId.get("app-year").textContent === "٢٠٢٦",
  byId.get("app-year").textContent
);
check(
  "footer names the developer",
  byId.get("app-author").textContent === "jaba reda",
  byId.get("app-author").textContent
);
check(
  "footer links the GitHub repository",
  byId.get("app-github").href === "https://github.com/jabar-reda/adkar",
  byId.get("app-github").href
);
check(
  "footer links the Instagram profile",
  byId.get("app-instagram").href === "https://instagram.com/jbr.rda",
  byId.get("app-instagram").href
);
check(
  "calendar has 35 cells for October 2026",
  byId.get("calendar-grid").children.length === 35,
  String(byId.get("calendar-grid").children.length)
);
const todayCell = () =>
  byId
    .get("calendar-grid")
    .children.find((cell) => cell.dataset.key === "2026-10-31") || null;
check("today cell is marked", Boolean(todayCell() && todayCell().classList.contains("is-today")));
check(
  "today detail says no progress",
  byId.get("calendar-detail").textContent.includes("لا يوجد تقدم"),
  byId.get("calendar-detail").textContent
);

/* تبديل التبويبات */
tabEvening.click();
check("evening items = 19", list.children.length === 19, String(list.children.length));
check(
  "countdown evening starts in 5 hours",
  timeLeft.textContent === "يبدأ وقت أذكار المساء بعد ٥ ساعات",
  timeLeft.textContent
);
check(
  "evening tab selected",
  tabEvening.getAttribute("aria-selected") === "true" &&
    tabMorning.getAttribute("aria-selected") === "false"
);
tabMorning.click();
check("back to morning = 16", list.children.length === 16);

/* العدّ والتراجع */
pill(0).click();
check("first dhikr completed", pill(0).textContent === "تم ✓");
check(
  "tab title decrements after a tap",
  document.title === "(١٥) أذكار الصباح",
  document.title
);
check("progress saved to storage", Boolean(state().days["2026-10-31"]));
check("progress storage uses schema version 3", state().schemaVersion === 3, String(state().schemaVersion));
check("undo bar visible", undoBar.hidden === false);
check("undo text mentions title", undoText.textContent.includes("آية الكرسي"), undoText.textContent);
undoButton.click();
check("undo restores first dhikr", pill(0).textContent !== "تم ✓");
check("undo bar hidden after undo", undoBar.hidden === true);
check(
  "tab title restores after undo",
  document.title === "(١٦) أذكار الصباح",
  document.title
);

pill(0).click();
nextButton.click();
check("next scrolls to first incomplete", list.children[1].scrolled === true);
check(
  "next highlights first incomplete",
  list.children[1].classList.contains("is-highlighted")
);
check("next focuses its pill", pill(1).focused === true);

pill(1).click();
pill(1).click();
check("second dhikr not complete at 2/3", pill(1).textContent.includes("٢ من ٣"));
pill(1).click();
check("second dhikr complete at 3/3", pill(1).textContent === "تم ✓");
undoButton.click();
check("undo returns 3/3 to 2/3", pill(1).textContent.includes("٢ من ٣"));
resetItem(1).click();
check("per-item reset returns to 0/3", pill(1).textContent.includes("٠ من ٣"));
undoButton.click();
check("undo restores reset item to 2/3", pill(1).textContent.includes("٢ من ٣"));

/* الإعدادات */
fontButtons.find((button) => button.dataset.fontSize === "large").click();
check(
  "font size applied to html",
  document.documentElement.dataset.fontSize === "large",
  document.documentElement.dataset.fontSize
);
check("font size saved", settings().fontSize === "large", JSON.stringify(settings()));
check(
  "font button pressed state",
  fontButtons.find((button) => button.dataset.fontSize === "large").getAttribute("aria-pressed") ===
    "true"
);

themeButtons.find((button) => button.dataset.theme === "morning").click();
check(
  "manual morning theme applied",
  document.documentElement.dataset.period === "morning",
  document.documentElement.dataset.period
);
tabEvening.click();
check(
  "manual theme pinned while evening tab active",
  document.documentElement.dataset.period === "morning",
  document.documentElement.dataset.period
);
themeButtons.find((button) => button.dataset.theme === "auto").click();
check(
  "auto theme follows active evening tab",
  document.documentElement.dataset.period === "evening",
  document.documentElement.dataset.period
);
tabMorning.click();

themeButtons.find((button) => button.dataset.theme === "time").click();
check(
  "time theme uses the clock at 10:00",
  document.documentElement.dataset.period === "morning",
  document.documentElement.dataset.period
);
tabEvening.click();
check(
  "time theme ignores the evening tab at 10:00",
  document.documentElement.dataset.period === "morning",
  document.documentElement.dataset.period
);
setHour(16);
check(
  "time theme follows the clock at 16:00",
  document.documentElement.dataset.period === "evening",
  document.documentElement.dataset.period
);
tabMorning.click();
check(
  "time theme ignores the morning tab at 16:00",
  document.documentElement.dataset.period === "evening",
  document.documentElement.dataset.period
);
themeButtons.find((button) => button.dataset.theme === "auto").click();
check(
  "auto theme returns to the active morning tab",
  document.documentElement.dataset.period === "morning",
  document.documentElement.dataset.period
);

/* نافذة الوقت عبر ساعات مختلفة */
setHour(16);
check(
  "morning window ended after 15:00",
  timeLeft.textContent.startsWith("انتهى الوقت المفضل"),
  timeLeft.textContent
);
tabEvening.click();
check(
  "evening at 16:00 has 12 hours left",
  timeLeft.textContent === "المتبقي: ١٢ ساعة",
  timeLeft.textContent
);
setHour(3);
check(
  "evening at 03:00 has 1 hour left",
  timeLeft.textContent === "المتبقي: ساعة",
  timeLeft.textContent
);
tabMorning.click();
check(
  "morning at 03:00 starts in 1 hour",
  timeLeft.textContent === "يبدأ وقت أذكار الصباح بعد ساعة",
  timeLeft.textContent
);
setHour(10);
tabMorning.click();

/* استيراد */
const fakeFile = {
  size: 200,
  text: () =>
    Promise.resolve(
      JSON.stringify({
        app: "adkar",
        version: 1,
        days: {
          "2026-10-31": {
            morning: {
              "morning-0": { count: 1, done: true },
              "morning-1": { count: 999, done: false },
              "morning-99": { count: 5, done: false },
            },
            evening: {},
          },
          "2026-10-30": {
            morning: { "morning-0": { count: 1, done: true } },
            evening: {},
          },
          "2026-09-15": {
            morning: { "morning-0": { count: 1, done: true } },
            evening: {},
          },
          "2099-01-01": {
            morning: { "morning-0": { count: 1, done: true } },
            evening: {},
          },
          "not-a-date": {
            morning: { "morning-0": { count: 1, done: true } },
            evening: {},
          },
        },
        settings: {
          fontSize: "small",
          theme: "auto",
          lastExportAt: "2026-10-11T00:00:00.000Z",
        },
      })
    ),
};

async function runAsyncTests() {
  importFile.files = [fakeFile];
  importFile.dispatch("change");
  await new Promise((resolve) => setImmediate(resolve));

  check("import preview shown", byId.get("import-confirm").hidden === false);
  check(
    "import summary mentions day count",
    byId.get("import-summary").textContent.includes("٣ أيام"),
    byId.get("import-summary").textContent
  );

  byId.get("import-apply").click();
  check(
    "import success dialog confirms the restore",
    backupDialog.open === true &&
      byId.get("backup-dialog-title").textContent === "تم استيراد النسخة",
    byId.get("backup-dialog-title").textContent
  );
  byId.get("backup-dialog-close").click();
  check("import success dialog closes", backupDialog.open === false);
  check("import applies font setting", settings().fontSize === "small", JSON.stringify(settings()));
  check(
    "import applies data (first item complete)",
    pill(0).textContent === "تم ✓",
    pill(0).textContent
  );
  check(
    "import clamps counts and drops unknown keys",
    pill(1).textContent === "تم ✓",
    pill(1).textContent
  );
  check(
    "import keeps only valid dates",
    Object.keys(state().days).length === 3,
    String(Object.keys(state().days).length)
  );
  check(
    "import restores an old export date as a warning",
    byId.get("backup-reminder").classList.contains("is-warning"),
    byId.get("backup-reminder").textContent
  );
  check(
    "tab title reflects imported progress",
    document.title === "(١٤) أذكار الصباح",
    document.title
  );
  check(
    "calendar detail shows imported counts",
    byId.get("calendar-detail").textContent.includes("٢/١٦"),
    byId.get("calendar-detail").textContent
  );
  check(
    "calendar previous enabled with older data",
    byId.get("calendar-prev").disabled === false
  );

  byId.get("calendar-prev").click();
  check(
    "calendar moves to the previous month",
    byId.get("calendar-month").textContent.includes("سبتمبر"),
    byId.get("calendar-month").textContent
  );
  byId.get("calendar-next").click();
  check(
    "calendar returns to the current month",
    byId.get("calendar-month").textContent.includes("أكتوبر"),
    byId.get("calendar-month").textContent
  );
  todayCell().click();
  check(
    "calendar day click restores today detail",
    byId.get("calendar-detail").textContent.includes("٢/١٦"),
    byId.get("calendar-detail").textContent
  );
  check(
    "import status message",
    byId.get("backup-status").textContent.includes("تم استيراد"),
    byId.get("backup-status").textContent
  );

  /* تصدير */
  byId.get("export-backup").click();
  check(
    "export status message",
    byId.get("backup-status").textContent.includes("تم تصدير"),
    byId.get("backup-status").textContent
  );
  check(
    "export records a fresh backup date",
    Boolean(settings().lastExportAt),
    JSON.stringify(settings())
  );
  check(
    "export clears the stale backup warning",
    !byId.get("backup-reminder").classList.contains("is-warning"),
    byId.get("backup-reminder").textContent
  );
  check(
    "export opens a confirmation dialog",
    backupDialog.open === true &&
      byId.get("backup-dialog-title").textContent === "تم تصدير النسخة",
    byId.get("backup-dialog-title").textContent
  );
  check(
    "export dialog carries the JSON backup",
    byId.get("backup-dialog-text").value.includes('"schemaVersion": 3') &&
      byId.get("backup-dialog-text").value.includes('"days"'),
    byId.get("backup-dialog-text").value.slice(0, 80)
  );
  check(
    "export dialog offers a download on the web",
    byId.get("backup-download").hidden === false &&
      byId.get("backup-copy").hidden === false
  );
  byId.get("backup-dialog-close").click();
  check("export dialog closes", backupDialog.open === false);

  /* لصق نسخة: مسار الاستيراد الذي يعمل داخل تطبيق أندرويد */
  byId.get("import-paste").click();
  check(
    "paste dialog opens with an editable box",
    backupDialog.open === true &&
      byId.get("backup-dialog-text").hidden === false &&
      byId.get("backup-dialog-text").readOnly === false,
    String(byId.get("backup-dialog-text").readOnly)
  );
  check(
    "paste dialog shows the verify button",
    byId.get("backup-verify").hidden === false
  );
  byId.get("backup-dialog-text").value = JSON.stringify({
    schemaVersion: 3,
    days: { "2026-10-28": { morning: { "morning-0": { count: 1, done: true } } } },
  });
  byId.get("backup-verify").click();
  check("paste import closes the dialog", backupDialog.open === false);
  check(
    "paste import shows a preview",
    byId.get("import-confirm").hidden === false,
    byId.get("backup-status").textContent
  );
  check(
    "paste import preview counts the day",
    byId.get("import-summary").textContent.includes("يوم واحد"),
    byId.get("import-summary").textContent
  );
  byId.get("import-cancel").click();
  check("paste import cancel closes the preview", byId.get("import-confirm").hidden === true);

  /* CSV */
  byId.get("export-csv").click();
  const csv = lastBlob && lastBlob.parts[0];
  check(
    "CSV starts with a UTF-8 BOM",
    typeof csv === "string" && csv.charCodeAt(0) === 0xfeff,
    typeof csv === "string" ? String(csv.charCodeAt(0)) : String(csv)
  );
  check(
    "CSV has Arabic headers",
    typeof csv === "string" &&
      csv.includes("التاريخ") &&
      csv.includes("اكتمل اليوم") &&
      csv.includes("أذكار الاستيقاظ المكتملة"),
    typeof csv === "string" ? csv.slice(0, 120) : String(csv)
  );
  check(
    "CSV contains valid days and counts",
    typeof csv === "string" &&
      csv.includes("2026-09-15") &&
      csv.includes("2026-10-31") &&
      csv.includes("2/16"),
    typeof csv === "string" ? csv : String(csv)
  );
  check(
    "CSV export status message",
    byId.get("backup-status").textContent.includes("CSV"),
    byId.get("backup-status").textContent
  );

  /* داخل APK (WebView): تنزيل blob لا يعمل، فيُعرض النص للنسخ بدلاً منه */
  sandbox.ADKAR_STORAGE.isNative = true;

  lastBlob = null;
  byId.get("export-backup").click();
  check(
    "native JSON export never creates a blob",
    lastBlob === null,
    String(lastBlob)
  );
  check(
    "native JSON export hides the download and keeps copy",
    byId.get("backup-download").hidden === true &&
      byId.get("backup-copy").hidden === false
  );
  check(
    "native JSON export explains the copy path",
    byId.get("backup-dialog-message").textContent.includes("التنزيل المباشر غير متاح"),
    byId.get("backup-dialog-message").textContent
  );
  check(
    "native JSON export still carries the backup text",
    byId.get("backup-dialog-text").value.includes('"schemaVersion": 3') &&
      byId.get("backup-dialog-text").value.includes('"days"'),
    byId.get("backup-dialog-text").value.slice(0, 80)
  );
  byId.get("backup-dialog-close").click();

  lastBlob = null;
  byId.get("export-csv").click();
  check(
    "native CSV export never creates a blob",
    lastBlob === null,
    String(lastBlob)
  );
  check(
    "native CSV export shows the CSV text for copying",
    byId.get("backup-dialog-title").textContent === "تم تصدير CSV" &&
      byId.get("backup-dialog-text").value.includes("التاريخ") &&
      byId.get("backup-copy").hidden === false,
    byId.get("backup-dialog-title").textContent
  );
  check(
    "native CSV export hides the download button",
    byId.get("backup-download").hidden === true
  );
  check(
    "native CSV export status message",
    byId.get("backup-status").textContent.includes("CSV") &&
      byId.get("backup-status").textContent.includes("تم تجهيز"),
    byId.get("backup-status").textContent
  );
  byId.get("backup-dialog-close").click();
  sandbox.ADKAR_STORAGE.isNative = false;

  /* الدمج */
  importFile.files = [
    {
      size: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            app: "adkar",
            version: 1,
            days: {
              "2026-10-31": {
                morning: {
                  "morning-0": { count: 0, done: false },
                  "morning-2": { count: 3, done: true },
                },
                evening: { "evening-0": { count: 1, done: true } },
              },
              "2026-10-30": {
                morning: { "morning-1": { count: 3, done: true } },
                evening: {},
              },
              "2026-10-29": {
                morning: { "morning-0": { count: 1, done: true } },
                evening: {},
              },
              "2099-01-01": {
                morning: { "morning-0": { count: 1, done: true } },
                evening: {},
              },
            },
            settings: { fontSize: "xlarge", theme: "evening" },
          })
        ),
    },
  ];
  importFile.dispatch("change");
  await new Promise((resolve) => setImmediate(resolve));

  check("merge preview shown", byId.get("import-confirm").hidden === false);
  check(
    "merge preview explains both choices",
    byId.get("import-summary").textContent.includes("دمج") &&
      byId.get("import-summary").textContent.includes("استبدال"),
    byId.get("import-summary").textContent
  );

  byId.get("import-merge").click();

  check(
    "merge keeps local settings",
    settings().theme === "auto" && settings().fontSize === "small",
    JSON.stringify(settings())
  );
  check(
    "merge keeps the higher count for an existing item",
    pill(0).textContent === "تم ✓" && pill(1).textContent === "تم ✓",
    `${pill(0).textContent} / ${pill(1).textContent}`
  );
  check(
    "merge takes imported progress for a new item",
    pill(2).textContent === "تم ✓",
    pill(2).textContent
  );
  check(
    "merge never lowers an existing count",
    state().days["2026-10-31"].morning[itemKeys.morning0].count === 1,
    JSON.stringify(state().days["2026-10-31"].morning[itemKeys.morning0])
  );
  check(
    "merge adds the imported evening progress",
    state().days["2026-10-31"].evening[itemKeys.evening0].count === 1,
    JSON.stringify(state().days["2026-10-31"].evening)
  );
  check(
    "merge adds a new day",
    Boolean(state().days["2026-10-29"]),
    Object.keys(state().days).join(",")
  );
  check(
    "merge combines both records on an existing day",
    Boolean(
      state().days["2026-10-30"].morning[itemKeys.morning0] &&
        state().days["2026-10-30"].morning[itemKeys.morning1]
    ),
    JSON.stringify(state().days["2026-10-30"].morning)
  );
  check(
    "merge keeps only valid days",
    Object.keys(state().days).length === 4,
    String(Object.keys(state().days).length)
  );
  check(
    "merge status message",
    byId.get("backup-status").textContent.includes("تم دمج") &&
      byId.get("backup-status").textContent.includes("أُضيف يوم جديد"),
    byId.get("backup-status").textContent
  );
  check(
    "merge closes the preview",
    byId.get("import-confirm").hidden === true
  );
  check(
    "merge updates the tab title",
    document.title === "(١٣) أذكار الصباح",
    document.title
  );

  /* اختيار يوم سابق من التقويم يعرضه في الأعلى ويسمح بتعديله */
  const calendarCell = (key) =>
    byId.get("calendar-grid").children.find((cell) => cell.dataset.key === key) || null;

  calendarCell("2026-10-29").click();
  check(
    "calendar selection marks the chosen day",
    Boolean(calendarCell("2026-10-29").classList.contains("is-selected")) &&
      !calendarCell("2026-10-31").classList.contains("is-selected")
  );
  check(
    "selecting a past day shows its adhkar on top",
    pill(0).textContent === "تم ✓" && pill(1).textContent.includes("٠ من ٣"),
    `${pill(0).textContent} / ${pill(1).textContent}`
  );
  const expectedPastDate = new Intl.DateTimeFormat("ar", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new RealDate(2026, 9, 29));
  check(
    "viewing note explains the past day",
    byId.get("viewing-note").hidden === false &&
      byId.get("viewing-note-text").textContent.includes(expectedPastDate),
    byId.get("viewing-note-text").textContent
  );
  check(
    "past day hides the live countdown",
    timeLeft.textContent === "",
    timeLeft.textContent
  );
  check(
    "reset button names the viewed day",
    byId.get("reset-day").textContent === "إعادة تعيين هذا اليوم",
    byId.get("reset-day").textContent
  );

  pill(1).click();
  check(
    "editing a past day saves into that day",
    state().days["2026-10-29"].morning[itemKeys.morning1].count === 1,
    JSON.stringify(state().days["2026-10-29"].morning)
  );
  check(
    "editing a past day leaves today untouched",
    state().days["2026-10-31"].morning[itemKeys.morning1].count === 3,
    JSON.stringify(state().days["2026-10-31"].morning)
  );

  byId.get("viewing-today").click();
  check(
    "view-today button returns to the current day",
    byId.get("viewing-note").hidden === true && pill(1).textContent === "تم ✓",
    `${byId.get("viewing-note").hidden} / ${pill(1).textContent}`
  );
  check(
    "returning to today restores the countdown",
    timeLeft.textContent !== "" && byId.get("reset-day").textContent === "إعادة تعيين اليوم",
    timeLeft.textContent
  );

  /* العدّاد الكبير */
  const counterOpen = (index) => list.children[index].querySelector(".counter-open");
  const counterDialog = byId.get("counter-dialog");

  check("repeated dhikr has a counter button", Boolean(counterOpen(14)));
  check("single dhikr has no counter button", counterOpen(0) === null);
  check("count-0 dhikr has no counter button", counterOpen(15) === null);

  const counterOpener = counterOpen(14);
  counterOpener.click();
  check("counter dialog opens", counterDialog.open === true);
  check("counter dialog locks page scroll", document.body.classList.contains("is-dialog-open"));
  check(
    "counter title matches the dhikr",
    byId.get("counter-title").textContent ===
      list.children[14].querySelector(".dhikr-title").textContent,
    byId.get("counter-title").textContent
  );
  check(
    "counter starts at zero of a hundred",
    byId.get("counter-count").textContent === "٠ من ١٠٠",
    byId.get("counter-count").textContent
  );
  check(
    "counter shows the dhikr text",
    byId.get("counter-text").children.length > 0,
    String(byId.get("counter-text").children.length)
  );

  byId.get("counter-button").click();
  check(
    "counter increments",
    byId.get("counter-count").textContent === "١ من ١٠٠",
    byId.get("counter-count").textContent
  );
  check(
    "counter progress bar fills",
    byId.get("counter-fill").style.width === "1%",
    byId.get("counter-fill").style.width
  );

  byId.get("counter-reset").click();
  check(
    "counter reset asks for confirmation",
    byId.get("counter-reset").textContent === "اضغط مرة أخرى للتأكيد",
    byId.get("counter-reset").textContent
  );
  byId.get("counter-reset").click();
  check(
    "counter reset returns to zero",
    byId.get("counter-count").textContent === "٠ من ١٠٠",
    byId.get("counter-count").textContent
  );

  counterOpener.focused = false;
  byId.get("counter-close").click();
  check("counter dialog closes", counterDialog.open === false);
  check("counter dialog unlocks page scroll", !document.body.classList.contains("is-dialog-open"));
  check("focus returns to the counter button", counterOpener.focused === true);

  /* ملف غير صالح */
  importFile.files = [{ size: 10, text: () => Promise.resolve("not json") }];
  importFile.dispatch("change");
  await new Promise((resolve) => setImmediate(resolve));
  check("invalid import rejected", byId.get("backup-status").classList.contains("is-error"));
  check("invalid import hides preview", byId.get("import-confirm").hidden === true);

  /* نسخة احتياطية لا تحتوي أياماً — تُقبل ولا تُرفض */
  importFile.files = [{
    size: 30,
    text: () => Promise.resolve(JSON.stringify({ schemaVersion: 2, days: {} })),
  }];
  importFile.dispatch("change");
  await new Promise((resolve) => setImmediate(resolve));
  check(
    "empty backup is accepted with a preview",
    byId.get("import-confirm").hidden === false,
    byId.get("backup-status").textContent
  );
  check(
    "empty backup preview warns about replace",
    byId.get("import-summary").textContent.includes("سيمسح كل تقدمك"),
    byId.get("import-summary").textContent
  );
  byId.get("import-cancel").click();
  check("empty backup cancel closes the preview", byId.get("import-confirm").hidden === true);

  /* WebView قديم لا يوفر File.text: القراءة تمر عبر FileReader */
  importFile.files = [{
    size: 60,
    __text: JSON.stringify({
      schemaVersion: 3,
      days: { "2026-10-27": { morning: { "morning-0": { count: 1, done: true } } } },
    }),
  }];
  importFile.dispatch("change");
  await new Promise((resolve) => setImmediate(resolve));
  check(
    "import reads files through FileReader (old WebView)",
    byId.get("import-confirm").hidden === false,
    byId.get("backup-status").textContent
  );
  check(
    "FileReader import counts the day",
    byId.get("import-summary").textContent.includes("يوم واحد"),
    byId.get("import-summary").textContent
  );
  byId.get("import-cancel").click();

  /* إكمال قسم الصباح، وآخر ذكر من داخل العدّاد */
  for (let index = 0; index < list.children.length; index += 1) {
    if (index === 14) continue;
    for (let tap = 0; tap < 101; tap += 1) {
      if (pill(index).textContent === "تم ✓") break;
      pill(index).click();
    }
  }
  check("morning is not complete before the last dhikr", nextButton.disabled === false);

  counterOpen(14).click();
  for (let tap = 0; tap < 100; tap += 1) byId.get("counter-button").click();
  check(
    "counter completes the dhikr inside the dialog",
    byId.get("counter-count").textContent === "١٠٠ من ١٠٠",
    byId.get("counter-count").textContent
  );
  check("counter button says done", byId.get("counter-button").textContent === "تم ✓");
  check("counter button disables when done", byId.get("counter-button").disabled === true);
  check(
    "completion effect waits while the counter is open",
    !byId.get("progress-bar").classList.contains("is-celebrating")
  );
  check(
    "progress text announces morning completion",
    byId.get("progress-text").textContent === "أكملت أذكار الصباح",
    byId.get("progress-text").textContent
  );

  byId.get("counter-close").click();
  check(
    "completion effect fires after the counter closes",
    byId.get("progress-bar").classList.contains("is-celebrating")
  );
  check(
    "completion announcement after the counter",
    byId.get("live").textContent.includes("أكملت أذكار الصباح"),
    byId.get("live").textContent
  );

  check("all complete disables next button", nextButton.disabled === true);
  check("next button text when complete", nextButton.textContent === "أكملت القسم");
  check(
    "tab title checks the morning",
    document.title === "✓ أذكار الصباح",
    document.title
  );
  check(
    "morning-only day keeps the streak at zero",
    byId.get("streak-current").textContent === "٠",
    byId.get("streak-current").textContent
  );
  check(
    "streak hint asks to finish the day",
    byId.get("streak-note").textContent.includes("أكمل اليوم"),
    byId.get("streak-note").textContent
  );
  check(
    "weekly summary counts morning only",
    byId.get("weekly-summary").textContent.includes("الصباح ١/٧") &&
      byId.get("weekly-summary").textContent.includes("٠/٧ أيام كاملة"),
    byId.get("weekly-summary").textContent
  );
  check(
    "calendar marks today as partial",
    Boolean(todayCell() && todayCell().classList.contains("is-partial")),
    todayCell() ? todayCell().className : "missing"
  );

  /* أذكار الاستيقاظ المكمّلة */
  check(
    "wake group shows in the morning",
    supplementGroup.hidden === false
  );
  check(
    "wake title names the group",
    byId.get("supplement-title").textContent === "أذكار الاستيقاظ",
    byId.get("supplement-title").textContent
  );
  check(
    "wake group has 5 items",
    supplementList.children.length === 5,
    String(supplementList.children.length)
  );
  check(
    "morning tab still counts 16 base adhkar",
    tabMorning.querySelector(".tab-count").textContent === "١٦ من ١٦",
    tabMorning.querySelector(".tab-count").textContent
  );
  check(
    "morning dot is not gold before wake adhkar",
    !todayCell().querySelectorAll(".calendar-dot")[0].classList.contains("is-gold")
  );

  for (let index = 0; index < supplementList.children.length; index += 1) {
    for (let tap = 0; tap < 101; tap += 1) {
      if (sleepPill(index).textContent === "تم ✓") break;
      sleepPill(index).click();
    }
  }
  check(
    "wake progress says all five are done",
    byId.get("supplement-progress").textContent === "أكملت أذكار الاستيقاظ",
    byId.get("supplement-progress").textContent
  );
  check(
    "morning dot turns gold after wake adhkar",
    Boolean(todayCell().querySelectorAll(".calendar-dot")[0].classList.contains("is-gold")),
    todayCell().querySelectorAll(".calendar-dot")[0].className
  );
  check(
    "calendar detail counts wake adhkar",
    byId.get("calendar-detail").textContent.includes("أذكار الاستيقاظ ٥/٥"),
    byId.get("calendar-detail").textContent
  );
  check(
    "wake adhkar are stored separately",
    Boolean(
      state().days["2026-10-31"] &&
        state().days["2026-10-31"].wake &&
        state().days["2026-10-31"].wake[itemKeys.wake0]
    )
  );
  check(
    "wake adhkar do not change the streak",
    byId.get("streak-current").textContent === "٠",
    byId.get("streak-current").textContent
  );

  /* إكمال المساء ليكتمل اليوم */
  tabEvening.click();
  for (let index = 0; index < list.children.length; index += 1) {
    for (let tap = 0; tap < 101; tap += 1) {
      if (pill(index).textContent === "تم ✓") break;
      pill(index).click();
    }
  }
  check("evening completes", nextButton.disabled === true);
  check(
    "a full day starts the streak",
    byId.get("streak-current").textContent === "١",
    byId.get("streak-current").textContent
  );
  check(
    "best streak follows the current one",
    byId.get("streak-best").textContent === "١",
    byId.get("streak-best").textContent
  );
  check(
    "streak hint clears when the day is complete",
    byId.get("streak-note").textContent === "",
    byId.get("streak-note").textContent
  );
  check(
    "weekly summary counts one complete day",
    byId.get("weekly-summary").textContent.includes("١/٧ أيام كاملة"),
    byId.get("weekly-summary").textContent
  );
  check(
    "calendar marks today as complete",
    Boolean(todayCell() && todayCell().classList.contains("is-complete")),
    todayCell() ? todayCell().className : "missing"
  );
  check(
    "a complete day stores both sections",
    Boolean(
      state().days["2026-10-31"] &&
        state().days["2026-10-31"].morning &&
        state().days["2026-10-31"].evening
    )
  );

  /* أذكار النوم المكمّلة */
  check(
    "sleep group shows in the evening",
    byId.get("supplement-group").hidden === false
  );
  check(
    "sleep title names the group",
    byId.get("supplement-title").textContent === "أذكار النوم",
    byId.get("supplement-title").textContent
  );
  check(
    "sleep group has 10 items",
    supplementList.children.length === 10,
    String(supplementList.children.length)
  );
  check(
    "evening tab still counts 19 base adhkar",
    tabEvening.querySelector(".tab-count").textContent === "١٩ من ١٩",
    tabEvening.querySelector(".tab-count").textContent
  );
  check(
    "evening dot is not gold before sleep adhkar",
    !todayCell().querySelectorAll(".calendar-dot")[1].classList.contains("is-gold")
  );

  for (let index = 0; index < supplementList.children.length; index += 1) {
    for (let tap = 0; tap < 101; tap += 1) {
      if (sleepPill(index).textContent === "تم ✓") break;
      sleepPill(index).click();
    }
  }
  check(
    "sleep progress says all ten are done",
    byId.get("supplement-progress").textContent === "أكملت أذكار النوم",
    byId.get("supplement-progress").textContent
  );
  check(
    "evening dot turns gold after sleep adhkar",
    Boolean(todayCell().querySelectorAll(".calendar-dot")[1].classList.contains("is-gold")),
    todayCell().querySelectorAll(".calendar-dot")[1].className
  );
  check(
    "morning dot stays gold after sleep adhkar",
    Boolean(todayCell().querySelectorAll(".calendar-dot")[0].classList.contains("is-gold")),
    todayCell().querySelectorAll(".calendar-dot")[0].className
  );
  check(
    "calendar detail counts sleep adhkar",
    byId.get("calendar-detail").textContent.includes("أذكار النوم ١٠/١٠"),
    byId.get("calendar-detail").textContent
  );
  check(
    "sleep adhkar are stored separately",
    Boolean(
      state().days["2026-10-31"] &&
        state().days["2026-10-31"].sleep &&
        state().days["2026-10-31"].sleep[itemKeys.sleep0]
    )
  );
  check(
    "sleep adhkar do not change the streak",
    byId.get("streak-current").textContent === "١",
    byId.get("streak-current").textContent
  );

  tabMorning.click();
  check(
    "morning tab shows the wake group again",
    byId.get("supplement-group").hidden === false &&
      byId.get("supplement-title").textContent === "أذكار الاستيقاظ",
    byId.get("supplement-title").textContent
  );
  check(
    "wake progress stays complete",
    byId.get("supplement-progress").textContent === "أكملت أذكار الاستيقاظ",
    byId.get("supplement-progress").textContent
  );

  /* إعادة تعيين اليوم */
  byId.get("reset-day").click();
  check(
    "reset asks for confirmation",
    byId.get("reset-day").textContent === "اضغط مرة أخرى للتأكيد",
    byId.get("reset-day").textContent
  );
  byId.get("reset-day").click();
  check("reset clears today", pill(0).textContent !== "تم ✓", pill(0).textContent);
  check(
    "reset clears the gold dots",
    !todayCell().querySelectorAll(".calendar-dot")[0].classList.contains("is-gold") &&
      !todayCell().querySelectorAll(".calendar-dot")[1].classList.contains("is-gold")
  );

  /* تحذير التخزين عند تعذّر الحفظ */
  const realSetItem = localStorage.setItem;
  localStorage.setItem = () => {
    throw new Error("quota exceeded");
  };
  pill(0).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(
    "a failed save shows the storage warning",
    byId.get("storage-warning").hidden === false
  );

  localStorage.setItem = realSetItem;
  resetItem(0).click();
  check(
    "a successful save hides the storage warning",
    byId.get("storage-warning").hidden === true
  );

  /* المزامنة بين التبويبات */
  storage.set(
    "adkar.v1",
    JSON.stringify({
      days: { "2026-10-31": { morning: { "morning-0": { count: 1, done: true } } } },
    })
  );
  await dispatchWindowEvent("storage", { key: "adkar.v1" });
  check(
    "a storage event reloads progress from another tab",
    pill(0).textContent === "تم ✓",
    pill(0).textContent
  );

  storage.set("adkar.settings.v1", JSON.stringify({ fontSize: "large", theme: "auto" }));
  await dispatchWindowEvent("storage", { key: "adkar.settings.v1" });
  check(
    "a storage event applies settings from another tab",
    document.documentElement.dataset.fontSize === "large",
    document.documentElement.dataset.fontSize
  );

  /* اختبار سلسلة تتجاوز نافذة الاحتفاظ */
  const completeRecord = (period, ids) => Object.fromEntries(ids.map((id) => {
    const count = DHIKR_COUNTS.get(id);
    return [period + "-" + id, count === 0 ? { count: 0, done: true } : { count, done: true }];
  }));
  const longStreakDays = {};
  const startDate = new RealDate(2026, 9, 31);
  for (let offset = 60; offset >= 1; offset -= 1) {
    const date = new RealDate(startDate);
    date.setDate(date.getDate() - offset);
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    longStreakDays[key] = {
      morning: completeRecord("morning", MORNING_ITEM_IDS),
      evening: completeRecord("evening", EVENING_ITEM_IDS),
      wake: {},
      sleep: {},
    };
  }
  storage.set("adkar.v1", JSON.stringify({ schemaVersion: 2, days: longStreakDays, stats: { bestStreak: 0 } }));
  await dispatchWindowEvent("storage", { key: "adkar.v1" });
  tabMorning.click();
  MORNING_ITEM_IDS.forEach((id, index) => {
    const button = pill(index);
    while (!button.classList.contains("is-done")) button.click();
  });
  tabEvening.click();
  EVENING_ITEM_IDS.forEach((id, index) => {
    const button = pill(index);
    while (!button.classList.contains("is-done")) button.click();
  });
  check(
    "best streak preserves a 61-day run across pruning",
    state().stats.bestStreak === 61,
    JSON.stringify(state().stats)
  );
  check(
    "current streak remains accurate after pruning",
    state().stats.currentStreak === 61 && state().stats.currentStreakDate === "2026-10-31",
    JSON.stringify(state().stats)
  );
  check(
    "day details remain bounded after a long streak",
    Object.keys(state().days).length === 60,
    String(Object.keys(state().days).length)
  );

  /* ترحيل المفاتيح السابقة إلى المعرّفات الصريحة */
  const migratedProgress = JSON.parse(storage.get("adkar.v1"));
  migratedProgress.days["2026-10-20"] = {
    morning: { "morning-0": { count: 1, done: true } },
    evening: { [previousTitleKey("evening", "آية الكرسي")]: { count: 1, done: true } },
    wake: {},
    sleep: {},
  };
  storage.set("adkar.v1", JSON.stringify(migratedProgress));
  await dispatchWindowEvent("storage", { key: "adkar.v1" });
  // الترحيل يحدث في الذاكرة أولاً؛ احفظ تغييراً عادياً في قسم الصباح.
  tabMorning.click();
  if (pill(2).textContent === "تم ✓") resetItem(2).click();
  else pill(2).click();
  check(
    "legacy positional keys migrate to explicit IDs",
    state().days["2026-10-20"].morning[itemKeys.morning0].count === 1
  );
  check(
    "previous title-hash keys migrate to explicit IDs",
    state().days["2026-10-20"].evening[itemKeys.evening0].count === 1
  );

  /* وصول تحديث خارجي من تبويب آخر */
  const remoteProgress = JSON.parse(storage.get("adkar.v1"));
  remoteProgress.days["2026-10-31"] = remoteProgress.days["2026-10-31"] || { morning: {}, evening: {}, wake: {}, sleep: {} };
  remoteProgress.days["2026-10-31"].morning = remoteProgress.days["2026-10-31"].morning || {};
  remoteProgress.days["2026-10-31"].morning[itemKeys.morning2] = { count: 1, done: false };
  storage.set("adkar.v1", JSON.stringify(remoteProgress));
  await dispatchWindowEvent("storage", { key: "adkar.v1" });
  check(
    "storage event reloads progress from another tab",
    state().days["2026-10-31"].morning[itemKeys.morning2].count === 1,
    JSON.stringify(state().days["2026-10-31"].morning)
  );

  /* حماية التخزين التالف */
  const structurallyCorruptedProgress = JSON.stringify({ days: { "2026-10-31": null } });
  storage.set("adkar.v1", structurallyCorruptedProgress);
  await dispatchWindowEvent("storage", { key: "adkar.v1" });
  check(
    "valid JSON with a malformed day record is treated as corruption",
    byId.get("storage-warning").hidden === false
  );
  pill(0).click();
  check(
    "malformed day records are never overwritten",
    storage.get("adkar.v1") === structurallyCorruptedProgress,
    storage.get("adkar.v1")
  );

  /* حماية التخزين التالف */
  const corruptedProgress = "{ invalid json";
  storage.set("adkar.v1", corruptedProgress);
  await dispatchWindowEvent("storage", { key: "adkar.v1" });
  check(
    "corrupted progress displays a warning",
    byId.get("storage-warning").hidden === false
  );
  pill(0).click();
  check(
    "corrupted progress is never overwritten by an automatic save",
    storage.get("adkar.v1") === corruptedProgress,
    storage.get("adkar.v1")
  );

  /* توافق سورة الملك مع الأيام المسجلة قبل إضافتها (schemaVersion 2) */
  const legacyEvening = {};
  EVENING_ITEM_IDS.filter((id) => id !== "surah-al-mulk").forEach((id) => {
    const count = DHIKR_COUNTS.get(id);
    legacyEvening["evening-" + id] = count === 0 ? { count: 0, done: true } : { count, done: true };
  });
  const mulkKey = "evening-surah-al-mulk";
  const stateModule = pageModule(path.join(root, "app", "modules", "state.js")).namespace;
  const parseSnapshot = stateModule.parseStateSnapshot;

  const legacySnapshot = parseSnapshot(
    JSON.stringify({
      schemaVersion: 2,
      days: {
        "2026-10-25": { morning: {}, evening: legacyEvening, wake: {}, sleep: {} },
        "2026-10-24": {
          morning: {},
          evening: { ...legacyEvening, [mulkKey]: { count: 0, done: false } },
          wake: {},
          sleep: {},
        },
        "2026-10-23": {
          morning: {},
          evening: { "evening-ayat-al-kursi": { count: 1, done: true } },
          wake: {},
          sleep: {},
        },
      },
    })
  );
  check(
    "a legacy complete evening counts as reading Al-Mulk",
    Boolean(
      legacySnapshot &&
        legacySnapshot.days["2026-10-25"].evening[mulkKey] &&
        legacySnapshot.days["2026-10-25"].evening[mulkKey].count === 1
    ),
    JSON.stringify(legacySnapshot && legacySnapshot.days["2026-10-25"].evening[mulkKey])
  );
  check(
    "a legacy explicit zero for Al-Mulk is never overwritten",
    Boolean(
      legacySnapshot &&
        legacySnapshot.days["2026-10-24"].evening[mulkKey].count === 0 &&
        legacySnapshot.days["2026-10-24"].evening[mulkKey].done === false
    ),
    JSON.stringify(legacySnapshot && legacySnapshot.days["2026-10-24"].evening[mulkKey])
  );
  check(
    "an incomplete legacy evening keeps Al-Mulk unread",
    Boolean(
      legacySnapshot && !legacySnapshot.days["2026-10-23"].evening[mulkKey]
    ),
    JSON.stringify(legacySnapshot && legacySnapshot.days["2026-10-23"].evening)
  );

  const currentSnapshot = parseSnapshot(
    JSON.stringify({
      schemaVersion: 3,
      days: { "2026-10-22": { morning: {}, evening: legacyEvening, wake: {}, sleep: {} } },
    })
  );
  check(
    "schema 3 days are left exactly as stored",
    Boolean(currentSnapshot && !currentSnapshot.days["2026-10-22"].evening[mulkKey]),
    JSON.stringify(currentSnapshot && currentSnapshot.days["2026-10-22"].evening)
  );

  storage.set(
    "adkar.v1",
    JSON.stringify({
      schemaVersion: 2,
      days: { "2026-10-26": { morning: {}, evening: legacyEvening, wake: {}, sleep: {} } },
    })
  );
  await dispatchWindowEvent("storage", { key: "adkar.v1" });
  pill(0).click();
  check(
    "schema 2 data stored on the device migrates on reload",
    Boolean(state().days["2026-10-26"] && state().days["2026-10-26"].evening[mulkKey]),
    JSON.stringify(state().days["2026-10-26"] && state().days["2026-10-26"].evening)
  );

}

await runAsyncTests();
}

/* ===== اختبارات طبقة التخزين (storage.js) ===== */
async function runStorageAdapterTests() {
  // فرع المتصفح: isNative=false، set/get/remove، ورفض set عند فشل localStorage.
  {
    const store = new Map();
    const localStorageMock = {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
    };
    const context = { window: {}, localStorage: localStorageMock, Promise, String, Object, Error };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(STORAGE_SOURCE, context);
    const adapter = context.ADKAR_STORAGE;
    check("storage web: isNative is false", adapter.isNative === false);
    await adapter.set("k", "v");
    check("storage web: set/get round-trips", (await adapter.get("k")) === "v");
    await adapter.remove("k");
    check("storage web: remove clears", (await adapter.get("k")) === null);
    localStorageMock.setItem = () => { throw new Error("quota exceeded"); };
    let rejected = false;
    await adapter.set("k2", "v").catch(() => { rejected = true; });
    check("storage web: set rejects on quota error", rejected);
  }

  // فرع Capacitor: isNative=true، ويستخدم Preferences بدل localStorage.
  {
    const prefs = new Map();
    const Preferences = {
      get: ({ key }) => Promise.resolve(prefs.has(key) ? { value: prefs.get(key) } : {}),
      set: ({ key, value }) => { prefs.set(key, value); return Promise.resolve(); },
      remove: ({ key }) => { prefs.delete(key); return Promise.resolve(); },
    };
    const context = {
      window: {},
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      Promise, String, Object, Error,
    };
    context.window = context;
    context.Capacitor = { isNativePlatform: () => true, Plugins: { Preferences } };
    vm.createContext(context);
    vm.runInContext(STORAGE_SOURCE, context);
    const adapter = context.ADKAR_STORAGE;
    check("storage native: isNative is true", adapter.isNative === true);
    await adapter.set("p", "1");
    check("storage native: writes to Preferences", prefs.get("p") === "1");
    check("storage native: get reads Preferences", (await adapter.get("p")) === "1");
    await adapter.remove("p");
    check("storage native: remove clears Preferences", prefs.has("p") === false);
  }
}

/* ===== التشغيل ===== */
async function runAllTests() {
  await runSimulationTests();
  await runStorageAdapterTests();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runAllTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
