// @ts-check
// عرض القسم النشط: بناء القوائم، شريط التقدم، شريط المجموعة المكمّلة،
// عنوان التبويب، والاحتفال عند الاكتمال.

import { SECTIONS, SUPPLEMENTS } from "./constants.js";
import { createItem } from "./cards.js";
import { celebrate, celebrateSupplement } from "./celebration.js";
import { closeCounter } from "./counter.js";
import { elements } from "./dom.js";
import { renderInsights } from "./insights.js";
import { countAllSections, countCompleted } from "./progress.js";
import { applyTheme } from "./settings.js";
import { state } from "./state.js";
import { formatBackupDate, formatWeekday, updateTimeLeft } from "./time.js";
import { hideUndo } from "./undo.js";
import {
  getActivePeriod,
  itemControllers,
  setActivePeriod,
} from "./ui-state.js";
import { getViewedDayKey, isViewingToday } from "./view-day.js";
import { parseDateKey, toArabicNumber } from "./utils.js";

let previousDone = null; // عدد المكتمل قبل آخر تحديث، لكشف «اكتمل الآن»
let previousSupplementDone = null;
let insightsSignature = ""; // بصمة عدّادات الأقسام لتحديث الإحصاءات عند تغيّرها فقط

// إعادة بناء القسم كاملاً: بطاقات الأذكار ثم المجموعة المكمّلة
// (الاستيقاظ/النوم) وحالات التبويبات، ثم تحديث كل الأرقام.
/**
 * @param {string} period
 * @returns {void}
 */
export function renderPeriod(period) {
  closeCounter({ celebratePending: false });
  setActivePeriod(period);
  applyTheme();
  hideUndo();

  const dateKey = getViewedDayKey();
  const section = SECTIONS[period];
  elements.title.textContent = section.name;
  elements.hint.textContent = section.hint;
  elements.list.setAttribute("aria-labelledby", `tab-${period}`);
  itemControllers.clear();
  elements.list.replaceChildren(
    ...section.items.map((item, index) =>
      createItem(period, item, index, updateProgress, dateKey)
    )
  );

  const supplement = SUPPLEMENTS[period];
  elements.supplementGroup.hidden = !supplement;
  elements.supplementList.replaceChildren();
  if (supplement) {
    elements.supplementTitle.textContent = supplement.name;
    elements.supplementNote.textContent = supplement.note;
    elements.supplementList.replaceChildren(
      ...SECTIONS[supplement.period].items.map((item, index) =>
        createItem(supplement.period, item, index, updateProgress, dateKey)
      )
    );
  }

  elements.tabs.forEach((tab) => {
    const selected = tab.dataset.period === period;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });

  renderViewingNote(dateKey);
  elements.reset.textContent = isViewingToday()
    ? "إعادة تعيين اليوم"
    : "إعادة تعيين هذا اليوم";

  previousDone = countCompleted(state, period, dateKey);
  previousSupplementDone = supplement ? countCompleted(state, supplement.period, dateKey) : null;
  insightsSignature = "";
  updateProgress();
  updateTimeLeft();
}

// شريط يوضح أن الأعلى يعرض يوماً سابقاً مختاراً من التقويم.
/**
 * @param {string} dateKey
 * @returns {void}
 */
function renderViewingNote(dateKey) {
  const past = !isViewingToday();
  elements.viewingNote.hidden = !past;
  if (!past) {
    elements.viewingNoteText.textContent = "";
    return;
  }
  const date = parseDateKey(dateKey);
  elements.viewingNoteText.textContent =
    `تعرض الآن أذكار ${formatWeekday(date)} ${formatBackupDate(dateKey)} — ` +
    "أي تعديل هنا يُحفظ لذلك اليوم.";
}

// عنوان تبويب المتصفح يعرض المتبقي: مؤشر مختصر يظهر أثناء التنقل
// بين التطبيقات دون العودة إلى الصفحة.
/**
 * @param {{ name: string }} section
 * @param {number} done
 * @param {number} total
 * @returns {void}
 */
