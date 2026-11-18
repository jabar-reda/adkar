// @ts-check
// حركة الاحتفال عند اكتمال قسم أو مجموعة مكمّلة، مع تأجيلها إن كانت
// نافذة العدّاد مفتوحة حتى لا تختفي خلف التعتيم.

import { CELEBRATION_MS } from "./constants.js";
import { announce, elements, isCounterOpen } from "./dom.js";

// مؤقتات الاحتفال مفتاحها الشريط نفسه، لأن شريطي القسم والمكمّل قد يحتفلان معاً.
const celebrationTimers = new Map();

/** @type {any} */
let pendingCelebration = null;
/** @type {any} */
let pendingSupplementCelebration = null;

// يشغّل حركة الاحتفال على شريط معيّن ثم يزيل الصنف بعد مهلته.
// قراءة offsetWidth تجبر المتصفح على إعادة الحساب، فتبدأ الحركة من صفر
// ولو كان الصنف مضافاً قبل لحظات.
/**
 * @param {HTMLElement} bar
 * @param {string} message
 * @returns {void}
 */
function playCelebration(bar, message) {
  bar.classList.remove("is-celebrating");
  void bar.offsetWidth;
  bar.classList.add("is-celebrating");
  clearTimeout(celebrationTimers.get(bar));
  celebrationTimers.set(
    bar,
    setTimeout(() => {
      bar.classList.remove("is-celebrating");
      celebrationTimers.delete(bar);
    }, CELEBRATION_MS)
  );
  announce(message);
}

/**
 * @param {{ name: string }} section
 * @returns {void}
 */
export function celebrate(section) {
  // إن كانت نافذة العدّاد مفتوحة نؤجل الاحتفال إلى الإغلاق.
  if (isCounterOpen()) {
    pendingCelebration = section;
    return;
  }
  playCelebration(elements.progressBar, `أكملت ${section.name} كاملة`);
}

/**
 * @param {{ name: string, period: string }} supplement
 * @returns {void}
 */
export function celebrateSupplement(supplement) {
  if (isCounterOpen()) {
    pendingSupplementCelebration = supplement;
    return;
  }
  playCelebration(
    elements.supplementBar,
    supplement.period === "wake"
      ? "أكملت أذكار الاستيقاظ — أصبح صباحك ذهبياً"
      : "أكملت أذكار النوم — أصبح مساؤك ذهبياً"
  );
}

export function clearPendingCelebrations() {
  pendingCelebration = null;
  pendingSupplementCelebration = null;
}

// تنفيذ الاحتفالات التي كانت مؤجلة خلف نافذة العدّاد بعد إغلاقها.
export function releasePendingCelebrations() {
  const section = pendingCelebration;
  pendingCelebration = null;
  if (section) celebrate(section);

  const supplement = pendingSupplementCelebration;
  pendingSupplementCelebration = null;
  if (supplement) celebrateSupplement(supplement);
}
