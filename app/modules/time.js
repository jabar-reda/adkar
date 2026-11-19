// @ts-check
// التاريخ والوقت: منسّقات Intl، اختيار القسم حسب الساعة، والوقت المتبقي.

import { PERIOD_WINDOWS } from "./constants.js";
import { elements } from "./dom.js";
import { isViewingToday } from "./view-day.js";
import { formatDuration } from "./utils.js";
import { getActivePeriod } from "./ui-state.js";

// إنشاء Intl.DateTimeFormat مكلف، لذا ننشئ كل منسّق مرة واحدة بدل مرة لكل خلية تقويم.
/**
 * @param {string} locale
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {Intl.DateTimeFormat | null}
 */
function createDateFormatter(locale, options) {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch (error) {
    return null;
  }
}

const formatters = {
  gregorian: createDateFormatter("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
  hijri: createDateFormatter("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
  weekday: createDateFormatter("ar", { weekday: "long" }),
  month: createDateFormatter("ar", { month: "long", year: "numeric" }),
  backupDate: createDateFormatter("ar", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }),
};

/**
 * @param {Date} date
 * @returns {string}
 */
function formatGregorian(date) {
  return formatters.gregorian ? formatters.gregorian.format(date) : date.toLocaleDateString();
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatHijri(date) {
  // نضيف «هـ» يدوياً لأن التنسيق الهجري يعطي السنة رقمها فقط.
  return formatters.hijri ? `${formatters.hijri.format(date)}هـ` : "";
}

export function updateDates() {
  const now = new Date();
  elements.gregDate.textContent = formatGregorian(now);
  elements.hijriDate.textContent = formatHijri(now);
}

// يقسم اليوم إلى صباح/مساء بحسب الساعة الحالية، وهو أساس الثيم "time"
// واختيار القسم المبدئي عند فتح الصفحة.
export function detectPeriod() {
  const hour = new Date().getHours();
  const range = PERIOD_WINDOWS.morning;
  return hour >= range.start && hour < range.end ? "morning" : "evening";
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function formatWeekday(date) {
  return formatters.weekday ? formatters.weekday.format(date) : "";
}

/**
 * @param {Date} date
 * @returns {string}
 */
export function formatMonthLabel(date) {
  return formatters.month
    ? formatters.month.format(date)
    : `${date.getMonth() + 1}/${date.getFullYear()}`;
}

/**
 * @param {string} dateKey
 * @returns {string}
 */
export function formatBackupDate(dateKey) {
  if (!formatters.backupDate) return dateKey;
  const [year, month, day] = dateKey.split("-").map(Number);
  return formatters.backupDate.format(new Date(year, month - 1, day));
}

/**
 * @param {string} period
 * @param {Date} now
 * @returns {string}
 */
function describePeriodTime(period, now) {
  // نافذة المساء تعبر منتصف الليل (15:00 -> 04:00)، فنميّز الحالة
  // المغلِفة: داخل النافذة قبل أو بعد منتصف الليل، ونحسب النهاية
  // في اليوم التالي إن لزم، وإلا نعلن موعد البداية القادمة.
  const range = PERIOD_WINDOWS[period];
  const hour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const wraps = range.end <= range.start;
  const inside = wraps
    ? hour >= range.start || hour < range.end
    : hour >= range.start && hour < range.end;

  if (inside) {
    const end = new Date(now);
    if (wraps && hour >= range.start) end.setDate(end.getDate() + 1);
    end.setHours(range.end, 0, 0, 0);
    return `المتبقي: ${formatDuration(end.getTime() - now.getTime())}`;
  }

  if (period === "morning" && hour >= range.end) {
    return "انتهى الوقت المفضل لأذكار الصباح، ويمكنك الإتيان بها";
  }

  const start = new Date(now);
  start.setHours(range.start, 0, 0, 0);
  if (start <= now) start.setDate(start.getDate() + 1);

  const name = period === "morning" ? "أذكار الصباح" : "أذكار المساء";
  return `يبدأ وقت ${name} بعد ${formatDuration(start.getTime() - now.getTime())}`;
}

export function updateTimeLeft() {
  // عدّاد الوقت يخص اليوم الحالي؛ عرض يوم سابق لا معنى له معه.
  if (!isViewingToday()) {
    elements.timeLeft.textContent = "";
    return;
  }
  elements.timeLeft.textContent = describePeriodTime(getActivePeriod(), new Date());
}
