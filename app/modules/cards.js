// @ts-check
// بناء بطاقة الذكر ورسمها: الهيكل، النص، زر التسجيل، زر العدّاد،
// وزر الإعادة. تغييرات التقدم تُبلَّغ عبر دالة يمرّرها عارض القسم.

import { openCounter } from "./counter.js";
import { announce, appendDhikrText } from "./dom.js";
import { hasProgress, isItemComplete } from "./progress.js";
import { getEntry, setEntry } from "./state.js";
import { showUndo } from "./undo.js";
import { itemControllers } from "./ui-state.js";
import { itemKey, toArabicNumber } from "./utils.js";

/**
 * @param {DhikrItem} item
 * @param {DayEntry} progress
 * @returns {string}
 */
function buildLabel(item, progress) {
  if (item.count <= 1) return "تم";
  return `${toArabicNumber(progress.count)} من ${toArabicNumber(item.count)}`;
}

/**
 * @param {DhikrItem} item
 * @param {DayEntry} progress
 * @param {boolean} complete
 * @returns {string}
 */
function buildAriaLabel(item, progress, complete) {
  if (complete) return `مكتمل: ${item.title}`;
  if (item.count === 0) return `تسجيل الانتهاء من: ${item.title}`;
  if (item.count === 1) return `تسجيل: ${item.title}`;
  return `تسجيل ${item.title}، أكملت ${toArabicNumber(progress.count)} من ${toArabicNumber(item.count)}`;
}

/**
 * عناصر بطاقة الذكر التي يعيد رسمها paintItemCard.
 * @typedef {{ card: HTMLLIElement, pill: HTMLButtonElement, undo: HTMLButtonElement }} ItemCardNodes
 */

/**
 * يبني هيكل بطاقة الذكر ويربط زر العدّاد، دون أي منطق تقدم.
 * @param {DhikrItem} item
 * @param {number} index
 * @param {string} entryKey
 * @returns {ItemCardNodes}
 */
function buildItemCard(item, index, entryKey) {
  const card = document.createElement("li");
  card.className = "dhikr";

  const marker = document.createElement("span");
  marker.className = "marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = toArabicNumber(index + 1);

  const body = document.createElement("div");
  body.className = "dhikr-body";

  const head = document.createElement("div");
  head.className = "dhikr-head";

  const title = document.createElement("h2");
  title.className = "dhikr-title";
  title.textContent = item.title;
  head.append(title);

  if (item.count === 0) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "بلا عدد محدد";
    head.append(badge);
  }

  body.append(head);
  appendDhikrText(body, item);

  const actions = document.createElement("div");
  actions.className = "dhikr-actions";

  const counterButton = document.createElement("button");
  counterButton.type = "button";
  counterButton.className = "counter-open";
  counterButton.textContent = "عدّ";
  counterButton.setAttribute("aria-label", `فتح العدّاد: ${item.title}`);
  counterButton.addEventListener("click", () => openCounter(entryKey, counterButton));

  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "pill";

  const undo = document.createElement("button");
  undo.type = "button";
  undo.className = "undo";
  undo.textContent = "إعادة";
  undo.setAttribute("aria-label", `إعادة تعيين: ${item.title}`);

  if (item.count > 1) actions.append(counterButton);
  actions.append(pill, undo);
  body.append(actions);
  card.append(marker, body);

  return { card, pill, undo };
}

// رسم البطاقة من قيمة progress الحالية: النص، حالات aria،
// وإظهار زر «إعادة» عند وجود تقدم فقط.
/**
 * @param {ItemCardNodes} nodes
 * @param {DhikrItem} item
 * @param {DayEntry} progress
 * @returns {void}
 */
function paintItemCard(nodes, item, progress) {
  const complete = isItemComplete(item, progress);

  nodes.card.classList.toggle("is-done", complete);
  nodes.pill.classList.toggle("is-done", complete);
  nodes.pill.textContent = complete ? "تم ✓" : buildLabel(item, progress);
  nodes.pill.setAttribute("aria-disabled", String(complete));
  nodes.pill.setAttribute("aria-label", buildAriaLabel(item, progress, complete));
  if (item.count <= 1) {
    nodes.pill.setAttribute("aria-pressed", String(complete));
  }
  nodes.undo.hidden = !hasProgress(progress);
}

/* بناء بطاقة ذكر واحدة وإرجاعها.
   كل بطاقة تُغلق على حالتها الخاصة (progress) ودوالها: paint يعيد
   رسم الشكل، persist يحفظ في التخزين، increment وresetProgress
   يعدّلان الحالة ويسجلان إجراءً قابلاً للتراجع. تُجمع المؤشرات في
   itemControllers لتبقى مفاتيح التراجع والعدّاد تعمل بعد أي إعادة رسم. */
/**
 * @param {string} period
 * @param {DhikrItem} item
 * @param {number} index
 * @param {() => void} onProgressChange
 * @returns {HTMLLIElement}
 */
export function createItem(period, item, index, onProgressChange) {
  const entryKey = itemKey(period, item);
  const saved = getEntry(period, entryKey);
  const progress = {
    count: Number(saved && saved.count) || 0,
    done: Boolean(saved && saved.done),
  };
  const nodes = buildItemCard(item, index, entryKey);

  function paint() {
    paintItemCard(nodes, item, progress);
  }

  function persist() {
    setEntry(period, entryKey, { count: progress.count, done: progress.done });
  }

  function snapshot() {
    return { count: progress.count, done: progress.done };
  }

  function increment() {
    if (isItemComplete(item, progress)) return false;
    const before = snapshot();

    if (item.count === 0) {
      progress.done = true;
    } else {
      progress.count = Math.min(progress.count + 1, item.count);
      progress.done = progress.count >= item.count;
    }

    persist();
    paint();
    showUndo(
      entryKey,
      item.title,
      before,
      isItemComplete(item, progress) ? "تم إكمال" : "تم تسجيل"
    );

    if (isItemComplete(item, progress)) {
      announce(`تم إكمال: ${item.title}`);
    }
    onProgressChange();
    return true;
  }

  function resetProgress() {
    if (!hasProgress(progress)) return false;
    const before = snapshot();
    progress.count = 0;
    progress.done = false;
    persist();
    paint();
    onProgressChange();
    showUndo(entryKey, item.title, before, "أُعيد تعيين");
    announce(`أُعيد تعيين: ${item.title}`);
    return true;
  }

  nodes.pill.addEventListener("click", increment);
  nodes.undo.addEventListener("click", resetProgress);

  paint();
  itemControllers.set(entryKey, {
    element: nodes.card,
    item,
    increment,
    reset: resetProgress,
    getProgress: snapshot,
    applyProgress(next) {
      progress.count = next.count;
      progress.done = next.done;
      persist();
      paint();
    },
    focusPill() {
      nodes.pill.focus({ preventScroll: true });
    },
  });
  return nodes.card;
}
