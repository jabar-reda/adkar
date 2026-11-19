// @ts-check
// اليوم المعروض في الأعلى: افتراضياً اليوم الحالي، ويمكن اختيار يوم سابق
// من التقويم لقراءة أذكاره وتعديلها. كل قراءة/كتابة للبطاقات تمر بهذا
// المفتاح حتى لا تختلط أذكار يوم بيوم آخر.

import { dayKey } from "./utils.js";

let viewedDayKey = dayKey();

/** @returns {string} */
export const getViewedDayKey = () => viewedDayKey;

/** @returns {boolean} */
export const isViewingToday = () => viewedDayKey === dayKey();

/**
 * @param {string} dateKey
 * @returns {void}
 */
export function setViewedDayKey(dateKey) {
  viewedDayKey = dateKey;
}

/** @returns {void} */
export function resetViewedDayKey() {
  viewedDayKey = dayKey();
}
