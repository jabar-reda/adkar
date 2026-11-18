// @ts-check
// الحالة المعيشة للتقدم والتخزين: التحميل، التطهير، الحفظ، الدمج بين
// التبويبات، والوصول إلى أيام اليوم. كل قراءة/كتابة للتقدم تمر من هنا.

import { KEEP_DAYS, SECTIONS, STATE_SCHEMA_VERSION, STORAGE_KEY } from "./constants.js";
import { announce, elements } from "./dom.js";
import {
  getBestStreak,
  isDayComplete,
  isSanitizedDayComplete,
  mergeStats,
  sanitizeStats,
  updateStreakStats,
} from "./progress.js";
import {
  addDays,
  dayKey,
  deepCopy,
  isRealDateKey,
  itemKey,
  legacyItemKey,
  previousTitleKey,
} from "./utils.js";

// الحالة الفارغة تُستعمل كبديل آمن عند تعذّر القراءة أو فساد التخزين،
// وفيها لا شيء يُكتب فوق البيانات الأصلية.
/** @returns {DayRecord} */
export const emptyDay = () => ({ morning: {}, evening: {}, wake: {}, sleep: {} });

/** @returns {ProgressState} */
function emptyState() {
  return { schemaVersion: STATE_SCHEMA_VERSION, days: {}, stats: { bestStreak: 0 } };
}

/** @type {ProgressState} */
export let state = emptyState();
// آخر نسخة نعرف أنها حُفظت؛ تُستخدم كقاعدة دمج داخل قفل الكتابة بين التبويبات.
let lastPersistedState = deepCopy(state);

let storageBlocked = false;
let storageLoadIssue = null;
let storageWarningShown = false;

/**
 * @param {ProgressState} next
 * @returns {void}
 */
export function setState(next) {
  state = next;
}

/** @returns {ProgressState} */
export function getLastPersistedState() {
  return lastPersistedState;
}

/**
 * @param {ProgressState} snapshot
 * @returns {void}
 */
export function setLastPersistedState(snapshot) {
  lastPersistedState = deepCopy(snapshot);
}

/** @returns {boolean} */
export const isStorageBlocked = () => storageBlocked;

// الاستيراد أو الدمج الصريح من المستخدم هو مسار الاسترداد عند فساد التخزين.
export function unblockStorage() {
  storageBlocked = false;
  storageLoadIssue = null;
}

/**
 * يبني نسخة نظيفة آمنة من بيانات يوم واحد: يتجاهل المفاتيح المجهولة،
 * ويقصّ كل عدّ داخل حدود العدد المطلوب، فلا تفسد بيانات خارجية الواجهة.
 * @param {any} source
 * @returns {DayRecord}
 */
function sanitizeDayRecord(source) {
  const day = emptyDay();
  if (!source || typeof source !== "object" || Array.isArray(source)) return day;
  Object.keys(SECTIONS).forEach((period) => {
    const record = source[period];
    if (!record || typeof record !== "object" || Array.isArray(record)) return;
    SECTIONS[period].items.forEach((item, index) => {
      const entryKey = itemKey(period, item);
      // نقرأ المفتاح القديم أثناء الترحيل فقط، ثم نحفظ الهوية الجديدة.
      const entry = record[entryKey] || record[previousTitleKey(period, item)] || record[legacyItemKey(period, index)];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
      if (item.count === 0) {
        day[period][entryKey] = { count: 0, done: Boolean(entry.done) };
        return;
      }
      const count = Math.max(0, Math.min(item.count, Math.floor(Number(entry.count) || 0)));
      day[period][entryKey] = { count, done: count >= item.count };
    });
  });
  return day;
}

/**
 * @param {any} parsed
 * @returns {boolean}
 */
function hasValidStoredShape(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      !parsed.days || typeof parsed.days !== "object" || Array.isArray(parsed.days)) return false;
  for (const [date, day] of Object.entries(parsed.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isRealDateKey(date)) return false;
    if (!day || typeof day !== "object" || Array.isArray(day)) return false;
    for (const period of Object.keys(SECTIONS)) {
      if (day[period] === undefined) continue;
      const record = day[period];
      if (!record || typeof record !== "object" || Array.isArray(record)) return false;
      for (const entry of Object.values(record)) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
        if (entry.count !== undefined && (!Number.isFinite(Number(entry.count)) || Number(entry.count) < 0)) return false;
        if (entry.done !== undefined && typeof entry.done !== "boolean") return false;
      }
    }
  }
  return true;
}

