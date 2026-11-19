// @ts-check
// تذييل الصفحة: رقم الإصدار والسنة والمطور ورابطا GitHub وInstagram.
// القيم في ADKAR_CONFIG.appMeta حتى لا تتكرر في أكثر من ملف.

import { APP_META } from "./constants.js";
import { elements } from "./dom.js";
import { toArabicNumber } from "./utils.js";

/**
 * يحوّل اسم مستخدم إنستغرام إلى رابط كامل، ويترك الرابط الكامل كما هو.
 * @param {string} handle
 * @returns {string}
 */
function instagramUrl(handle) {
  if (/^https?:\/\//.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

/** @returns {void} */
export function renderColophon() {
  // كل عنصر يُكتب منفصلاً: نقص عنصر واحد في نسخة قديمة من الصفحة
  // لا يمنع بقية التذييل من الظهور.
  if (elements.appVersion) {
    elements.appVersion.textContent = toArabicNumber(APP_META.version);
  }
  if (elements.appYear) {
    elements.appYear.textContent = toArabicNumber(new Date().getFullYear());
  }
  if (elements.appAuthor) {
    elements.appAuthor.textContent = APP_META.author;
  }
  if (elements.appGithub) {
    elements.appGithub.href = APP_META.github;
  }
  if (elements.appInstagram) {
    elements.appInstagram.href = instagramUrl(APP_META.instagram);
  }
}
