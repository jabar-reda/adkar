// @ts-check
// أدوات نقية: تحويل الأرقام، مفاتيح الأيام والأذكار، عمليات التواريخ،
// وتنسيقات نصية قصيرة. لا تلمس DOM ولا تقرأ الحالة المحفوظة.

import { ARABIC_DIGITS, MS_PER_DAY } from "./constants.js";

// تحويل الأرقام اللاتينية إلى مشرقية حتى يظهر كل العدّ بالعربية.
export const toArabicNumber = (value) =>
  String(value).replace(/\d/g, (digit) => ARABIC_DIGITS[Number(digit)]);

const pad2 = (value) => String(value).padStart(2, "0");

// مفتاح اليوم بصيغة YYYY-MM-DD بتوقيت الجهاز المحلي، وهو شكل مفاتيح التخزين.
export const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

// الهوية الصريحة لا تعتمد على العنوان أو موضع الذكر؛ غيّرها فقط عند إضافة ذكر جديد.
const stableItemId = (item) => item.id;
export const itemKey = (period, item) => period + "-" + stableItemId(item);

// مفاتيح الإصدارات السابقة تُقرأ مرة واحدة ثم تُحفظ بالهوية الصريحة.
export function previousTitleKey(period, item) {
  const source = String(item.title || "untitled").normalize("NFKC").trim();
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return period + "-" + (hash >>> 0).toString(36);
}

export const legacyItemKey = (period, index) => period + "-" + index;

/**
 * نسخة عميقة من قيم قابلة للتسلسل في JSON (حالة التقدم ولقطاتها)،
 * حتى لا تتشارك التعديلات اللاحقة كائنات مع النسخة المحفوظة.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export const deepCopy = (value) => JSON.parse(JSON.stringify(value));

export const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

// إضافة أشهر عبر اليوم 1 حتى لا تنزلق القيمة عند أشهر 30/31 يوماً.
export const addMonths = (date, amount) =>
  new Date(date.getFullYear(), date.getMonth() + amount, 1);

export const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

/**
 * يحوّل مفتاح يوم (YYYY-MM-DD) إلى تاريخ محلي (الأشهر صفرية الأساس في Date).
 * @param {string} dateKey
 * @returns {Date}
 */
export const parseDateKey = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const dayDifference = (fromKey, toKey) => {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
};

// التحقق من أن التاريخ حقيقي فعلاً: "2026-02-30" يطابق النمط لكن
// Date يلفه إلى مارس، فنقارن المكونات بعد الإنشاء لتكتشف هذا.
/**
 * @param {string} dateKey
 * @returns {boolean}
 */
export function isRealDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

// صياغة عربية سليمة للعدد: واحد/اثنان/٣-١٠ جمع/أكثر من عشرة مفرد.
function formatUnit(value, one, two, many) {
  if (value === 1) return one;
  if (value === 2) return two;
  if (value >= 3 && value <= 10) return `${toArabicNumber(value)} ${many}`;
  return `${toArabicNumber(value)} ${one}`;
}

/**
 * @param {number} milliseconds
 * @returns {string}
 */
export function formatDuration(milliseconds) {
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (hours > 0) parts.push(formatUnit(hours, "ساعة", "ساعتان", "ساعات"));
  if (minutes > 0) parts.push(formatUnit(minutes, "دقيقة", "دقيقتان", "دقائق"));

  return parts.join(" و");
}

// حماية خلية CSV: من يضمّن فاصلة أو اقتباساً أو سطراً جديداً يُغلف
// بعلامات تنصيص مع مضاعفة كل اقتباس داخلي. والقيمة التي تبدأ بـ = + - @
// نسبقها بعلامة تنصيص مفردة كي لا يفسرها جدول البيانات كصيغة تنفَّذ.
export function csvCell(value) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
