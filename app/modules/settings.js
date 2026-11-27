// @ts-check
// إعدادات المستخدم (حجم الخط والثيم وتاريخ آخر تصدير): القراءة، الحفظ،
// وتطبيق القيم على الصفحة. الإعدادات تبقى في localStorage على المنصتين
// لأن theme-init.js يحتاج قراءة متزامنة قبل أول رسم.

import { DEFAULT_SETTINGS, FONT_SIZES, SETTINGS_KEY, THEMES } from "./constants.js";
import { elements } from "./dom.js";
import { detectPeriod } from "./time.js";
import { getActivePeriod } from "./ui-state.js";

/** @type {Settings} */
export let settings = loadSettings();

// يبني إعدادات سليمة من أي مصدر (تخزين أو ملف استيراد): القيم غير
// المعروفة تعود إلى الافتراضي بدل أن تبقى ولا معنى لها.
/**
 * @param {any} raw
 * @returns {Settings | null}
 */
export function normalizeSettings(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lastExportAt =
    typeof raw.lastExportAt === "string" && !Number.isNaN(Date.parse(raw.lastExportAt))
      ? raw.lastExportAt
      : null;
  return {
    fontSize: FONT_SIZES.includes(raw.fontSize) ? raw.fontSize : DEFAULT_SETTINGS.fontSize,
    theme: THEMES.includes(raw.theme) ? raw.theme : DEFAULT_SETTINGS.theme,
    lastExportAt,
  };
}

/** @returns {Settings} */
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw)) || { ...DEFAULT_SETTINGS };
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

/** @returns {void} */
export function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    // التخزين قد يكون معطلاً — تبقى الإعدادات سارية في الذاكرة.
  }
}

// تُستدعى عند تغيّر الإعدادات من تبويب آخر.
export function reloadSettings() {
  settings = loadSettings();
}

/**
 * استبدال كامل (استيراد نسخة) مع الحفاظ على مرجع القراءة المعيشي.
 * @param {Settings} next
 * @returns {void}
 */
export function replaceSettings(next) {
  settings = next;
}

export function applyFontSize() {
  document.documentElement.dataset.fontSize = settings.fontSize;
}

let lastVisualPeriod = null;
// يترجم الثيم المختار إلى لون فعلي: ثيم يدوي يلتزم قيمته، و"time"
// يتبع الساعة، و"auto" يتبع القسم المعروض حالياً. قيمة lastVisualPeriod
// تمنع لمس DOM في كل استدعاء إذا لم يتغير اللون.
const THEME_COLORS = {
  morning: "#0d6a4d",
  evening: "#0f1523",
};

export function applyTheme() {
  let visualPeriod;
  if (settings.theme === "morning" || settings.theme === "evening") visualPeriod = settings.theme;
  else if (settings.theme === "time") visualPeriod = detectPeriod();
  else visualPeriod = getActivePeriod();
  if (visualPeriod === lastVisualPeriod) return;
  lastVisualPeriod = visualPeriod;
  document.documentElement.dataset.period = visualPeriod;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", THEME_COLORS[visualPeriod] || THEME_COLORS.morning);
}

export function refreshClockTheme() {
  if (settings.theme === "time") applyTheme();
}

// تطبيق الإعدادات المحفوظة على الصفحة: حجم الخط، واللون، وحالة أزرار الإعدادات.
// كل مسار يقرأ الإعدادات من جديد (بدء التشغيل، تبويب آخر، ملف مستورد) يمر من هنا.
export function applySettingsToUi() {
  applyFontSize();
  applyTheme();
  syncSettingsUI();
}

export function syncSettingsUI() {
  elements.fontButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.fontSize === settings.fontSize));
  });
  elements.themeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.theme === settings.theme));
  });
}
