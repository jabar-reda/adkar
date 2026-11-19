// @ts-check
// النسخ الاحتياطي: التذكير، تصدير JSON وCSV، قراءة ملف الاستيراد
// ومعاينته، ثم الدمج أو الاستبدال.

import {
  BACKUP_REMINDER_DAYS,
  DOWNLOAD_URL_TTL_MS,
  MAX_BACKUP_BYTES,
  MS_PER_DAY,
  SECTIONS,
  STATE_SCHEMA_VERSION,
} from "./constants.js";
import { announce, elements } from "./dom.js";
import { resetCalendarToCurrentMonth } from "./insights.js";
import { renderPeriod } from "./period.js";
import {
  completionSnapshot,
  countAllSections,
  mergeStats,
  sanitizeStats,
} from "./progress.js";
import {
  applySettingsToUi,
  normalizeSettings,
  replaceSettings,
  saveSettings,
  settings,
} from "./settings.js";
import {
  emptyDay,
  markLegacyMulkDays,
  pruneDays,
  sanitizeDays,
  saveState,
  setState,
  state,
  unblockStorage,
} from "./state.js";
import { formatBackupDate } from "./time.js";
import { getActivePeriod } from "./ui-state.js";
import { resetViewedDayKey } from "./view-day.js";
import { csvCell, dayKey, itemKey, toArabicNumber } from "./utils.js";

// ملف الاستيراد بانتظار اختيار «دمج» أو «استبدال».
/** @type {BackupPreview | null} */
let pendingImport = null;

/**
 * @param {string} message
 * @param {boolean} [isError]
 * @returns {void}
 */
function setBackupStatus(message, isError = false) {
  elements.backupStatus.textContent = message;
  elements.backupStatus.classList.toggle("is-error", isError);
}

/**
 * @param {number} days
 * @returns {string}
 */
function formatDayCount(days) {
  if (days <= 0) return "اليوم";
  if (days === 1) return "قبل يوم";
  if (days === 2) return "قبل يومين";
  if (days <= 10) return `قبل ${toArabicNumber(days)} أيام`;
  return `قبل ${toArabicNumber(days)} يوماً`;
}

/**
 * @param {number} value
 * @returns {string}
 */
function formatDayTotal(value) {
  if (value === 0) return "لا أيام";
  if (value === 1) return "يوم واحد";
  if (value === 2) return "يومين";
  if (value <= 10) return `${toArabicNumber(value)} أيام`;
  return `${toArabicNumber(value)} يوماً`;
}

/**
 * @param {number} addedDays
 * @returns {string}
 */
function describeMergedDays(addedDays) {
  if (addedDays === 0) return "لم تُضف أيام جديدة";
  if (addedDays === 1) return "أُضيف يوم جديد";
  if (addedDays === 2) return "أُضيف يومان جديدان";
  if (addedDays <= 10) return `أُضيفت ${toArabicNumber(addedDays)} أيام جديدة`;
  return `أُضيف ${toArabicNumber(addedDays)} يوماً جديداً`;
}

export function updateBackupReminder() {
  if (!settings.lastExportAt) {
    elements.backupReminder.textContent = "لم تصدّر نسخة احتياطية بعد.";
    elements.backupReminder.classList.remove("is-warning");
    return;
  }

  const exportedAt = Date.parse(settings.lastExportAt);
  if (Number.isNaN(exportedAt)) {
    elements.backupReminder.textContent = "لم تصدّر نسخة احتياطية بعد.";
    elements.backupReminder.classList.remove("is-warning");
    return;
  }

  const days = Math.max(0, Math.floor((Date.now() - exportedAt) / MS_PER_DAY));
  if (days >= BACKUP_REMINDER_DAYS) {
    elements.backupReminder.textContent =
      `آخر نسخة ${formatDayCount(days)} — يُنصح بتصدير نسخة جديدة.`;
    elements.backupReminder.classList.add("is-warning");
  } else {
    elements.backupReminder.textContent = `آخر نسخة: ${formatDayCount(days)}.`;
    elements.backupReminder.classList.remove("is-warning");
  }
}

