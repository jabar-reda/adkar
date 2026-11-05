// تسجيل Service Worker وزر تثبيت التطبيق، مستقل عن منطق الأذكار في app.js.
(function () {
  "use strict";

  const INSTALL_BUTTON_ID = "install-app";
  const INSTALL_NOTE_ID = "install-note";
  const SW_URL = "sw.js";

  const installButton = document.getElementById(INSTALL_BUTTON_ID);
  const installNote = document.getElementById(INSTALL_NOTE_ID);

  let installPrompt = null;

  function setNote(message) {
    if (installNote) installNote.textContent = message;
  }

  function showInstallButton() {
    if (installButton) installButton.hidden = false;
  }

  function hideInstallButton() {
    if (installButton) installButton.hidden = true;
  }

  function isStandalone() {
    const matchesStandalone =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches;
    return matchesStandalone || window.navigator.standalone === true;
  }

  function isIos() {
    const userAgent = window.navigator.userAgent || "";
    if (/iphone|ipad|ipod/i.test(userAgent)) return true;
    // iPadOS 13 وما بعده يقدّم نفسه كـ Mac، ونميّزه بوجود شاشة لمس.
    return /macintosh/i.test(userAgent) && window.navigator.maxTouchPoints > 1;
  }

  const hasServiceWorker = Boolean(window.navigator.serviceWorker);

  // Service Worker يعمل فقط عبر https أو localhost، لا عبر فتح الملف مباشرة.
  const isSupportedProtocol =
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1";

  const canUseServiceWorker = hasServiceWorker && isSupportedProtocol;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    showInstallButton();
    setNote("ثبّت التطبيق على جهازك ليعمل بدون إنترنت.");
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    hideInstallButton();
    setNote("التطبيق مثبَّت على هذا الجهاز ويعمل بدون إنترنت.");
  });

  if (installButton) {
    installButton.addEventListener("click", () => {
      if (!installPrompt) return;

      const prompt = installPrompt;
      installPrompt = null;
      prompt.prompt();
      prompt.userChoice
        .then((choice) => {
          hideInstallButton();
          setNote(
            choice && choice.outcome === "accepted"
              ? "تم تثبيت التطبيق. افتحه من الشاشة الرئيسية."
              : "لم يكتمل التثبيت، ويمكنك المحاولة من قائمة المتصفح."
          );
        })
        .catch(() => {
          hideInstallButton();
          setNote("لم يكتمل التثبيت، ويمكنك المحاولة من قائمة المتصفح.");
        });
    });
  }

  if (isStandalone()) {
    hideInstallButton();
    setNote("أنت تستخدم التطبيق المثبَّت، ويعمل بدون إنترنت.");
  } else if (isIos()) {
    hideInstallButton();
    setNote("للتثبيت على iPhone أو iPad: زر المشاركة ← إضافة إلى الشاشة الرئيسية.");
  } else if (!hasServiceWorker) {
    hideInstallButton();
    setNote("هذا المتصفح لا يدعم تثبيت التطبيقات.");
  } else if (!isSupportedProtocol) {
    hideInstallButton();
    setNote("التثبيت متاح عند فتح التطبيق من موقعه على GitHub Pages، وليس من ملف محلي.");
  } else {
    setNote("إن لم يظهر زر التثبيت، استخدم قائمة المتصفح ← تثبيت التطبيق.");
  }

  if (!canUseServiceWorker) return;

  window.addEventListener("load", () => {
    window.navigator.serviceWorker.register(SW_URL).catch(() => {
      setNote("تعذّر تجهيز العمل بدون إنترنت على هذا المتصفح.");
    });
  });
})();
