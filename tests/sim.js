const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const themeInit = fs.readFileSync(path.join(root, "theme-init.js"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

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

panel.append(
  byId.get("period-title"),
  byId.get("period-hint"),
  byId.get("time-left"),
  byId.get("progress-text"),
  byId.get("progress-bar"),
  byId.get("progress-fill"),
  byId.get("next-incomplete"),
  byId.get("dhikr-list")
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

vm.createContext(sandbox);

/* ===== تشغيل سكربتات الصفحة ===== */
vm.runInContext(themeInit, sandbox);
vm.runInContext(app, sandbox);

/* ===== أدوات الاختبار ===== */
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

const list = byId.get("dhikr-list");
const nextButton = byId.get("next-incomplete");
const timeLeft = byId.get("time-left");
const undoBar = byId.get("undo-bar");
const undoText = byId.get("undo-text");
const undoButton = byId.get("undo-button");
const settings = () => JSON.parse(storage.get("douaa-tracker.settings.v1") || "{}");
const state = () => JSON.parse(storage.get("douaa-tracker.v1") || '{"days":{}}');

const pill = (index) => list.children[index].querySelector(".pill");
const resetItem = (index) => list.children[index].querySelector(".undo");

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
check("evening items = 18", list.children.length === 18, String(list.children.length));
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
        app: "douaa-tracker",
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
    typeof csv === "string" && csv.includes("التاريخ") && csv.includes("اكتمل اليوم"),
    typeof csv === "string" ? csv.slice(0, 80) : String(csv)
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

  /* الدمج */
  importFile.files = [
    {
      size: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            app: "douaa-tracker",
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
    state().days["2026-10-31"].morning["morning-0"].count === 1,
    JSON.stringify(state().days["2026-10-31"].morning["morning-0"])
  );
  check(
    "merge adds the imported evening progress",
    state().days["2026-10-31"].evening["evening-0"].count === 1,
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
      state().days["2026-10-30"].morning["morning-0"] &&
        state().days["2026-10-30"].morning["morning-1"]
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
  tabMorning.click();

  /* إعادة تعيين اليوم */
  byId.get("reset-day").click();
  check(
    "reset asks for confirmation",
    byId.get("reset-day").textContent === "اضغط مرة أخرى للتأكيد",
    byId.get("reset-day").textContent
  );
  byId.get("reset-day").click();
  check("reset clears today", pill(0).textContent !== "تم ✓", pill(0).textContent);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

runAsyncTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