// يرشّح مفاتيح الأيام: تاريخ حقيقي بصيغة صحيحة لا لاحق لليوم،
// ويبقي أحدث KEEP_DAYS يوماً فقط، ويحذف الأيام الفارغة تماماً.
/**
 * @param {any} rawDays
 * @returns {Record<string, DayRecord>}
 */
export function sanitizeDays(rawDays) {
  /** @type {Record<string, DayRecord>} */
  const days = {};
  if (!rawDays || typeof rawDays !== "object" || Array.isArray(rawDays)) return days;
  const today = dayKey();
  const yesterday = dayKey(addDays(new Date(), -1));
  const candidates = Object.keys(rawDays)
    .filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && isRealDateKey(dateKey) && dateKey <= today)
    .sort()
    .slice(-(KEEP_DAYS + 1));
  const sanitized = /** @type {Record<string, DayRecord>} */ ({});
  candidates.forEach((dateKey) => {
    const day = sanitizeDayRecord(rawDays[dateKey]);
    if (Object.keys(SECTIONS).some((period) => Object.keys(day[period]).length > 0)) sanitized[dateKey] = day;
  });
  // نحتفظ بيوم إضافي مؤقتاً إذا كان اليوم قيد الإنجاز والأمس مكتملاً؛
  // فهو ما يتيح حساب سلسلة حتى KEEP_DAYS + 1 من تفاصيل الأيام عند اكتمال اليوم.
  const preserveStreakBridge = Boolean(
    sanitized[today] && !isSanitizedDayComplete(sanitized[today]) &&
    sanitized[yesterday] && isSanitizedDayComplete(sanitized[yesterday])
  );
  const selected = candidates.slice(-(KEEP_DAYS + (preserveStreakBridge ? 1 : 0)));
  selected.forEach((dateKey) => {
    if (sanitized[dateKey]) days[dateKey] = sanitized[dateKey];
  });
  return days;
}

// قراءة متزامنة من localStorage لأغراض الترحيل فقط (إصدارات APK القديمة).
/** @returns {string | null} */
function readLegacyLocalStorage() {
  try { return localStorage.getItem(STORAGE_KEY); }
  catch (error) { return null; }
}

// لا نعامل البيانات التالفة كحالة فارغة؛ نوقف الكتابة كي لا نمحو الأصل.
/** @returns {ProgressState | Promise<ProgressState>} */
export function loadState() {
  if (ADKAR_STORAGE.isNative) {
    return ADKAR_STORAGE.get(STORAGE_KEY).then((raw) => {
      if (raw) return parseLoadedState(raw);
      // ترحيل لمرة واحدة: إصدارات APK السابقة كانت تحفظ في localStorage،
      // فنقرأها وننسخها إلى Preferences حتى لا تظهر بيانات المستخدم مفقودة.
      const legacy = readLegacyLocalStorage();
      if (!legacy) return parseLoadedState(null);
      const parsed = parseLoadedState(legacy);
      if (!storageBlocked) ADKAR_STORAGE.set(STORAGE_KEY, legacy).catch(() => {});
      return parsed;
    });
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return parseLoadedState(raw);
  } catch (error) {
    storageLoadIssue = error && error.name === "SecurityError"
      ? "المتصفح منع الوصول إلى التخزين المحلي. لن نحاول الكتابة حتى يصبح التخزين متاحاً."
      : "تعذّرت قراءة بيانات التقدم المخزنة. أوقفنا الحفظ التلقائي حتى لا تُستبدل البيانات التالفة.";
    storageBlocked = true;
    return emptyState();
  }
}

/**
 * يقرأ JSON المخزَّن ويطبّق التحقق والتطهير، ويوقف الحفظ عند التلف.
 * @param {string | null} raw
 * @returns {ProgressState}
 */
function parseLoadedState(raw) {
  try {
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!hasValidStoredShape(parsed)) {
      storageLoadIssue = "بيانات التقدم المخزنة تالفة أو غير متوافقة. أوقفنا الحفظ التلقائي حفاظاً عليها.";
      storageBlocked = true;
      return emptyState();
    }
    if (Number(parsed.schemaVersion || 1) > STATE_SCHEMA_VERSION) {
      storageLoadIssue = "بيانات التقدم من إصدار أحدث. حدّث التطبيق قبل تعديلها حتى لا تفقد بياناتك.";
      storageBlocked = true;
      return emptyState();
    }
    return { schemaVersion: STATE_SCHEMA_VERSION, days: sanitizeDays(parsed.days), stats: sanitizeStats(parsed.stats) };
  } catch (error) {
    storageLoadIssue = error && error.name === "SecurityError"
      ? "المتصفح منع الوصول إلى التخزين المحلي. لن نحاول الكتابة حتى يصبح التخزين متاحاً."
      : "تعذّرت قراءة بيانات التقدم المخزنة. أوقفنا الحفظ التلقائي حتى لا تُستبدل البيانات التالفة.";
    storageBlocked = true;
    return emptyState();
  }
}

