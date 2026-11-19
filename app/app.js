// @ts-check
/* ==========================================================================
   نقطة دخول التطبيق (ES module): تجمع وحدات app/modules/ وتربط أحداث
   الصفحة وتبدأ التشغيل. منطق كل ميزة في وحدته: الثوابت، الأدوات، DOM،
   الحالة والتخزين، التقدم، الإعدادات، الوقت، البطاقات، عرض القسم،
   الإحصاءات، العدّاد، التراجع، والنسخ الاحتياطي.
   التحميل عبر <script type="module">، وملفات config/storage/data تبقى
   سكربتات كلاسيكية تعرّف قيمها على window قبل تنفيذ هذه الوحدة.
   ========================================================================== */

import {
  CLOCK_INTERVAL_MS,
  CONFIRM_WINDOW_MS,
  DAY_CHECK_INTERVAL_MS,
  HIGHLIGHT_MS,
  SECTIONS,
  SETTINGS_KEY,
  STORAGE_KEY,
  SWIPE_AXIS_RATIO,
  SWIPE_EDGE_MARGIN_PX,
  SWIPE_MAX_DURATION_MS,
  SWIPE_MIN_DISTANCE_PX,
} from "./modules/constants.js";
import {
  applyImport,
  applyMerge,
  cancelImport,
  exportBackup,
  exportCsv,
  handleImportFile,
  openImportPasteDialog,
  updateBackupReminder,
} from "./modules/backup.js";
import { renderColophon } from "./modules/about.js";
import { announce, elements } from "./modules/dom.js";
import {
  getCalendarMonth,
  renderCalendar,
  resetCalendarToCurrentMonth,
  setCalendarMonth,
  setDaySelectedHandler,
  setSelectedCalendarKey,
} from "./modules/insights.js";
import { renderPeriod, updateProgress } from "./modules/period.js";
import { isItemComplete } from "./modules/progress.js";
import {
  applyFontSize,
  applySettingsToUi,
  applyTheme,
  refreshClockTheme,
  reloadSettings,
  saveSettings,
  settings,
  syncSettingsUI,
} from "./modules/settings.js";
import {
  getDay,
  getLastPersistedState,
  isStorageBlocked,
  loadState,
  mergeConcurrentState,
  parseStateSnapshot,
  reportStorageState,
  saveState,
  setLastPersistedState,
  setState,
  state,
  unblockStorage,
} from "./modules/state.js";
import {
  detectPeriod,
  updateDates,
  updateTimeLeft,
} from "./modules/time.js";
import { getLastAction, hideUndo } from "./modules/undo.js";
import { getActivePeriod, itemControllers } from "./modules/ui-state.js";
import {
  getViewedDayKey,
  isViewingToday,
  resetViewedDayKey,
  setViewedDayKey,
} from "./modules/view-day.js";
import {
  addMonths,
  dayKey,
  itemKey,
  startOfMonth,
} from "./modules/utils.js";

let renderedDay = dayKey();
let highlightTimer = null;
let resetTimer = null;
let touchStart = null;

/* ===== الانتقال إلى أول ذكر غير مكتمل ===== */
// التمرير السلس إلى أول ذكر ناقص مع إبرازه وإعطاء زر تسجيله
// التركيز؛ من طلب تقليل الحركة يُمرَّر فوراً بلا سلاسة.
function goToNextIncomplete() {
  const period = getActivePeriod();
  const section = SECTIONS[period];
  const record = getDay(getViewedDayKey())[period];
  const index = section.items.findIndex(
    (item) => !isItemComplete(item, record[itemKey(period, item)])
  );
  if (index === -1) return;

  const controller = itemControllers.get(itemKey(period, section.items[index]));
  if (!controller) return;

  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  controller.element.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
  });
  controller.element.classList.add("is-highlighted");
  controller.focusPill();

  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    controller.element.classList.remove("is-highlighted");
  }, HIGHLIGHT_MS);
}

/* ===== التراجع عن آخر إجراء ===== */
// الشريط نفسه في وحدة التراجع؛ هنا نطبّق النسخة «قبل» على الذكر.
function performUndo() {
  const action = getLastAction();
  if (!action) return;

  const controller = itemControllers.get(action.entryKey);
  hideUndo();
  if (!controller) return;

  controller.applyProgress(action.before);
  updateProgress();
  announce(`تم التراجع عن: ${action.title}`);
}

/* ===== التبويبات ===== */
elements.tablist.addEventListener("click", (event) => {
  const tab = /** @type {HTMLElement | null} */ (
    /** @type {Element} */ (event.target).closest(".tab")
  );
  if (!tab) return;
  renderPeriod(tab.dataset.period);
});

