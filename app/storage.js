// @ts-check
// طبقة تخزين موحّدة: تطبيق «أذكار» يعمل على المتصفح (ويب) وداخل Capacitor (APK).
// المنطق (app.js) لا يعرف أي منصة يعمل عليها؛ يستدعي ADKAR_STORAGE.get/set/remove
// والطبقة تختار الخلفية (localStorage على الويب، Preferences على APK).
// الإعدادات (الثيم وحجم الخط) تبقى في localStorage على كلا المنصتين لأن theme-init.js
// يحتاج قراءة متزامنة قبل أول رسم، ولأن جسر Capacitor قد لا يكون مُحقناً بعد عند تشغيله.
(function () {
  "use strict";

  const isNative = !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === "function" &&
    window.Capacitor.isNativePlatform()
  );

  let backend;

  if (
    isNative &&
    window.Capacitor &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.Preferences
  ) {
    const P = window.Capacitor.Plugins.Preferences;
    backend = {
      isNative: true,
      get: (key) => P.get({ key }).then((result) => {
        if (result && typeof result.value === "string") return result.value;
        return null;
      }),
      set: (key, value) => P.set({ key: key, value: String(value) }),
      remove: (key) => P.remove({ key: key }),
    };
  } else {
    backend = {
      isNative: false,
      get: (key) => {
        try { return Promise.resolve(localStorage.getItem(key)); }
        catch (error) { return Promise.resolve(null); }
      },
      set: (key, value) => {
        try {
          localStorage.setItem(key, value);
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error);
        }
      },
      remove: (key) => {
        try {
          localStorage.removeItem(key);
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error);
        }
      },
    };
  }

  window.ADKAR_STORAGE = backend;
})();