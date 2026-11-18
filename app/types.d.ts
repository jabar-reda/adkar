// أنواع مشتركة بين ملفات app/ — للتحقق في المحرر وtsc فقط،
// ولا تُحمَّل في الصفحة ولا تضيف أي كود وقت تشغيل.

/** إدخال ذكر واحد في يوم: العدّ وهل اكتمل. */
interface DayEntry {
  count: number;
  done: boolean;
}

/** سجل أذكار قسم واحد: مفتاح الذكر ← إدخاله. */
interface SectionRecord {
  [itemKey: string]: DayEntry;
}

/** تقدم الأقسام الأربعة في يوم واحد. */
interface DayRecord {
  morning: SectionRecord;
  evening: SectionRecord;
  wake: SectionRecord;
  sleep: SectionRecord;
  [period: string]: SectionRecord;
}

/** إحصاءات السلسلة المحفوظة مع التقدم. */
interface StreakStats {
  bestStreak: number;
  currentStreak?: number;
  currentStreakDate?: string | null;
}

/** كامل حالة التقدم المحفوظة في التخزين. */
interface ProgressState {
  schemaVersion: number;
  days: Record<string, DayRecord>;
  stats: StreakStats;
}

/** إعدادات المستخدم المحفوظة في localStorage. */
interface Settings {
  fontSize: string;
  theme: string;
  lastExportAt?: string | null;
}

/** ذكر واحد في app/data.js. */
interface DhikrItem {
  id: string;
  title: string;
  count: number;
  basmala?: boolean;
  ayah?: string;
  lines?: string[];
  source?: string;
  note?: string;
}

/** البيانات التي يعرّضها app/data.js عبر window.ADKAR_DATA. */
interface DhikrData {
  DHIKR: Record<string, DhikrItem>;
  MORNING_ITEMS: DhikrItem[];
  WAKE_ITEMS: DhikrItem[];
  EVENING_ITEMS: DhikrItem[];
  SLEEP_ITEMS: DhikrItem[];
}

/** القيم المشتركة التي يعرّضها app/config.js. */
interface AdkarConfig {
  storageKeys: { state: string; settings: string };
  fontSizes: string[];
  themes: string[];
  periodWindows: Record<string, { start: number; end: number }>;
}

/** واجهة طبقة التخزين في app/storage.js. */
interface AdkarStorage {
  isNative: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** معاينة نسخة احتياطية صالحة بعد التطهير. */
interface BackupPreview {
  days: Record<string, DayRecord>;
  settings: Settings | null;
  stats: StreakStats;
  dayCount: number;
  lastDate: string | null;
}

/** نتيجة فحص ملف النسخة الاحتياطية. */
type BackupFileResult =
  | { ok: false; reason: string }
  | ({ ok: true } & BackupPreview);

/** إضافات window التي تضعها ملفات app/ وbridge الخاص بـ Capacitor. */
interface Window {
  ADKAR_CONFIG: AdkarConfig;
  ADKAR_DATA: DhikrData;
  ADKAR_STORAGE: AdkarStorage;
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: {
      Preferences?: {
        get(options: { key: string }): Promise<{ value: string | null }>;
        set(options: { key: string; value: string }): Promise<void>;
        remove(options: { key: string }): Promise<void>;
      };
    };
  };
}

/** طبقة التخزين متاحة كمتغير عام بعد تحميل storage.js. */
declare var ADKAR_STORAGE: AdkarStorage;
