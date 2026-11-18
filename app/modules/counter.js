// @ts-check
// نافذة العدّاد الكبير: فتحها لذكر متكرر، مزامنة أرقامها، وإغلاقها
// مع إعادة التركيز وتنفيذ الاحتفال المؤجل.

import { CONFIRM_WINDOW_MS } from "./constants.js";
import { appendDhikrText, elements, isCounterOpen } from "./dom.js";
import {
  clearPendingCelebrations,
  releasePendingCelebrations,
} from "./celebration.js";
import { hasProgress, isItemComplete } from "./progress.js";
import { itemControllers } from "./ui-state.js";
import { toArabicNumber } from "./utils.js";

/** @type {string | null} */
let counterKey = null;
/** @type {HTMLElement | null} */
let counterOpener = null;
let counterResetArmed = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let counterResetTimer = null;

// مزامنة النافذة مع تقدم الذكر المفتوح فيها: الرقم، الشريط،
// وحالات زرّي العدّ والإعادة.
function updateCounterUI() {
  const controller = counterKey ? itemControllers.get(counterKey) : null;
  if (!controller) return;
  const progress = controller.getProgress();
  const item = controller.item;
  const complete = isItemComplete(item, progress);

  elements.counterCount.textContent =
    `${toArabicNumber(progress.count)} من ${toArabicNumber(item.count)}`;
  elements.counterFill.style.width = item.count
    ? `${Math.min(100, (progress.count / item.count) * 100)}%`
    : "0%";
  elements.counterButton.textContent = complete ? "تم ✓" : "عدّ";
  elements.counterButton.disabled = complete;
  elements.counterReset.disabled = !hasProgress(progress);
  if (elements.counterReset.disabled) disarmCounterReset();
}

// إعادة زر الإعادة من حالة التأكيد إلى حالته العادية (انتهت مهلتها
// أو تم الإلغاء) — تُستدعى في كل فتح للنافذة وكل ضغطة عدّ.
function disarmCounterReset() {
  counterResetArmed = false;
  clearTimeout(counterResetTimer);
  counterResetTimer = null;
  elements.counterReset.textContent = "إعادة العدّ";
  elements.counterReset.classList.remove("is-confirming");
}

// فتح نافذة العدّاد لذكر معين: نسخ نصه إليها، تثبيت من فتحها
// لإعادة التركيز إليه لاحقاً، ثم إظهارها بـ <dialog> إن توفر.
/**
 * @param {string} entryKey
 * @param {HTMLElement} opener
 * @returns {void}
 */
export function openCounter(entryKey, opener) {
  const controller = itemControllers.get(entryKey);
  if (!controller || !elements.counterDialog || isCounterOpen()) return;

  counterKey = entryKey;
  counterOpener = opener;
  elements.counterTitle.textContent = controller.item.title;
  elements.counterText.replaceChildren();
  appendDhikrText(elements.counterText, controller.item);
  disarmCounterReset();
  updateCounterUI();
  document.body.classList.add("is-dialog-open");

  if (typeof elements.counterDialog.showModal === "function") {
    elements.counterDialog.showModal();
  } else {
    elements.counterDialog.setAttribute("open", "");
  }
  elements.counterButton.focus({ preventScroll: true });
}

// تنظيف بعد إغلاق النافذة: إعادة التركيز إلى الزر الفاتح،
// وتنفيذ أي احتفال كان مؤجلاً خلفها.
function handleCounterClosed() {
  document.body.classList.remove("is-dialog-open");
  counterKey = null;
  disarmCounterReset();

  const opener = counterOpener;
  counterOpener = null;
  if (opener && opener.isConnected) opener.focus({ preventScroll: true });

  releasePendingCelebrations();
}

/**
 * @param {{ celebratePending?: boolean }} [options]
 * @returns {void}
 */
export function closeCounter(options = {}) {
  if (options.celebratePending === false) {
    clearPendingCelebrations();
  }
  const dialog = elements.counterDialog;
  if (!dialog || !isCounterOpen()) return;

  if (typeof dialog.close === "function") {
    dialog.close();
    return;
  }

  // متصفحات قديمة لا تدعم <dialog>: نزيل السمة وننفّذ نفس التنظيف يدوياً.
  dialog.removeAttribute("open");
  handleCounterClosed();
}

elements.counterButton.addEventListener("click", () => {
  const controller = counterKey ? itemControllers.get(counterKey) : null;
  if (!controller) return;
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(10);
    } catch (error) {
      // الاهتزاز اختياري وغير مدعوم في بعض المتصفحات.
    }
  }
  disarmCounterReset();
  controller.increment();
  updateCounterUI();
});

elements.counterReset.addEventListener("click", () => {
  const controller = counterKey ? itemControllers.get(counterKey) : null;
  if (!controller) return;

  // إعادة العدّ بخطوتين: أول ضغطة تفعّل التأكيد لمدة 4 ثوانٍ،
  // والثانية خلالها هي التي تمسح العدّ فعلاً.
  if (!counterResetArmed) {
    counterResetArmed = true;
    elements.counterReset.textContent = "اضغط مرة أخرى للتأكيد";
    elements.counterReset.classList.add("is-confirming");
    clearTimeout(counterResetTimer);
    counterResetTimer = setTimeout(disarmCounterReset, CONFIRM_WINDOW_MS);
    return;
  }

  disarmCounterReset();
  controller.reset();
  updateCounterUI();
});

elements.counterClose.addEventListener("click", () => closeCounter());
elements.counterDialog.addEventListener("click", (event) => {
  if (event.target === elements.counterDialog) closeCounter();
});
elements.counterDialog.addEventListener("close", handleCounterClosed);
