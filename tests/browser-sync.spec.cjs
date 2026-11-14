const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function main() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
    const relative = pathname === "/" ? "/index.html" : pathname;
    const file = path.resolve(ROOT, "." + relative);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (error, content) => {
      if (error) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      response.end(content);
    });
  });

  await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const original = JSON.stringify({ schemaVersion: 2, days: {}, stats: { bestStreak: 0 } });

    await page.goto("http://127.0.0.1:4173/index.html");
    await page.evaluate((value) => localStorage.setItem("adkar.v1", value), original);
    await page.goto("http://127.0.0.1:4173/tests/cross-tab-sync.html");

    await page.waitForFunction(() => {
      const result = document.getElementById("result");
      return result && ["passed", "failed"].includes(result.dataset.result);
    }, { timeout: 10000 });

    const result = await page.locator("#result").textContent();
    const restored = await page.evaluate(() => localStorage.getItem("adkar.v1"));
    if (!(await page.locator("#result").getAttribute("data-result") === "passed")) {
      throw new Error(result || "Two-context browser synchronization failed");
    }
    if (restored !== original) {
      throw new Error("The browser fixture did not restore the pre-existing progress snapshot");
    }
    process.stdout.write("PASS two independent browser contexts preserve both concurrent updates\n");
    process.stdout.write("PASS browser fixture restores the original progress snapshot\n");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
