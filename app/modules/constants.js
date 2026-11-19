// @ts-check
// الثوابت المشتركة بين وحدات التطبيق: قيم التخزين والوقت والواجهة،
// والأقسام الأربعة ومجموعاتها المكمّلة. لا منطق هنا.

const CONFIG = window.ADKAR_CONFIG;
if (!CONFIG) throw new Error("config.js must load before app.js");

export const STORAGE_KEY = CONFIG.storageKeys.state;
export const SETTINGS_KEY = CONFIG.storageKeys.settings;
export const APP_META = CONFIG.appMeta;

// نحتفظ بآخر 60 يوماً من التقدم فقط حتى لا يتضخم التخزين بلا نهاية.
export const KEEP_DAYS = 60;
// الإصدار 3: ترحيل الأيام القديمة التي اكتمل مساؤها قبل إضافة سورة الملك.
export const STATE_SCHEMA_VERSION = 3;
// معرّف سورة الملك: أُضيفت لاحقاً لأذكار المساء، فتُعامل الأيام القديمة
// المكتملة قبل إضافتها كأنها قُرئت فيها.
export const MULK_ITEM_ID = "surah-al-mulk";
// حد حجم ملف النسخة الاحتياطية المقبول عند الاستيراد (2 ميغابايت).
export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;
// نذكّر المستخدم بتصدير نسخة احتياطية كل أسبوعين.
export const BACKUP_REMINDER_DAYS = 14;
export const ARABIC_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
export const FONT_SIZES = CONFIG.fontSizes;
export const THEMES = CONFIG.themes;
export const DEFAULT_SETTINGS = { fontSize: "medium", theme: "auto", lastExportAt: null };
export const PERIOD_WINDOWS = CONFIG.periodWindows;

// مهل الواجهة بالمللي ثانية: مدة الاحتفال، إبراز «التالي»، بقاء شريط التراجع،
// ومهلة تأكيد «اضغط مرة أخرى».
export const CELEBRATION_MS = 1200;
export const HIGHLIGHT_MS = 2200;
export const UNDO_VISIBLE_MS = 5000;
export const CONFIRM_WINDOW_MS = 4000;
// مدة بقاء رابط التنزيل المؤقت قبل تحريره.
export const DOWNLOAD_URL_TTL_MS = 1000;
// فحص تغيّر اليوم كل دقيقة، وتحديث الوقت والثيم المعتمد على الساعة كل نصف دقيقة.
export const DAY_CHECK_INTERVAL_MS = 60000;
export const CLOCK_INTERVAL_MS = 30000;
// حدود السحب الأفقي بين القسمين.
export const SWIPE_MIN_DISTANCE_PX = 60;
export const SWIPE_MAX_DURATION_MS = 600;
export const SWIPE_EDGE_MARGIN_PX = 24;
export const SWIPE_AXIS_RATIO = 1.5;
export const MS_PER_DAY = 86400000;

// النصوص والقوائم الأربعة في app/data.js المحمّل قبله؛ هذا الملف منطق فقط.
const DATA = window.ADKAR_DATA;
if (!DATA) throw new Error("app/data.js must load before app.js");
const { MORNING_ITEMS, WAKE_ITEMS, EVENING_ITEMS, SLEEP_ITEMS } = DATA;

// الأقسام الأربعة: الأساسيان (صباح/مساء) يحدّان اكتمال اليوم،
// والمكمّلان (استيقاظ/نوم) يظهران داخل قسمَي الأساس دون دخولهما فيه.
export const SECTIONS = {
  morning: {
    name: "أذكار الصباح",
    hint:
      "من بعد صلاة الفجر إلى طلوع الشمس، ويجوز الإتيان بها بعد ذلك عند فوات وقتها.",
    items: MORNING_ITEMS,
  },
  evening: {
    name: "أذكار المساء",
    hint:
      "من بعد صلاة العصر إلى غروب الشمس، ويجوز الإتيان بها في أول الليل عند فوات ذلك.",
    items: EVENING_ITEMS,
  },
  wake: {
    name: "أذكار الاستيقاظ",
    hint:
      "تُقال عند الاستيقاظ من النوم، وهي مكمّلة لأذكار الصباح ولا تُحتسب في اكتمالها.",
    items: WAKE_ITEMS,
  },
  sleep: {
    name: "أذكار النوم",
    hint:
      "تُقال عند الفراش مباشرة، وهي مكمّلة لأذكار المساء ولا تُحتسب في اكتمالها.",
    items: SLEEP_ITEMS,
  },
};

// المجموعات المكمّلة لكل قسم أساسي.
export const SUPPLEMENTS = {
  morning: {
    period: "wake",
    name: "أذكار الاستيقاظ",
    note:
      "تُقال عند الاستيقاظ من النوم، وهي مكمّلة لأذكار الصباح ولا تُحتسب في اكتمالها.",
  },
  evening: {
    period: "sleep",
    name: "أذكار النوم",
    note:
      "تُقال عند الفراش مباشرة، وهي مكمّلة لأذكار المساء ولا تُحتسب في اكتمالها. آية الكرسي والمعوذات مذكورة في أول أذكار المساء.",
  },
};