/**
 * @param {boolean} saved
 * @returns {void}
 */
export function reportStorageState(saved) {
  const warning = elements.storageWarning;
  if (!warning) return;
  if (!saved) warning.textContent = storageLoadIssue || "تعذّر حفظ التقدم على هذا الجهاز؛ سيبقى التقدم في الذاكرة حتى إغلاق الصفحة.";
  warning.hidden = saved;
  if (!saved && !storageWarningShown) {
    storageWarningShown = true;
    announce(storageLoadIssue || "تعذّر حفظ التقدم على هذا الجهاز");
  }
}

// يطبّق قواعد الحفظ المشتركة على الحالة ويعيد لقطة عميقة جاهزة للكتابة.
/** @returns {ProgressState} */
function prepareStateSnapshot() {
  state.schemaVersion = STATE_SCHEMA_VERSION;
  updateStreakStats(state);
  state.stats = sanitizeStats(state.stats);
  state.stats.bestStreak = Math.max(state.stats.bestStreak, getBestStreak(state));
  return deepCopy(state);
}

// الحفظ على الويب دون Web Locks (وفي الاختبارات): كتابة متزامنة مباشرة
// حتى تبقى القراءة والكتابة فوريتين.
/**
 * @param {ProgressState} snapshot
 * @returns {boolean}
 */
function saveWithoutLocks(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    lastPersistedState = deepCopy(snapshot);
    reportStorageState(true);
    return true;
  } catch (error) {
    reportStorageState(false);
    return false;
  }
}

// Web Locks يجعل القراءة والدمج والكتابة عملية متسلسلة بين التبويبات.
// من دونه لا توجد primitive ذرية في localStorage تضمن منع stale overwrite.
/**
 * @param {ProgressState} localSnapshot
 * @param {ProgressState} baseSnapshot
 * @returns {void}
 */
function saveUnderLock(localSnapshot, baseSnapshot) {
  navigator.locks.request("adkar-progress-write", { mode: "exclusive" }, async () => {
    if (storageBlocked) return;
    const raw = await ADKAR_STORAGE.get(STORAGE_KEY);
    const remote = parseStateSnapshot(raw);
    if (!remote) {
      storageBlocked = true;
      storageLoadIssue = "بيانات التقدم المخزنة تغيّرت إلى بنية تالفة أثناء المزامنة. أوقفنا الكتابة حفاظاً عليها.";
      reportStorageState(false);
      return;
    }
    const merged = mergeConcurrentState(baseSnapshot, localSnapshot, remote);
    state = merged;
    updateStreakStats(state);
    state.stats.bestStreak = Math.max(state.stats.bestStreak, getBestStreak(state));
    await ADKAR_STORAGE.set(STORAGE_KEY, JSON.stringify(state));
    lastPersistedState = deepCopy(state);
    reportStorageState(true);
  }).catch(() => {
    storageLoadIssue = "تعذّر حفظ التقدم داخل قفل المزامنة. بقي التقدم في الذاكرة ولم نكتب فوق البيانات.";
    reportStorageState(false);
  });
}

/** @returns {Promise<boolean>} */
export async function saveState() {
  if (storageBlocked) { reportStorageState(false); return false; }
  const localSnapshot = prepareStateSnapshot();
  const hasLocksSave = typeof navigator !== "undefined" && !!navigator.locks && typeof navigator.locks.request === "function";
  // On the web without Web Locks (and in tests), keep the original synchronous
  // localStorage path so reads/writes stay immediate.
  if (!ADKAR_STORAGE.isNative && !hasLocksSave) {
    return saveWithoutLocks(localSnapshot);
  }
  // يجب التقاط قاعدة الدمج عند طلب القفل، لا عند تنفيذه؛ فقد تصل storage event
  // أثناء انتظار القفل وتحدّث lastPersistedState قبل دور هذه العملية.
  const baseSnapshot = deepCopy(lastPersistedState || emptyState());

  if (hasLocksSave) {
    saveUnderLock(localSnapshot, baseSnapshot);
    return true;
  }

  try {
    await ADKAR_STORAGE.set(STORAGE_KEY, JSON.stringify(localSnapshot));
    lastPersistedState = deepCopy(localSnapshot);
    reportStorageState(true);
    return true;
  } catch (error) {
    reportStorageState(false);
    return false;
  }
}

