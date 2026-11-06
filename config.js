// إعدادات مشتركة بين theme-init.js وapp.js.
// عدّل القيم هنا فقط حتى لا تختلف نافذة الوقت أو مفاتيح التخزين بين الملفين.
(function () {
  "use strict";

  window.DOUAA_CONFIG = {
    storageKeys: {
      state: "douaa-tracker.v1",
      settings: "douaa-tracker.settings.v1",
    },
    fontSizes: ["small", "medium", "large", "xlarge"],
    themes: ["auto", "time", "morning", "evening"],
    periodWindows: {
      morning: { start: 4, end: 15 },
      evening: { start: 15, end: 4 },
    },
  };
})();