// ملف النسخة يمر على نفس دوال التطهير (sanitizeDays + normalizeSettings)
// فلا يدخل التخزين منه شيء غير متوقع، ولو كان مشيناً بالكامل.
/**
 * @param {any} raw
 * @returns {BackupFileResult}
 */
function validateBackup(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "بنية الملف غير صالحة." };
  }
  const fileVersion = Number(raw.schemaVersion || raw.version || 1);
  if (fileVersion > STATE_SCHEMA_VERSION) {
    return { ok: false, reason: "هذه النسخة الاحتياطية أحدث من إصدار التطبيق الحالي." };
  }
  if (!raw.days || typeof raw.days !== "object" || Array.isArray(raw.days)) {
    return { ok: false, reason: "الملف لا يحتوي بيانات أذكار." };
  }

  const days = sanitizeDays(raw.days);
  // نسخة صادرة قبل إضافة سورة الملك: أيامها المكتملة مساءً تُعدّ قارئة لها.
  if (fileVersion < STATE_SCHEMA_VERSION) markLegacyMulkDays(days);
  const dayCount = Object.keys(days).length;

  return {
    ok: true,
    days,
    settings: normalizeSettings(raw.settings),
    stats: sanitizeStats(raw.stats),
    dayCount,
    lastDate: Object.keys(days).sort().slice(-1)[0] || null,
  };
}

// تنزيل ملف عبر رابط object-URL مؤقت: ننشئ العنصر ديناميكياً ثم
// ننظّف الرابط بعدها حتى لا يتسرب الذاكرة.
/**
 * @param {string} content
 * @param {string} filename
 * @param {string} type
 * @returns {void}
 */
function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_TTL_MS);
}

// نافذة نتيجة النسخ/الاستيراد: تعرض تأكيداً واضحاً، ونص JSON قابلاً للنسخ
// على الأجهزة التي لا يعمل فيها التنزيل المباشر (تطبيق أندرويد).
/**
 * @param {{ title: string, message: string, text?: string, editable?: boolean, download?: boolean, verify?: boolean }} options
 * @returns {void}
 */
function openBackupDialog(options) {
  const text = options.text || "";
  elements.backupDialogTitle.textContent = options.title;
  elements.backupDialogMessage.textContent = options.message;
  elements.backupDialogText.value = text;
  elements.backupDialogText.readOnly = !options.editable;
  elements.backupDialogText.hidden = !text && !options.editable;
  elements.backupCopy.hidden = !text || Boolean(options.editable);
  elements.backupDownload.hidden = !options.download;
  elements.backupVerify.hidden = !options.verify;
  elements.backupCopy.textContent = "نسخ النص";
  document.body.classList.add("is-dialog-open");

  if (typeof elements.backupDialog.showModal === "function") {
    elements.backupDialog.showModal();
  } else {
    elements.backupDialog.setAttribute("open", "");
  }
}

function handleBackupDialogClosed() {
  document.body.classList.remove("is-dialog-open");
}

export function closeBackupDialog() {
  const dialog = elements.backupDialog;
  if (!dialog) return;
  if (typeof dialog.close === "function") {
    dialog.close();
    return;
  }
  dialog.removeAttribute("open");
  handleBackupDialogClosed();
}

// النسخ إلى الحافظة قد يكون ممنوعاً في بعض السياقات؛ عندها نحدد النص
// ليتمكن المستخدم من نسخه بنفسه.
function selectBackupText() {
  elements.backupDialogText.focus();
  if (typeof elements.backupDialogText.select === "function") {
    elements.backupDialogText.select();
  }
}

async function copyBackupText() {
  const text = elements.backupDialogText.value;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      elements.backupCopy.textContent = "تم النسخ ✓";
      return;
    }
    // بديل WebView: تحديد النص ثم أمر النسخ؛ إن رفض المتصفح نطلب النسخ اليدوي.
    selectBackupText();
    const copied = document.execCommand("copy");
    elements.backupCopy.textContent = copied ? "تم النسخ ✓" : "حدّد النص وانسخه";
  } catch (error) {
    selectBackupText();
    elements.backupCopy.textContent = "حدّد النص وانسخه";
  }
}

