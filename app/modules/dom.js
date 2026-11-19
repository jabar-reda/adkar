// @ts-check
// عناصر الصفحة المشتركة، وإعلانات قارئ الشاشة، وبناء نص الذكر.
// كل معرّف هنا موجود فعلاً في index.html (تفحصه الاختبارات).

// تجميع كل عناصر DOM المطلوبة مرة واحدة في البداية بدل البحث المتكرر.
export const elements = {
  list: document.getElementById("dhikr-list"),
  title: document.getElementById("period-title"),
  hint: document.getElementById("period-hint"),
  progressText: document.getElementById("progress-text"),
  progressBar: document.getElementById("progress-bar"),
  progressFill: document.getElementById("progress-fill"),
  storageWarning: document.getElementById("storage-warning"),
  reset: document.getElementById("reset-day"),
  gregDate: document.getElementById("date-greg"),
  hijriDate: document.getElementById("date-hijri"),
  live: document.getElementById("live"),
  page: /** @type {HTMLElement} */ (document.querySelector(".page")),
  timeLeft: document.getElementById("time-left"),
  nextButton: /** @type {HTMLButtonElement} */ (document.getElementById("next-incomplete")),
  undoBar: document.getElementById("undo-bar"),
  undoText: document.getElementById("undo-text"),
  undoButton: document.getElementById("undo-button"),
  fontButtons: /** @type {HTMLButtonElement[]} */ (Array.from(document.querySelectorAll("[data-font-size]"))),
  themeButtons: /** @type {HTMLButtonElement[]} */ (Array.from(document.querySelectorAll("[data-theme]"))),
  exportButton: document.getElementById("export-backup"),
  importButton: document.getElementById("import-backup"),
  exportCsvButton: document.getElementById("export-csv"),
  importFile: /** @type {HTMLInputElement} */ (document.getElementById("import-file")),
  importConfirm: document.getElementById("import-confirm"),
  importSummary: document.getElementById("import-summary"),
  importApply: document.getElementById("import-apply"),
  importMerge: document.getElementById("import-merge"),
  importCancel: document.getElementById("import-cancel"),
  importPaste: /** @type {HTMLButtonElement} */ (document.getElementById("import-paste")),
  backupStatus: document.getElementById("backup-status"),
  backupReminder: document.getElementById("backup-reminder"),
  backupDialog: /** @type {HTMLDialogElement} */ (document.getElementById("backup-dialog")),
  backupDialogTitle: document.getElementById("backup-dialog-title"),
  backupDialogMessage: document.getElementById("backup-dialog-message"),
  backupDialogText: /** @type {HTMLTextAreaElement} */ (document.getElementById("backup-dialog-text")),
  backupClose: /** @type {HTMLButtonElement} */ (document.getElementById("backup-dialog-close")),
  backupCopy: /** @type {HTMLButtonElement} */ (document.getElementById("backup-copy")),
  backupDownload: /** @type {HTMLButtonElement} */ (document.getElementById("backup-download")),
  backupVerify: /** @type {HTMLButtonElement} */ (document.getElementById("backup-verify")),
  tabs: /** @type {HTMLButtonElement[]} */ (Array.from(document.querySelectorAll(".tab"))),
  tablist: /** @type {HTMLElement} */ (document.querySelector(".period-tabs")),
  streakCurrent: document.getElementById("streak-current"),
  streakBest: document.getElementById("streak-best"),
  streakNote: document.getElementById("streak-note"),
  weeklySummary: document.getElementById("weekly-summary"),
  calendarMonth: document.getElementById("calendar-month"),
  calendarPrev: /** @type {HTMLButtonElement} */ (document.getElementById("calendar-prev")),
  calendarNext: /** @type {HTMLButtonElement} */ (document.getElementById("calendar-next")),
  calendarGrid: document.getElementById("calendar-grid"),
  calendarDetail: document.getElementById("calendar-detail"),
  viewingNote: document.getElementById("viewing-note"),
  viewingNoteText: document.getElementById("viewing-note-text"),
  viewingToday: /** @type {HTMLButtonElement} */ (document.getElementById("viewing-today")),
  appVersion: document.getElementById("app-version"),
  appYear: document.getElementById("app-year"),
  appAuthor: document.getElementById("app-author"),
  appGithub: /** @type {HTMLAnchorElement} */ (document.getElementById("app-github")),
  appInstagram: /** @type {HTMLAnchorElement} */ (document.getElementById("app-instagram")),
  counterDialog: /** @type {HTMLDialogElement} */ (document.getElementById("counter-dialog")),
  counterTitle: document.getElementById("counter-title"),
  counterText: document.getElementById("counter-text"),
  counterCount: document.getElementById("counter-count"),
  counterFill: document.getElementById("counter-fill"),
  counterButton: /** @type {HTMLButtonElement} */ (document.getElementById("counter-button")),
  counterClose: document.getElementById("counter-close"),
  counterReset: /** @type {HTMLButtonElement} */ (document.getElementById("counter-reset")),
  supplementGroup: document.getElementById("supplement-group"),
  supplementTitle: document.getElementById("supplement-title"),
  supplementNote: document.getElementById("supplement-note"),
  supplementList: document.getElementById("supplement-list"),
  supplementProgress: document.getElementById("supplement-progress"),
  supplementBar: document.getElementById("supplement-bar"),
  supplementFill: document.getElementById("supplement-fill"),
};

// منطقة aria-live: تغيير نصها يُعلن تلقائياً دون تحريك التركيز.
/**
 * @param {string} message
 * @returns {void}
 */
export function announce(message) {
  elements.live.textContent = message;
}

// إنشاء <p> بأمان: textContent دائماً لأن نصوص الأذكار قد تُنسخ
// من ملف استيراد، فلا يُفسَّر أي شيء كوسوم HTML.
/**
 * @param {string} className
 * @param {string} text
 * @returns {HTMLParagraphElement}
 */
function paragraph(className, text) {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

// ترتيب نص الذكر: البسملة إن وردت، فالآية بين قوسين قرآنيين، فالفواصل،
// فالمصدر، فالملاحظة — نفس الترتيب في القائمة وفي نافذة العدّاد.
/**
 * @param {HTMLElement} container
 * @param {DhikrItem} item
 * @returns {void}
 */
export function appendDhikrText(container, item) {
  if (item.basmala) {
    container.append(paragraph("basmala", "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"));
  }
  if (item.ayah) {
    container.append(paragraph("ayah", "﴿" + item.ayah + "﴾"));
  }
  (item.lines || []).forEach((line) => {
    container.append(paragraph("dhikr-text", line));
  });
  if (item.source) {
    container.append(paragraph("source", "[" + item.source + "]"));
  }
  if (item.note) {
    container.append(paragraph("note", item.note));
  }
}

// هل توجد نافذة عدّاد معروضة الآن؟ نتحقق من الخاصية open ومن السمة معاً
// لأن المتصفحات التي لا تدعم <dialog> تعرضها بالسمة وحدها.
/**
 * @returns {boolean}
 */
export function isCounterOpen() {
  const dialog = elements.counterDialog;
  return Boolean(dialog && (dialog.open === true || dialog.hasAttribute("open")));
}
