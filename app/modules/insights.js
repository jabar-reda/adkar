// @ts-check
// لوحة التقدم: السلسلة الحالية وأفضلها، ملخص الأسبوع، والتقويم الشهري
// مع تفصيل اليوم المختار.

import { SECTIONS } from "./constants.js";
import { elements } from "./dom.js";
import {
  completionSnapshot,
  countAllSections,
  getBestStreak,
  getCurrentStreak,
  getWeekSummary,
  isDayComplete,
} from "./progress.js";
import { state } from "./state.js";
import { formatMonthLabel, formatWeekday } from "./time.js";
import {
  dayKey,
  parseDateKey,
  startOfMonth,
  toArabicNumber,
} from "./utils.js";

let calendarMonth = startOfMonth(new Date());
let selectedCalendarKey = dayKey();
/** @type {((dateKey: string) => void) | null} */
let onDaySelected = null;

/** @returns {Date} */
export const getCalendarMonth = () => calendarMonth;

/**
 * يربط التقويم بمن يعرض أذكار اليوم المختار (app.js) دون استيراد دائري.
 * @param {(dateKey: string) => void} handler
 * @returns {void}
 */
export function setDaySelectedHandler(handler) {
  onDaySelected = handler;
}

/**
 * @param {Date} next
 * @returns {void}
 */
export function setCalendarMonth(next) {
  calendarMonth = next;
}

/**
 * @param {string} next
 * @returns {void}
 */
export function setSelectedCalendarKey(next) {
  selectedCalendarKey = next;
}

// العودة إلى شهر اليوم ويومه المختار (بعد تغيّر اليوم أو استيراد نسخة).
export function resetCalendarToCurrentMonth() {
  calendarMonth = startOfMonth(new Date());
  selectedCalendarKey = dayKey();
}

/**
 * @param {boolean} isOn
 * @param {boolean} [isGold]
 * @returns {HTMLSpanElement}
 */
function calendarDot(isOn, isGold = false) {
  const dot = document.createElement("span");
  dot.className =
    "calendar-dot" + (isOn ? " is-on" : "") + (isGold ? " is-gold" : "");
  return dot;
}

/**
 * وصف خلية التقويم لقارئ الشاشة: التاريخ ثم حالة كل قسم بكلمة كاملة.
 * @param {Date} date
 * @param {{ [period: string]: boolean }} completed
 * @param {boolean} isFuture
 * @returns {string}
 */
function calendarDayLabel(date, completed, isFuture) {
  const status = isFuture
    ? "لم يأت بعد"
    : [
        `الصباح ${completed.morning ? "مكتمل" : "غير مكتمل"}`,
        `المساء ${completed.evening ? "مكتمل" : "غير مكتمل"}`,
        `أذكار الاستيقاظ ${completed.wake ? "مكتملة" : "غير مكتملة"}`,
        `أذكار النوم ${completed.sleep ? "مكتملة" : "غير مكتملة"}`,
      ].join("، ");
  return `${formatWeekday(date)} ${toArabicNumber(date.getDate())} ${formatMonthLabel(date)}: ${status}`;
}

function renderCalendarDetail() {
  const dateKey = selectedCalendarKey;
  if (!dateKey) {
    elements.calendarDetail.textContent = "";
    return;
  }
  const date = parseDateKey(dateKey);
  if (dateKey > dayKey()) {
    elements.calendarDetail.textContent = "";
    return;
  }
  if (!state.days[dateKey]) {
    elements.calendarDetail.textContent =
      `${formatWeekday(date)} ${toArabicNumber(date.getDate())} ${formatMonthLabel(date)} — لا يوجد تقدم مسجل.`;
    return;
  }
  const counts = countAllSections(state, dateKey);
  elements.calendarDetail.textContent =
    `${formatWeekday(date)} ${toArabicNumber(date.getDate())} ${formatMonthLabel(date)} — ` +
    `الصباح ${toArabicNumber(counts.morning)}/${toArabicNumber(SECTIONS.morning.items.length)}، ` +
    `أذكار الاستيقاظ ${toArabicNumber(counts.wake)}/${toArabicNumber(SECTIONS.wake.items.length)}، ` +
    `المساء ${toArabicNumber(counts.evening)}/${toArabicNumber(SECTIONS.evening.items.length)}، ` +
    `أذكار النوم ${toArabicNumber(counts.sleep)}/${toArabicNumber(SECTIONS.sleep.items.length)}.`;
}