export function exportBackup() {
  settings.lastExportAt = new Date().toISOString();
  saveSettings();
  updateBackupReminder();

  const payload = {
    app: "adkar",
    version: STATE_SCHEMA_VERSION,
    schemaVersion: STATE_SCHEMA_VERSION,
    exportedAt: settings.lastExportAt,
    days: state.days,
    stats: sanitizeStats(state.stats),
    settings: { ...settings },
  };

  const json = JSON.stringify(payload, null, 2);
  // داخل تطبيق أندرويد لا يعمل رابط التنزيل في WebView؛ نعرض النص للنسخ.
  const canDownload = !(typeof ADKAR_STORAGE !== "undefined" && ADKAR_STORAGE.isNative);
  if (canDownload) {
    downloadFile(json, `adkar-${dayKey()}.json`, "application/json");
  }

  const dayCount = Object.keys(state.days).length;
  const status = dayCount === 0
    ? "تم تصدير نسخة فارغة."
    : `تم تصدير نسخة تحتوي ${formatDayTotal(dayCount)}.`;
  setBackupStatus(status);

  openBackupDialog({
    title: "تم تصدير النسخة",
    message: canDownload
      ? `${status} احفظ الملف في مكان آمن.`
      : `${status} التنزيل المباشر غير متاح داخل التطبيق؛ استخدم «نسخ النص» واحفظه في ملف.`,
    text: json,
    download: canDownload,
  });
}

export function exportCsv() {
  const dateKeys = Object.keys(state.days).sort();
  if (dateKeys.length === 0) {
    setBackupStatus("لا توجد بيانات لتصديرها بعد.", true);
    return;
  }

  const rows = [
    [
      "التاريخ",
      "اكتمل الصباح",
      "أذكار الصباح المكتملة",
      "أذكار الاستيقاظ المكتملة",
      "اكتمل المساء",
      "أذكار المساء المكتملة",
      "أذكار النوم المكتملة",
      "اكتمل اليوم",
    ],
  ];

  dateKeys.forEach((dateKey) => {
    const counts = countAllSections(state, dateKey);
    const completed = completionSnapshot(state, dateKey);
    rows.push([
      dateKey,
      completed.morning ? "نعم" : "لا",
      `${counts.morning}/${SECTIONS.morning.items.length}`,
      `${counts.wake}/${SECTIONS.wake.items.length}`,
      completed.evening ? "نعم" : "لا",
      `${counts.evening}/${SECTIONS.evening.items.length}`,
      `${counts.sleep}/${SECTIONS.sleep.items.length}`,
      completed.morning && completed.evening ? "نعم" : "لا",
    ]);
  });

  // BOM في بداية الملف يجعل Excel يقرأه UTF-8 فتظهر العربية سليمة.
  const csv =
    "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";

  // داخل تطبيق أندرويد لا يعمل تنزيل blob؛ نعرض النص للنسخ كحال نسخة JSON.
  const canDownload = !(typeof ADKAR_STORAGE !== "undefined" && ADKAR_STORAGE.isNative);
  if (!canDownload) {
    setBackupStatus(`تم تجهيز ${formatDayTotal(dateKeys.length)} بتنسيق CSV.`);
    openBackupDialog({
      title: "تم تصدير CSV",
      message:
        "التنزيل المباشر غير متاح داخل التطبيق؛ استخدم «نسخ النص» واحفظه في ملف بامتداد .csv.",
      text: csv,
    });
    return;
  }

  downloadFile(csv, `adkar-${dayKey()}.csv`, "text/csv;charset=utf-8");
  setBackupStatus(`تم تصدير ${formatDayTotal(dateKeys.length)} إلى CSV.`);
}