// التنقل بلوحة المفاتيح على نمط WAI-ARIA: الأسهم والمنزل والنهاية
// في اتجاه RTL — ArrowLeft يتقدم لأن الصفحة من اليمين إلى اليسار.
elements.tablist.addEventListener("keydown", (event) => {
  const order = ["morning", "evening"];
  const activePeriod = getActivePeriod();
  const current = order.indexOf(activePeriod);
  let next = current;

  if (event.key === "ArrowLeft") next = (current + 1) % order.length;
  else if (event.key === "ArrowRight") next = (current - 1 + order.length) % order.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = order.length - 1;
  else return;

  event.preventDefault();
  renderPeriod(order[next]);
  const nextTab = elements.tabs.find((tab) => tab.dataset.period === order[next]);
  if (nextTab) nextTab.focus();
});

/* ===== الإعدادات والنسخ الاحتياطي والانتقال والتراجع ===== */
elements.fontButtons.forEach((button) => {
  button.addEventListener("click", () => {
    settings.fontSize = button.dataset.fontSize;
    saveSettings();
    applyFontSize();
    syncSettingsUI();
    announce("تم تغيير حجم نص الأذكار");
  });
});

elements.themeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    settings.theme = button.dataset.theme;
    saveSettings();
    applyTheme();
    syncSettingsUI();
    announce("تم تغيير الألوان");
  });
});

elements.nextButton.addEventListener("click", goToNextIncomplete);
elements.undoButton.addEventListener("click", performUndo);

elements.exportButton.addEventListener("click", exportBackup);
elements.exportCsvButton.addEventListener("click", exportCsv);
elements.importButton.addEventListener("click", () => elements.importFile.click());
elements.importFile.addEventListener("change", () => {
  const file = elements.importFile.files && elements.importFile.files[0];
  handleImportFile(file);
});
elements.importApply.addEventListener("click", applyImport);
elements.importMerge.addEventListener("click", applyMerge);
elements.importCancel.addEventListener("click", cancelImport);
elements.importPaste.addEventListener("click", openImportPasteDialog);

/* ===== عرض يوم مختار من التقويم ===== */
// النقر على يوم يعيد بناء الأذكار لذلك اليوم (قراءة وتعديلاً)، ثم يصعد
// إلى أعلى الصفحة ليرى المستخدم القائمة الجديدة؛ ومن زر «عرض اليوم»
// يعود إلى اليوم الحالي وشهره.
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function revealPeriodTop() {
  if (!elements.title || typeof elements.title.scrollIntoView !== "function") return;
  elements.title.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });
}

setDaySelectedHandler((dateKey) => {
  setViewedDayKey(dateKey);
  renderPeriod(getActivePeriod());
  revealPeriodTop();
});

elements.viewingToday.addEventListener("click", () => {
  setViewedDayKey(dayKey());
  resetCalendarToCurrentMonth();
  renderPeriod(getActivePeriod());
  revealPeriodTop();
});

elements.calendarPrev.addEventListener("click", () => {
  const calendarMonth = startOfMonth(addMonths(getCalendarMonth(), -1));
  setCalendarMonth(calendarMonth);
  setSelectedCalendarKey(dayKey(calendarMonth));
  renderCalendar();
});

elements.calendarNext.addEventListener("click", () => {
  const calendarMonth = startOfMonth(addMonths(getCalendarMonth(), 1));
  setCalendarMonth(calendarMonth);
  setSelectedCalendarKey(dayKey(calendarMonth));
  renderCalendar();
});

/* ===== السحب الأفقي بين القسمين ===== */
// نتابع اللمس على الصفحة نفسها فقط: لا أزرار ولا حقول ولا التذييل.
// عند الإفلات نقبل السحبة إن كانت أفقية بوضوح (طول ≥ 60 بكسل،
// أفقي أكبر من عمودي 1.5 مرة)، وبدأت بعيداً عن حواف الشاشة،
// وليس أثناء تحديد نص — ثم نبدّل القسم حسب اتجاه السحب.
elements.page.addEventListener(
  "touchstart",
  (event) => {
    if (event.touches.length !== 1) return;

    const target = /** @type {Element | null} */ (event.target);
    if (!target || typeof target.closest !== "function") return;
    if (target.closest("button, a, input, select, textarea, label")) return;
    if (target.closest(".site-footer")) return;

    touchStart = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
      time: Date.now(),
    };
  },
  { passive: true }
);

elements.page.addEventListener(
  "touchend",
  (event) => {
    if (!touchStart) return;
    const start = touchStart;
    touchStart = null;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;
    const selection = window.getSelection ? String(window.getSelection()) : "";

    if (elapsed > SWIPE_MAX_DURATION_MS) return;
    if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
    if (start.x < SWIPE_EDGE_MARGIN_PX || start.x > window.innerWidth - SWIPE_EDGE_MARGIN_PX) return;
    if (selection.length > 0) return;

    const nextPeriod = dx < 0 ? "evening" : "morning";
    if (nextPeriod !== getActivePeriod()) renderPeriod(nextPeriod);
  },
  { passive: true }
);

elements.page.addEventListener(
  "touchcancel",
  () => {
    touchStart = null;
  },
  { passive: true }
);