// نحدّث إحصاءات السلسلة قبل التقليم، ونحتفظ بجسر يوم إضافي حتى يكتمل يوم اليوم.
export function pruneDays() {
  updateStreakStats(state);
  const today = dayKey();
  const yesterday = dayKey(addDays(new Date(), -1));
  const preserveStreakBridge = !isDayComplete(state, today) && isDayComplete(state, yesterday);
  const limit = KEEP_DAYS + (preserveStreakBridge ? 1 : 0);
  const keys = Object.keys(state.days).sort();
  while (keys.length > limit) {
    delete state.days[keys.shift()];
  }
}

/**
 * يوم واحد من الحالة، بأقسامه الأربعة مضمونة.
 * @param {string} dateKey
 * @returns {DayRecord}
 */
export function getDay(dateKey) {
  const day = state.days[dateKey];
  if (!day || typeof day !== "object") return emptyDay();
  // نعيد نسخاً بأربعة أقسام مضمونة، فلا يكسر غياب قسماً القراءة لاحقاً.
  return {
    morning: day.morning || {},
    evening: day.evening || {},
    wake: day.wake || {},
    sleep: day.sleep || {},
  };
}

/**
 * إدخال ذكر واحد في يوم اليوم.
 * @param {string} period
 * @param {string} entryKey
 * @returns {DayEntry | null}
 */
export function getEntry(period, entryKey) {
  const day = state.days[dayKey()];
  const record = day && day[period];
  return (record && record[entryKey]) || null;
}

// يكتب إدخال ذكر معين في يوم اليوم ثم يحفظ فوراً (حتى لا يضيع
// التقدم عند إغلاق الصفحة قبل أي حفظ لاحق).
/**
 * @param {string} period
 * @param {string} entryKey
 * @param {DayEntry} value
 */
export function setEntry(period, entryKey, value) {
  const today = dayKey();
  const day = getDay(today);
  day[period][entryKey] = value;
  state.days[today] = day;
  pruneDays();
  saveState();
}

/**
 * @param {string | null} raw
 * @returns {ProgressState | null}
 */
export function parseStateSnapshot(raw) {
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw);
    if (!hasValidStoredShape(parsed) || Number(parsed.schemaVersion || 1) > STATE_SCHEMA_VERSION) return null;
    return { schemaVersion: STATE_SCHEMA_VERSION, days: sanitizeDays(parsed.days), stats: sanitizeStats(parsed.stats) };
  } catch (error) {
    return null;
  }
}

// دمج ثلاثي للتبويبات: نحتفظ بتغيير محلي إذا لم يغيّر التبويب الآخر
// الإدخال نفسه؛ وعند تعارض الإدخال نفسه تكون نسخة التخزين الأحدث هي المرجع.
/**
 * @param {ProgressState} baseState
 * @param {ProgressState} localState
 * @param {ProgressState} remoteState
 * @returns {ProgressState}
 */
export function mergeConcurrentState(baseState, localState, remoteState) {
  const baseDays = baseState.days || {};
  const localDays = localState.days || {};
  const remoteDays = remoteState.days || {};
  const mergedDays = {};
  const dayKeys = new Set([...Object.keys(baseDays), ...Object.keys(localDays), ...Object.keys(remoteDays)]);
  dayKeys.forEach((dayKeyValue) => {
    const mergedDay = emptyDay();
    Object.keys(SECTIONS).forEach((period) => {
      const baseRecord = (baseDays[dayKeyValue] && baseDays[dayKeyValue][period]) || {};
      const localRecord = (localDays[dayKeyValue] && localDays[dayKeyValue][period]) || {};
      const remoteRecord = (remoteDays[dayKeyValue] && remoteDays[dayKeyValue][period]) || {};
      SECTIONS[period].items.forEach((item) => {
        const entryKey = itemKey(period, item);
        const baseEntry = baseRecord[entryKey] || null;
        const localEntry = localRecord[entryKey] || null;
        const remoteEntry = remoteRecord[entryKey] || null;
        const localChanged = JSON.stringify(localEntry) !== JSON.stringify(baseEntry);
        const remoteChanged = JSON.stringify(remoteEntry) !== JSON.stringify(baseEntry);
        const chosen = localChanged && !remoteChanged ? localEntry : remoteEntry;
        if (chosen) mergedDay[period][entryKey] = chosen;
      });
    });
    if (Object.keys(SECTIONS).some((period) => Object.keys(mergedDay[period]).length)) {
      mergedDays[dayKeyValue] = mergedDay;
    }
  });
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    days: sanitizeDays(mergedDays),
    stats: mergeStats(baseState.stats, localState.stats, remoteState.stats),
  };
}
