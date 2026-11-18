// @ts-check
// حسابات التقدم والسلسلة فوق كائن الحالة الممرَّر صراحةً.
// لا تستورد الحالة المعيشة، فتبقى قابلة للاختبار ولإعادة الاستخدام.

import { KEEP_DAYS, SECTIONS } from "./constants.js";
import {
  addDays,
  dayDifference,
  dayKey,
  isRealDateKey,
  itemKey,
  parseDateKey,
} from "./utils.js";

/**
 * @param {DhikrItem} item
 * @param {DayEntry} [entry]
 * @returns {boolean}
 */
export function isItemComplete(item, entry) {
  if (!entry) return false;
  if (item.count === 0) return Boolean(entry.done);
  return (entry.count || 0) >= item.count;
}

/**
 * هل سُجّل أي تقدم لهذا الذكر (عدّ أو إتمام)؟ يحدد ظهور زر «إعادة».
 * @param {DayEntry} entry
 * @returns {boolean}
 */
export const hasProgress = (entry) => entry.count > 0 || entry.done;

/**
 * يطهّر إحصاءات السلسلة من أي مصدر ويعيدها بأرقام صالحة.
 * @param {any} raw
 * @returns {StreakStats}
 */
export const sanitizeStats = (raw) => {
  const best = Number(raw && raw.bestStreak);
  const current = Number(raw && raw.currentStreak);
  const date = raw && typeof raw.currentStreakDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(raw.currentStreakDate) &&
    isRealDateKey(raw.currentStreakDate) && raw.currentStreakDate <= dayKey()
    ? raw.currentStreakDate
    : null;
  return {
    bestStreak: Number.isFinite(best) ? Math.max(0, Math.floor(best)) : 0,
    currentStreak: date && Number.isFinite(current) ? Math.max(0, Math.floor(current)) : 0,
    currentStreakDate: date,
  };
};

/**
 * يدمج إحصاءات عدة نسخ بأخذ أفضل سلسلة وأحدث سلسلة حالية.
 * @param {...any} sources
 * @returns {StreakStats}
 */
export function mergeStats(...sources) {
  const values = sources.map(sanitizeStats);
  const bestStreak = Math.max(0, ...values.map((value) => value.bestStreak));
  const latestDate = values.map((value) => value.currentStreakDate).filter(Boolean).sort().slice(-1)[0] || null;
  const currentStreak = latestDate
    ? Math.max(0, ...values.filter((value) => value.currentStreakDate === latestDate).map((value) => value.currentStreak))
    : 0;
  return { bestStreak, currentStreak, currentStreakDate: latestDate };
}

/**
 * @param {ProgressState} state
 * @param {string} period
 * @param {string} [dateKey]
 * @returns {number}
 */
export function countCompleted(state, period, dateKey = dayKey()) {
  const record = getDayFromState(state, dateKey)[period];
  return SECTIONS[period].items.reduce(
    (total, item) =>
      isItemComplete(item, record[itemKey(period, item)]) ? total + 1 : total,
    0
  );
}

/**
 * @param {ProgressState} state
 * @param {string} period
 * @param {string} dateKey
 * @returns {boolean}
 */
function isSectionComplete(state, period, dateKey) {
  return countCompleted(state, period, dateKey) === SECTIONS[period].items.length;
}

// اكتمال اليوم = إتمام الصباح والمساء معاً؛ الأقسام المكمّلة لا تدخل فيه.
/**
 * @param {ProgressState} state
 * @param {string} dateKey
 * @returns {boolean}
 */
export function isDayComplete(state, dateKey) {
  return isSectionComplete(state, "morning", dateKey) && isSectionComplete(state, "evening", dateKey);
}

/**
 * عدد الأذكار المكتملة في كل الأقسام ليوم واحد، بمرور واحد على الأقسام.
 * @param {ProgressState} state
 * @param {string} dateKey
 * @returns {{ [period: string]: number }}
 */
export function countAllSections(state, dateKey) {
  /** @type {{ [period: string]: number }} */
  const counts = {};
  Object.keys(SECTIONS).forEach((period) => {
    counts[period] = countCompleted(state, period, dateKey);
  });
  return counts;
}

/**
 * هل اكتمل كل قسم في يوم واحد؟
 * @param {ProgressState} state
 * @param {string} dateKey
 * @returns {{ [period: string]: boolean }}
 */