/**
 * @param {string} message
 * @returns {void}
 */
function failImport(message) {
  pendingImport = null;
  elements.importConfirm.hidden = true;
  elements.importFile.value = "";
  setBackupStatus(message, true);
}

// مسار مشترك بين اختيار ملف ولصق نص: كلاهما يمر بنفس التحقق ثم المعاينة.
/**
 * @param {string} text
 * @returns {void}
 */
export function handleImportText(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    failImport("الملف ليس ملف JSON صالحاً.");
    return;
  }

  const result = validateBackup(parsed);
  if (result.ok === false) {
    failImport(result.reason);
    return;
  }

  pendingImport = result;
  elements.importSummary.textContent = result.dayCount === 0
    ? "الملف لا يحتوي أيام مسجلة. «دمج» لن يغيّر شيئاً، و«استبدال» سيمسح كل تقدمك الحالي."
    : `الملف يحتوي ${formatDayTotal(result.dayCount)}، آخرها ${formatBackupDate(
        result.lastDate
      )}. «دمج» يحتفظ بالعدد الأكبر لكل ذكر ويبقي إعداداتك، و«استبدال» يمسح كل ما لديك.`;
  elements.importConfirm.hidden = false;
  elements.importFile.value = "";
  setBackupStatus("");
  if (typeof elements.importConfirm.scrollIntoView === "function") {
    elements.importConfirm.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

// قراءة نص الملف: File.text حديثة ولا توجد في WebView قديم داخل أندرويد،
// فنعود إلى FileReader المتوفر في كل الإصدارات.
/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsText(file);
  });
}

/**
 * @param {File | undefined} file
 * @returns {void}
 */
export function handleImportFile(file) {
  if (!file) return;

  if (file.size > MAX_BACKUP_BYTES) {
    elements.importFile.value = "";
    setBackupStatus("الملف كبير جداً (الحد ٢ ميجابايت).", true);
    return;
  }

  readFileText(file)
    .then(handleImportText)
    .catch(() => failImport("تعذّر قراءة الملف."));
}

// بديل اختيار الملف على أندرويد: لصق نص النسخة مباشرة في نافذة.
export function openImportPasteDialog() {
  openBackupDialog({
    title: "استيراد نسخة",
    message: "الصق محتوى ملف النسخة (JSON) كاملاً، ثم اضغط «فحص النسخة».",
    editable: true,
    verify: true,
  });
}

// قاعدة الدمج لذكر واحد: لا ينخفض أي عدد أبداً — نأخذ الأكبر بين
// الحالي والمستورد؛ والأذكار بلا عدد تكتمل إذا اكتملت في أي جهة.
/**
 * @param {DhikrItem} item
 * @param {DayEntry} [currentEntry]
 * @param {DayEntry} [importedEntry]
 * @returns {DayEntry | null}
 */
function mergeItemEntry(item, currentEntry, importedEntry) {
  if (!currentEntry && !importedEntry) return null;

  if (item.count === 0) {
    return {
      count: 0,
      done: Boolean(
        (currentEntry && currentEntry.done) || (importedEntry && importedEntry.done)
      ),
    };
  }

  const currentCount = currentEntry ? currentEntry.count : 0;
  const importedCount = importedEntry ? importedEntry.count : 0;
  const count = Math.min(item.count, Math.max(currentCount, importedCount));
  return { count, done: count >= item.count };
}

/**
 * @param {DayRecord} currentDay
 * @param {DayRecord} importedDay
 * @returns {DayRecord}
 */
function mergeDayRecords(currentDay, importedDay) {
  const merged = emptyDay();

  Object.keys(SECTIONS).forEach((period) => {
    const currentRecord = currentDay[period] || {};
    const importedRecord = importedDay[period] || {};

    SECTIONS[period].items.forEach((item) => {
      const entryKey = itemKey(period, item);
      const entry = mergeItemEntry(item, currentRecord[entryKey], importedRecord[entryKey]);
      if (entry) merged[period][entryKey] = entry;
    });
  });

  return merged;
}