// اختيار يوم في التقويم: نحدّث الصنف والحالة في الخلايا القائمة بدل إعادة بناء الشبكة.
/**
 * @param {string} dateKey
 * @returns {void}
 */
function selectCalendarDay(dateKey) {
  selectedCalendarKey = dateKey;
  const dayCells = /** @type {NodeListOf<HTMLButtonElement>} */ (
    elements.calendarGrid.querySelectorAll(".calendar-day")
  );
  dayCells.forEach((dayCell) => {
    if (!dayCell.dataset.key) return;
    const isSelected = dayCell.dataset.key === dateKey;
    dayCell.classList.toggle("is-selected", isSelected);
    dayCell.setAttribute("aria-pressed", String(isSelected));
  });
  renderCalendarDetail();
  if (onDaySelected) onDaySelected(dateKey);
}

/**
 * يبني خلية يوم واحد في شبكة التقويم: الرقم، نقطتا الحالة، والوصف لقارئ الشاشة.
 * @param {Date} date
 * @param {string} todayKey
 * @returns {HTMLButtonElement}
 */
function buildCalendarCell(date, todayKey) {
  const dateKey = dayKey(date);
  const isFuture = dateKey > todayKey;
  const completed = completionSnapshot(state, dateKey);
  const bothDone = completed.morning && completed.evening;
  const partial = (completed.morning || completed.evening) && !bothDone;

  const cell = document.createElement("button");
  cell.type = "button";
  cell.className = "calendar-day";
  if (isFuture) cell.classList.add("is-future");
  if (dateKey === todayKey) cell.classList.add("is-today");
  if (dateKey === selectedCalendarKey) cell.classList.add("is-selected");
  if (bothDone) cell.classList.add("is-complete");
  else if (partial) cell.classList.add("is-partial");
  cell.dataset.key = dateKey;
  cell.disabled = isFuture;
  cell.setAttribute("aria-label", calendarDayLabel(date, completed, isFuture));
  cell.setAttribute("aria-pressed", String(dateKey === selectedCalendarKey));

  const number = document.createElement("span");
  number.textContent = toArabicNumber(date.getDate());

  const dots = document.createElement("span");
  dots.className = "calendar-dots";
  dots.setAttribute("aria-hidden", "true");
  dots.append(
    calendarDot(completed.morning, completed.wake),
    calendarDot(completed.evening, completed.sleep)
  );

  cell.append(number, dots);
  cell.addEventListener("click", () => selectCalendarDay(dateKey));
  return cell;
}

export function renderCalendar() {
  const today = new Date();
  const todayKey = dayKey(today);
  const currentMonth = startOfMonth(today);
  const oldestKey = Object.keys(state.days).sort()[0];
  const minMonth = oldestKey ? startOfMonth(parseDateKey(oldestKey)) : currentMonth;

  if (calendarMonth < minMonth) calendarMonth = new Date(minMonth);
  if (calendarMonth > currentMonth) calendarMonth = new Date(currentMonth);

  elements.calendarMonth.textContent = formatMonthLabel(calendarMonth);
  elements.calendarPrev.disabled = calendarMonth <= minMonth;
  elements.calendarNext.disabled = calendarMonth >= currentMonth;

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    const blank = document.createElement("span");
    blank.className = "calendar-day is-empty";
    blank.setAttribute("aria-hidden", "true");
    cells.push(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(buildCalendarCell(new Date(year, month, day), todayKey));
  }

  elements.calendarGrid.replaceChildren(...cells);
  renderCalendarDetail();
}

export function renderInsights() {
  const todayComplete = isDayComplete(state, dayKey());
  elements.streakCurrent.textContent = toArabicNumber(getCurrentStreak(state));
  elements.streakBest.textContent = toArabicNumber(getBestStreak(state));
  elements.streakNote.textContent = todayComplete ? "" : "أكمل اليوم للحفاظ عليها";

  const week = getWeekSummary(state);
  elements.weeklySummary.textContent =
    `هذا الأسبوع: ${toArabicNumber(week.complete)}/٧ أيام كاملة · ` +
    `الصباح ${toArabicNumber(week.morning)}/٧ · المساء ${toArabicNumber(week.evening)}/٧`;

  renderCalendar();
}