export function completionSnapshot(state, dateKey) {
  const counts = countAllSections(state, dateKey);
  /** @type {{ [period: string]: boolean }} */
  const completed = {};
  Object.keys(SECTIONS).forEach((period) => {
    completed[period] = counts[period] === SECTIONS[period].items.length;
  });
  return completed;
}

/**
 * نسخة اليوم بأقسامه الأربعة مضمونة، من كائن الحالة الممرَّر.
 * @param {ProgressState} state
 * @param {string} dateKey
 * @returns {DayRecord}
 */
function getDayFromState(state, dateKey) {
  const day = state.days[dateKey];
  if (!day || typeof day !== "object") {
    return { morning: {}, evening: {}, wake: {}, sleep: {} };
  }
  return {
    morning: day.morning || {},
    evening: day.evening || {},
    wake: day.wake || {},
    sleep: day.sleep || {},
  };
}

/**
 * @param {DayRecord} day
 * @returns {boolean}
 */
export function isSanitizedDayComplete(day) {
  return ["morning", "evening"].every((period) =>
    SECTIONS[period].items.every((item) => isItemComplete(item, day[period][itemKey(period, item)]))
  );
}

/**
 * @param {ProgressState} state
 * @param {string} endKey
 * @returns {number}
 */
function getStreakEndingAt(state, endKey) {
  let cursor = parseDateKey(endKey);
  let streak = 0;
  for (let index = 0; index < KEEP_DAYS + 1; index += 1) {
    if (!isDayComplete(state, dayKey(cursor))) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/**
 * @param {ProgressState} state
 * @returns {void}
 */
export function updateStreakStats(state) {
  const stats = sanitizeStats(state.stats);
  const today = dayKey();
  const yesterday = dayKey(addDays(new Date(), -1));
  if (isDayComplete(state, today)) {
    if (stats.currentStreakDate !== today) {
      const previousStreak = isDayComplete(state, yesterday)
        ? (stats.currentStreakDate === yesterday ? stats.currentStreak : getStreakEndingAt(state, yesterday))
        : 0;
      stats.currentStreak = previousStreak + 1;
      stats.currentStreakDate = today;
    }
    state.stats = stats;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak, getBestStreak(state));
  } else if (stats.currentStreakDate === today) {
    if (isDayComplete(state, yesterday)) {
      stats.currentStreak = Math.max(0, stats.currentStreak - 1);
      stats.currentStreakDate = yesterday;
    } else {
      stats.currentStreak = 0;
      stats.currentStreakDate = null;
    }
  }
  state.stats = stats;
}

/**
 * @param {ProgressState} state
 * @returns {number}
 */
export function getCurrentStreak(state) {
  const today = dayKey();
  const yesterday = dayKey(addDays(new Date(), -1));
  const stats = sanitizeStats(state.stats);
  if (stats.currentStreakDate === today && isDayComplete(state, today)) return stats.currentStreak;
  if (stats.currentStreakDate === yesterday && isDayComplete(state, yesterday)) return stats.currentStreak;
  let cursor = new Date();
  if (!isDayComplete(state, today)) cursor = addDays(cursor, -1);
  return getStreakEndingAt(state, dayKey(cursor));
}

// أفضل سلسلة: نمرّ على أيام التخزين المرتبة ونعيد أبعد امتداد
// متتالٍ (فرق يوم واحد بين يومَين مكتملَين)؛ أي يوم ناقص يبدأ عدّاً جديداً.
/**
 * @param {ProgressState} state
 * @returns {number}
 */
export function getBestStreak(state) {
  const dateKeys = Object.keys(state.days).sort();
  let best = 0;
  let run = 0;
  let previous = null;
  dateKeys.forEach((dateKey) => {
    if (!isDayComplete(state, dateKey)) { run = 0; previous = dateKey; return; }
    run = previous && dayDifference(previous, dateKey) === 1 ? run + 1 : 1;
    previous = dateKey;
    best = Math.max(best, run);
  });
  return Math.max(best, sanitizeStats(state.stats).bestStreak);
}

/**
 * @param {ProgressState} state
 * @returns {{ complete: number, morning: number, evening: number }}
 */
export function getWeekSummary(state) {
  const summary = { complete: 0, morning: 0, evening: 0 };
  const today = new Date();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const completed = completionSnapshot(state, dayKey(addDays(today, -offset)));
    if (completed.morning) summary.morning += 1;
    if (completed.evening) summary.evening += 1;
    if (completed.morning && completed.evening) summary.complete += 1;
  }
  return summary;
}