/**
 * @param {Record<string, DayRecord>} currentDays
 * @param {Record<string, DayRecord>} importedDays
 * @returns {Record<string, DayRecord>}
 */
function mergeDays(currentDays, importedDays) {
  const merged = { ...currentDays };

  Object.keys(importedDays).forEach((dateKey) => {
    merged[dateKey] = currentDays[dateKey]
      ? mergeDayRecords(currentDays[dateKey], importedDays[dateKey])
      : importedDays[dateKey];
  });

  return merged;
}

function finishImport() {
  pendingImport = null;
  elements.importConfirm.hidden = true;
  elements.importFile.value = "";
  resetViewedDayKey();
  resetCalendarToCurrentMonth();
  renderPeriod(getActivePeriod());
  updateBackupReminder();
}

// إلغاء المعاينة من زر «إلغاء» دون لمس التقدم أو الإعدادات.
export function cancelImport() {
  pendingImport = null;
  elements.importConfirm.hidden = true;
  elements.importFile.value = "";
  setBackupStatus("");
}

export function applyImport() {
  if (!pendingImport) return;

  const imported = pendingImport;
  // الاستيراد الصريح من المستخدم هو مسار الاسترداد عند فساد التخزين.
  unblockStorage();
  setState({ schemaVersion: STATE_SCHEMA_VERSION, days: imported.days, stats: imported.stats });
  pruneDays();
  saveState();

  if (imported.settings) {
    const importedSettings = { ...imported.settings };
    // تاريخ التصدير يخص هذا الجهاز: لا نمسح تذكيره إن كان الملف لا يحمل تاريخاً.
    if (!importedSettings.lastExportAt) delete importedSettings.lastExportAt;
    replaceSettings({ ...settings, ...importedSettings });
    saveSettings();
    applySettingsToUi();
  }

  finishImport();
  const status = imported.dayCount === 0
    ? "تم استبدال التقدم بنسخة لا تحتوي أياماً."
    : `تم استيراد ${formatDayTotal(imported.dayCount)}.`;
  setBackupStatus(status);
  announce("تم استيراد النسخة الاحتياطية");
  openBackupDialog({ title: "تم استيراد النسخة", message: status });
}

export function applyMerge() {
  if (!pendingImport) return;

  const imported = pendingImport;
  const addedDays = Object.keys(imported.days).filter((dateKey) => !state.days[dateKey]).length;

  // الدمج الصريح يسمح بالاسترداد من نسخة سليمة إذا كان التخزين السابق تالفاً.
  unblockStorage();
  setState({
    schemaVersion: STATE_SCHEMA_VERSION,
    days: mergeDays(state.days, imported.days),
    stats: mergeStats(state.stats, imported.stats),
  });
  pruneDays();
  saveState();

  finishImport();
  const status = imported.dayCount === 0
    ? "تم دمج النسخة، ولم تحتوِ أياماً فلم يُضف شيء."
    : `تم دمج ${formatDayTotal(imported.dayCount)} من الملف، ${describeMergedDays(addedDays)}.`;
  setBackupStatus(status);
  announce("تم دمج النسخة الاحتياطية");
  openBackupDialog({ title: "تم دمج النسخة", message: status });
}

/* أزرار نافذة النسخة: الإغلاق، نسخ النص، تنزيله، وفحص النص الملصوق. */
elements.backupClose.addEventListener("click", closeBackupDialog);
elements.backupCopy.addEventListener("click", copyBackupText);
elements.backupDownload.addEventListener("click", () => {
  downloadFile(elements.backupDialogText.value, `adkar-${dayKey()}.json`, "application/json");
});
elements.backupVerify.addEventListener("click", () => {
  const text = elements.backupDialogText.value;
  closeBackupDialog();
  handleImportText(text);
});
elements.backupDialog.addEventListener("click", (event) => {
  if (event.target === elements.backupDialog) closeBackupDialog();
});
elements.backupDialog.addEventListener("close", handleBackupDialogClosed);
