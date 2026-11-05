const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
const ORIGIN = "https://example.com";
const CACHE_NAME = "douaa-tracker-shell-v1";
const OLD_CACHE_NAME = "douaa-tracker-shell-v0";

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
const absolute = (file) => new URL(file, `${ORIGIN}/douaa-tracker/`).href;

function fakeResponse() {
  return { ok: true, clone: () => fakeResponse() };
}

function createEnvironment() {
  const listeners = {};
  const cacheStore = new Map();
  const cacheNames = [CACHE_NAME, OLD_CACHE_NAME];
  const deletedCaches = [];
  let fetchCount = 0;
  let skipsWaiting = false;
  let claimsClients = false;
  let offline = false;

  const fakeCache = {
    addAll(files) {
      files.forEach((file) => cacheStore.set(absolute(file), fakeResponse()));
      return Promise.resolve();
    },
    put(request, response) {
      cacheStore.set(typeof request === "string" ? absolute(request) : request.url, response);
      return Promise.resolve();
    },
  };

  const caches = {
    open: () => Promise.resolve(fakeCache),
    keys: () => Promise.resolve(cacheNames.slice()),
    delete(name) {
      deletedCaches.push(name);
      return Promise.resolve(true);
    },
    match(request) {
      const key = typeof request === "string" ? absolute(request) : request.url;
      return Promise.resolve(cacheStore.get(key));
    },
  };

  const fetch = (request) => {
    fetchCount += 1;
    if (offline) return Promise.reject(new Error("offline"));
    return Promise.resolve(fakeResponse());
  };

  const self = {
    location: { origin: ORIGIN },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    skipWaiting() {
      skipsWaiting = true;
      return Promise.resolve();
    },
    clients: {
      claim() {
        claimsClients = true;
        return Promise.resolve();
      },
    },
  };

  vm.runInNewContext(source, {
    self,
    caches,
    fetch,
    URL,
    Response: { error: () => ({ ok: false, isError: true }) },
  });

  async function runLifecycle(type) {
    const waits = [];
    listeners[type]({ waitUntil: (promise) => waits.push(promise) });
    await Promise.all(waits);
  }

  async function request(request) {
    let responded = null;
    listeners.fetch({ request, respondWith: (promise) => (responded = promise) });
    if (!responded) return null;
    return responded;
  }

  return {
    runLifecycle,
    request,
    cacheStore,
    deletedCaches,
    getFetchCount: () => fetchCount,
    didSkipWaiting: () => skipsWaiting,
    didClaimClients: () => claimsClients,
    setOffline: (value) => {
      offline = value;
    },
    seed(file) {
      cacheStore.set(absolute(file), fakeResponse());
    },
  };
}

function navigationRequest() {
  return { method: "GET", mode: "navigate", url: absolute("index.html") };
}

function fontRequest() {
  return { method: "GET", mode: "no-cors", url: absolute("fonts/amiri-400-arabic.woff2") };
}

async function main() {
  const environment = createEnvironment();
  await environment.runLifecycle("install");
  check("install caches the whole shell", environment.cacheStore.size === 21);
  check("install activates the new worker immediately", environment.didSkipWaiting() === true);

  await environment.runLifecycle("activate");
  check("activate deletes old caches", environment.deletedCaches.includes(OLD_CACHE_NAME));
  check("activate keeps the current cache", !environment.deletedCaches.includes(CACHE_NAME));
  check("activate takes control of open pages", environment.didClaimClients() === true);

  /* ===== ملفات التطبيق: الشبكة أولاً ===== */
  const onlineEnvironment = createEnvironment();
  await onlineEnvironment.runLifecycle("install");
  await onlineEnvironment.request(navigationRequest());
  await flush();
  check("online navigation uses the network", onlineEnvironment.getFetchCount() === 1);
  check(
    "online navigation refreshes the cached page",
    onlineEnvironment.cacheStore.has(absolute("index.html"))
  );

  const offlineNavigation = createEnvironment();
  await offlineNavigation.runLifecycle("install");
  offlineNavigation.setOffline(true);
  const fallback = await offlineNavigation.request(navigationRequest());
  check("offline navigation returns the cached page", Boolean(fallback) && fallback.ok === true);

  const offlineWithoutCache = createEnvironment();
  await offlineWithoutCache.runLifecycle("install");
  offlineWithoutCache.setOffline(true);
  const missingPage = await offlineWithoutCache.request({
    method: "GET",
    mode: "navigate",
    url: absolute("unknown-page.html"),
  });
  check("offline navigation falls back to index.html", Boolean(missingPage) && missingPage.ok === true);

  /* ===== الخطوط والأيقونات: الكاش أولاً ===== */
  const cachedFontEnvironment = createEnvironment();
  await cachedFontEnvironment.runLifecycle("install");
  cachedFontEnvironment.setOffline(true);
  const cachedFont = await cachedFontEnvironment.request(fontRequest());
  check("cached font is served offline", Boolean(cachedFont) && cachedFont.ok === true);
  check("cached font needs no network", cachedFontEnvironment.getFetchCount() === 0);

  const newFontEnvironment = createEnvironment();
  await newFontEnvironment.runLifecycle("install");
  const newFontFile = "fonts/amiri-700-latin.woff2";
  const newFont = await newFontEnvironment.request({
    method: "GET",
    mode: "no-cors",
    url: absolute(newFontFile),
  });
  await flush();
  check("uncached font is fetched", Boolean(newFont) && newFontEnvironment.getFetchCount() === 1);
  check(
    "fetched font is stored for offline use",
    newFontEnvironment.cacheStore.has(absolute(newFontFile))
  );

  /* ===== الطلبات المستثناة ===== */
  const ignoredEnvironment = createEnvironment();
  const ignoredPost = await ignoredEnvironment.request({
    method: "POST",
    mode: "no-cors",
    url: absolute("app.js"),
  });
  check("non-GET requests are ignored", ignoredPost === null);

  const crossOrigin = await ignoredEnvironment.request({
    method: "GET",
    mode: "no-cors",
    url: "https://fonts.example.com/font.woff2",
  });
  check("cross-origin requests are ignored", crossOrigin === null);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
