// @ts-check
// شريط التراجع: يحتفظ بنسخة «قبل» من آخر إجراء لمدة خمس ثوانٍ.

import { UNDO_VISIBLE_MS } from "./constants.js";
import { elements } from "./dom.js";

/** @type {{ entryKey: string, title: string, before: DayEntry } | null} */
let lastAction = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let undoTimer = null;

/**
 * @param {string} entryKey
 * @param {string} title
 * @param {DayEntry} before
 * @param {string} actionLabel
 * @returns {void}
 */
export function showUndo(entryKey, title, before, actionLabel) {
  lastAction = { entryKey, title, before };
  elements.undoText.textContent = `${actionLabel}: ${title}`;
  elements.undoBar.hidden = false;
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideUndo, UNDO_VISIBLE_MS);
}

export function hideUndo() {
  clearTimeout(undoTimer);
  undoTimer = null;
  lastAction = null;
  elements.undoBar.hidden = true;
}

/** @returns {{ entryKey: string, title: string, before: DayEntry } | null} */
export function getLastAction() {
  return lastAction;
}
