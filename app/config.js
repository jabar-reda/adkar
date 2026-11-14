// إعدادات مشتركة بين theme-init.js وapp.js.
// عدّل القيم هنا فقط حتى لا تختلف نافذة الوقت أو مفاتيح التخزين بين الملفين.
(function () {
  "use strict";

  window.DOUAA_CONFIG = {
    // مفاتيح التخزين في localStorage. تغييرهما يجعل بيانات المستخدم القديمة
    // تبدأ من صفر، لأن التطبيق يقرأ البيانات بهذا الاسم بالضبط.
    storageKeys: {
      state: "douaa-tracker.v1", // تقدم الأذكار لكل يوم (تاريخ -> حالات)
      settings: "douaa-tracker.settings.v1", // الثيم وحجم الخط وتاريخ النسخ الاحتياطي
    },
    // أحجام خط الأذكار المتاحة في الإعدادات؛ "medium" هو الافتراضي.
    fontSizes: ["small", "medium", "large", "xlarge"],
    // أنماط الثيم: "auto" يتبع القسم النشط، "time" يتبع الساعة،
    // و"morning"/"evening" يثبّتان الثيم يدوياً.
    themes: ["auto", "time", "morning", "evening"],
    // نافذة زمن كل قسم بالساعات (من 24 ساعة): نافذة المساء تعبر منتصف الليل
    // فتمتد من 15:00 حتى 04:00 من اليوم التالي.
    periodWindows: {
      morning: { start: 4, end: 15 },
      evening: { start: 15, end: 4 },
    },
  };
})();