/* ===== إعادة تعيين اليوم (بخطوتين) ===== */
// نفس نمط تأكيد العدّاد: أول ضغطة تفعّل التأكيد أربع ثوانٍ،
// والثانية خلالها تمسح تقدم اليوم بالكامل.
function cancelReset() {
  clearTimeout(resetTimer);
  resetTimer = null;
  elements.reset.classList.remove("is-confirming");
  elements.reset.textContent = isViewingToday()
    ? "إعادة تعيين اليوم"
    : "إعادة تعيين هذا اليوم";
}

elements.reset.addEventListener("click", () => {
  if (!elements.reset.classList.contains("is-confirming")) {
    elements.reset.classList.add("is-confirming");
    elements.reset.textContent = "اضغط مرة أخرى للتأكيد";
    resetTimer = setTimeout(cancelReset, CONFIRM_WINDOW_MS);
    return;
  }

  cancelReset();
  const dateKey = getViewedDayKey();
  delete state.days[dateKey];
  saveState();
  setSelectedCalendarKey(dateKey);
  renderPeriod(getActivePeriod());
  announce(isViewingToday() ? "أُعيد تعيين تقدم اليوم" : "أُعيد تعيين تقدم اليوم المختار");
});

/* ===== تغيّر اليوم أثناء بقاء الصفحة مفتوحة ===== */
// إذا مرّ منتصف الليل والصفحة ما زالت مفتوحة نعيد رسم اليوم
// الجديد: التاريخ، التقويم، وقوائم الأذكار تُفرغ من تلقاء نفسها.
function checkDayChange() {
  if (renderedDay === dayKey()) return;
  renderedDay = dayKey();
  resetViewedDayKey();
  resetCalendarToCurrentMonth();
  updateDates();
  renderPeriod(getActivePeriod());
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  checkDayChange();
  updateTimeLeft();
  refreshClockTheme();
  updateBackupReminder();
});

// فحص خفيف دوري: تغيّر اليوم كل دقيقة، والوقت المتبقي والثيم
// المعتمد على الساعة كل 30 ثانية.
setInterval(checkDayChange, DAY_CHECK_INTERVAL_MS);
setInterval(() => {
  updateTimeLeft();
  refreshClockTheme();
}, CLOCK_INTERVAL_MS);

/* ===== المزامنة بين التبويبات ===== */
// حدث storage يصل إلى كل التبويبات عدا الذي كتب؛ نعيد القراءة
// من الصفر بدل محاولة الدمج، فالمصدر الأحدث هو التخزين نفسه.
async function reloadStateFromStorage(nextState) {
  if (nextState) setState(nextState);
  else {
    unblockStorage();
    setState(await loadState());
  }
  if (isStorageBlocked()) reportStorageState(false);
  renderedDay = dayKey();
  resetViewedDayKey();
  resetCalendarToCurrentMonth();
  updateDates();
  renderPeriod(getActivePeriod());
  updateBackupReminder();
}

window.addEventListener("storage", async (event) => {
  // مسح التخزين من تبويب آخر يصل بحدث مفتاحه null.
  if (event.key === null) {
    reloadSettings();
    applySettingsToUi();
    reloadStateFromStorage();
    announce("تم تحديث البيانات من تبويب آخر");
    return;
  }

  if (event.key === STORAGE_KEY) {
    const baseState = getLastPersistedState() || parseStateSnapshot(event.oldValue);
    unblockStorage();
    const remoteState = await loadState();
    if (isStorageBlocked()) {
      reportStorageState(false);
      reloadStateFromStorage(state);
      announce("تعذّرت مزامنة البيانات لأن التخزين الخارجي تالف");
      return;
    }
    const mergedState = mergeConcurrentState(baseState, state, remoteState);
    setState(mergedState);
    setLastPersistedState(remoteState);
    // saveState يعيد قراءة الحالة داخل القفل قبل الكتابة، فلا يعتمد على oldValue وحده.
    if (JSON.stringify(mergedState) !== JSON.stringify(remoteState)) saveState();
    reloadStateFromStorage(mergedState);
    announce("تمت مزامنة التقدم من تبويب آخر");
    return;
  }

  if (event.key === SETTINGS_KEY) {
    reloadSettings();
    applySettingsToUi();
    updateBackupReminder();
  }
});

/* ===== بدء التشغيل ===== */
// بترتيب معتمد: قراءة الحالة، ثم مزامنة أزرار الإعدادات مع ما قرأنا،
// فحجم الخط، فالتاريخ، فتذكير النسخة، ثم رسم القسم الذي يناسب الساعة الآن.
setState(await loadState());
// قاعدة الدمج بين التبويبات تبدأ من النسخة المقروءة نفسها، لا من حالة فارغة.
setLastPersistedState(state);
renderedDay = dayKey();
if (isStorageBlocked()) reportStorageState(false);
syncSettingsUI();
applyFontSize();
renderColophon();
updateDates();
updateBackupReminder();
if (typeof navigator !== "undefined" && navigator.storage && typeof navigator.storage.persist === "function") {
  navigator.storage.persist().catch(() => { /* تجاهل: غير مدعوم أو مرفوض */ });
}
renderPeriod(detectPeriod());
