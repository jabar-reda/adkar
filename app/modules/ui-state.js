// @ts-check
// حالة واجهة مشتركة بين وحدات العرض: القسم النشط وخريطة أدوات تحكم البطاقات.
// القيم البسيطة تمر عبر دوال ضبط حتى لا يعيد المستوردون تعيينها.

/** @type {Map<string, any>} */
export const itemControllers = new Map();

let activePeriod = "morning";

export const getActivePeriod = () => activePeriod;

/**
 * @param {string} period
 * @returns {void}
 */
export function setActivePeriod(period) {
  activePeriod = period;
}