function updateTabTitle(section, done, total) {
  const remaining = total - done;
  document.title =
    remaining === 0 ? `✓ ${section.name}` : `(${toArabicNumber(remaining)}) ${section.name}`;
}

// يرسم شريط المجموعة المكمّلة (الاستيقاظ/النوم) ويعيد هل اكتملت الآن،
// حتى يبقى updateProgress مسؤولاً عن القسم الأساسي وحده.
/**
 * @param {{ [period: string]: number }} counts
 * @returns {boolean}
 */
function renderSupplementProgress(counts) {
  const supplement = SUPPLEMENTS[getActivePeriod()];
  let justCompletedSupplement = false;

  if (!supplement) return false;

  const supplementTotal = SECTIONS[supplement.period].items.length;
  const supplementDone = counts[supplement.period];
  elements.supplementProgress.textContent =
    supplementDone === supplementTotal
      ? `أكملت ${supplement.name}`
      : `أكملت ${toArabicNumber(supplementDone)} من ${toArabicNumber(supplementTotal)}`;
  elements.supplementFill.style.width = `${(supplementDone / supplementTotal) * 100}%`;
  elements.supplementBar.setAttribute("aria-valuenow", String(supplementDone));
  elements.supplementBar.setAttribute("aria-valuemax", String(supplementTotal));
  elements.supplementBar.setAttribute("aria-label", `تقدم ${supplement.name}`);

  justCompletedSupplement =
    previousSupplementDone !== null &&
    supplementDone === supplementTotal &&
    previousSupplementDone < supplementTotal;
  previousSupplementDone = supplementDone;
  return justCompletedSupplement;
}

export function updateProgress() {
  const section = SECTIONS[getActivePeriod()];
  const total = section.items.length;
  // نحسب عدّادات الأقسام مرة واحدة، لأن كل استدعاء لـ countCompleted يمر على كل الأذكار.
  const counts = countAllSections(state, getViewedDayKey());
  const done = counts[getActivePeriod()];
  // «اكتمل الآن» = صار العدد المساوي للإجمالي وكان أقل منه في التحديث السابق؛
  // هذا الفرق هو ما يشغّل الاحتفال مرة واحدة لا عند كل تحديث.
  const justCompleted = previousDone !== null && done === total && previousDone < total;
  previousDone = done;

  elements.progressText.textContent =
    done === total
      ? `أكملت ${section.name}`
      : `أكملت ${toArabicNumber(done)} من ${toArabicNumber(total)}`;
  elements.progressFill.style.width = total ? `${(done / total) * 100}%` : "0%";
  elements.progressBar.setAttribute("aria-valuenow", String(done));
  elements.progressBar.setAttribute("aria-valuemax", String(total));
  elements.progressBar.setAttribute("aria-label", `تقدم ${section.name}`);

  const remaining = total - done;
  elements.nextButton.disabled = remaining === 0;
  elements.nextButton.textContent =
    remaining === 0 ? "أكملت القسم" : `التالي — بقي ${toArabicNumber(remaining)}`;

  elements.tabs.forEach((tab) => {
    const period = tab.dataset.period;
    const periodTotal = SECTIONS[period].items.length;
    const periodDone = counts[period];
    tab.querySelector(".tab-count").textContent =
      `${toArabicNumber(periodDone)} من ${toArabicNumber(periodTotal)}`;
  });

  updateTabTitle(section, done, total);

  const justCompletedSupplement = renderSupplementProgress(counts);

  const signature = `${counts.morning}:${counts.evening}:${counts.wake}:${counts.sleep}`;
  // التقويم والسلسلة إعادة حساب مكلفة، فلا نحدثهما إلا حين تتغير الأعداد.
  if (signature !== insightsSignature) {
    insightsSignature = signature;
    renderInsights();
  }

  if (justCompleted) celebrate(section);
  if (justCompletedSupplement) celebrateSupplement(SUPPLEMENTS[getActivePeriod()]);
}
