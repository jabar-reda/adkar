// يضبط الألوان وحجم الخط قبل رسم الصفحة، حتى لا تومض القيم الافتراضية.
// القيم المشتركة تأتي من config.js المحمّل قبله في index.html.
(function () {
  var config = window.ADKAR_CONFIG || {};
  var storageKeys = config.storageKeys || {};
  var settingsKey = storageKeys.settings || "adkar.settings.v1";
  var sizes = config.fontSizes || ["small", "medium", "large", "xlarge"];
  var windows = config.periodWindows || {
    morning: { start: 4, end: 15 },
    evening: { start: 15, end: 4 },
  };

  var settings = {};
  // قد يكون التخزين فارغاً أو مرفوعاً (وضع خاص في المتصفح)، فنبدأ بقيم فارغة بدل التعطل.
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

  // ضبط data-period وdata-font-size على عنصر html هنا يلغي "وميض" الثيم
  // الافتراضي، لأن CSS يقرأ هذه الخاصيتين عند أول رسم.
  document.documentElement.dataset.period = period;
  document.documentElement.dataset.fontSize = fontSize;

  // لون شريط المتصفح/النظام يتبع الثيم النشط، ويمنع وميض لون خاطئ.
  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", period === "evening" ? "#0f1523" : "#0d6a4d");
  }
})();

