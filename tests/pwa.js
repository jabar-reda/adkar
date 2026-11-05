const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "pwa.js"), "utf8");

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}`);
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = true;
    this.textContent = "";
    this.listeners = {};
  }
  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }
  click() {
    (this.listeners.click || []).forEach((handler) => handler({}));
  }
}

function createEnvironment(options = {}) {
  const {
    protocol = "https:",
    hostname = "jabar-reda.github.io",
    userAgent = "Mozilla/5.0 Chrome/126",
    standalone = false,
    hasServiceWorker = true,
    maxTouchPoints = 0,
  } = options;

  const registrations = [];
  const installPrompts = [];
  const elements = {
    "install-app": new FakeElement("install-app"),
    "install-note": new FakeElement("install-note"),
  };
  const windowListeners = {};

  const navigatorObject = {
    userAgent,
    standalone,
    maxTouchPoints,
  };

  if (hasServiceWorker) {
    navigatorObject.serviceWorker = {
      register(url) {
        registrations.push(url);
        return Promise.resolve();
      },
    };
  }

  const windowObject = {
    navigator: navigatorObject,
    matchMedia: (query) => ({ matches: standalone && query.includes("display-mode") }),
    addEventListener(type, handler) {
      if (!windowListeners[type]) windowListeners[type] = [];
      windowListeners[type].push(handler);
    },
  };

  const documentObject = {
    getElementById: (id) => elements[id] || null,
  };

  vm.runInNewContext(
    source,
    {
      window: windowObject,
      navigator: navigatorObject,
      document: documentObject,
      location: { protocol, hostname },
      console,
    },
    { filename: "pwa.js" }
  );

  return {
    elements,
    registrations,
    installPrompts,
    dispatch(type, event = {}) {
      (windowListeners[type] || []).forEach((handler) => handler(event));
    },
    makeInstallEvent(outcome) {
      const event = {
        preventDefault() {
          event.prevented = true;
        },
        prompt() {
          event.prompted = true;
        },
        userChoice: Promise.resolve({ outcome }),
      };
      return event;
    },
  };
}

async function main() {
  /* ===== التسجيل ===== */
  const httpsEnvironment = createEnvironment();
  check("https: registration waits for the load event", httpsEnvironment.registrations.length === 0);
  httpsEnvironment.dispatch("load");
  await flush();
  check("https: registers sw.js", httpsEnvironment.registrations[0] === "sw.js");

  const localEnvironment = createEnvironment({ protocol: "http:", hostname: "localhost" });
  localEnvironment.dispatch("load");
  await flush();
  check("localhost registers sw.js", localEnvironment.registrations[0] === "sw.js");

  const fileEnvironment = createEnvironment({ protocol: "file:", hostname: "" });
  fileEnvironment.dispatch("load");
  await flush();
  check("file:// does not register a service worker", fileEnvironment.registrations.length === 0);
  check(
    "file:// explains that installation needs hosting",
    fileEnvironment.elements["install-note"].textContent.includes("GitHub Pages")
  );

  const unsupportedEnvironment = createEnvironment({ hasServiceWorker: false });
  unsupportedEnvironment.dispatch("load");
  await flush();
  check("browser without service worker does not register", unsupportedEnvironment.registrations.length === 0);
  check(
    "browser without service worker gets a clear note",
    unsupportedEnvironment.elements["install-note"].textContent.includes("لا يدعم")
  );

  /* ===== زر التثبيت ===== */
  const installEnvironment = createEnvironment();
  const acceptedEvent = installEnvironment.makeInstallEvent("accepted");
  installEnvironment.dispatch("beforeinstallprompt", acceptedEvent);
  check("beforeinstallprompt is intercepted", acceptedEvent.prevented === true);
  check("install button is revealed", installEnvironment.elements["install-app"].hidden === false);

  installEnvironment.elements["install-app"].click();
  check("clicking the button opens the install prompt", acceptedEvent.prompted === true);
  await flush();
  check("install button hides after accepting", installEnvironment.elements["install-app"].hidden === true);
  check(
    "note confirms the installation",
    installEnvironment.elements["install-note"].textContent.includes("تم تثبيت")
  );

  const dismissedEnvironment = createEnvironment();
  const dismissedEvent = dismissedEnvironment.makeInstallEvent("dismissed");
  dismissedEnvironment.dispatch("beforeinstallprompt", dismissedEvent);
  dismissedEnvironment.elements["install-app"].click();
  await flush();
  check(
    "dismissed installation shows a retry note",
    dismissedEnvironment.elements["install-note"].textContent.includes("لم يكتمل")
  );

  const installedEnvironment = createEnvironment();
  installedEnvironment.dispatch("beforeinstallprompt", installedEnvironment.makeInstallEvent("accepted"));
  installedEnvironment.dispatch("appinstalled");
  check("appinstalled hides the button", installedEnvironment.elements["install-app"].hidden === true);
  check(
    "appinstalled confirms the install",
    installedEnvironment.elements["install-note"].textContent.includes("مثبَّت")
  );

  /* ===== الحالات الخاصة ===== */
  const iosEnvironment = createEnvironment({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  });
  check("iOS keeps the install button hidden", iosEnvironment.elements["install-app"].hidden === true);
  check(
    "iOS shows home-screen instructions",
    iosEnvironment.elements["install-note"].textContent.includes("إضافة إلى الشاشة الرئيسية")
  );

  const ipadEnvironment = createEnvironment({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    maxTouchPoints: 5,
  });
  check(
    "iPadOS is treated as iOS",
    ipadEnvironment.elements["install-note"].textContent.includes("إضافة إلى الشاشة الرئيسية")
  );

  const macEnvironment = createEnvironment({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  });
  check(
    "a real Mac is not treated as iOS",
    !macEnvironment.elements["install-note"].textContent.includes("إضافة إلى الشاشة الرئيسية")
  );

  const standaloneEnvironment = createEnvironment({ standalone: true });
  check("installed app keeps the button hidden", standaloneEnvironment.elements["install-app"].hidden === true);
  check(
    "installed app explains it already runs offline",
    standaloneEnvironment.elements["install-note"].textContent.includes("بدون إنترنت")
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
