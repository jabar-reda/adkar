// يضبط الألوان وحجم الخط قبل رسم الصفحة، حتى لا تومض القيم الافتراضية.
// القيم المشتركة تأتي من config.js المحمّل قبله في index.html.
(function () {
  var config = window.DOUAA_CONFIG || {};
  var storageKeys = config.storageKeys || {};
  var settingsKey = storageKeys.settings || "douaa-tracker.settings.v1";
  var sizes = config.fontSizes || ["small", "medium", "large", "xlarge"];
  var windows = config.periodWindows || {
    morning: { start: 4, end: 15 },
    evening: { start: 15, end: 4 },
  };

  var settings = {};
  try {
    settings = JSON.parse(localStorage.getItem(settingsKey)) || {};
  } catch (error) {
    settings = {};
  }

  var morning = windows.morning;
  var hour = new Date().getHours();
  var autoPeriod = hour >= morning.start && hour < morning.end ? "morning" : "evening";
  var theme = settings.theme;
  // الثيم التلقائي والثيم حسب الوقت يبدآن من الساعة، ثم يتبع "auto" القسم النشط بعد التحميل.
  var period = theme === "morning" || theme === "evening" ? theme : autoPeriod;
  var fontSize = sizes.indexOf(settings.fontSize) >= 0 ? settings.fontSize : "medium";

  document.documentElement.dataset.period = period;
  document.documentElement.dataset.fontSize = fontSize;
})();

