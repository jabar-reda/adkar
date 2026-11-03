// يضبط الألوان وحجم الخط قبل رسم الصفحة، حتى لا تومض القيم الافتراضية.
// المفتاح والساعات هنا مطابقان لـ SETTINGS_KEY و PERIOD_WINDOWS في السكربت الرئيسي.
(function () {
  var settings = {};
  try {
    settings = JSON.parse(localStorage.getItem("douaa-tracker.settings.v1")) || {};
  } catch (error) {
    settings = {};
  }

  var hour = new Date().getHours();
  var autoPeriod = hour >= 4 && hour < 15 ? "morning" : "evening";
  var theme = settings.theme;
  // الثيم التلقائي والثيم حسب الوقت يبدآن من الساعة، ثم يتبع "auto" القسم النشط بعد التحميل.
  var period = theme === "morning" || theme === "evening" ? theme : autoPeriod;
  var sizes = ["small", "medium", "large", "xlarge"];
  var fontSize = sizes.indexOf(settings.fontSize) >= 0 ? settings.fontSize : "medium";

  document.documentElement.dataset.period = period;
  document.documentElement.dataset.fontSize = fontSize;
})();
