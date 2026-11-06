// يشغّل كل اختبارات tests/ بالتتابع ويتوقف عند أول فشل جماعي.
// الاستخدام: node tests/run.js أو npm test
const path = require("path");
const { spawnSync } = require("child_process");

const TEST_FILES = ["check.js", "sim.js", "pwa.js", "sw.js"];
const failures = [];

TEST_FILES.forEach((file) => {
  console.log(`\n=== ${file} ===`);
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
    stdio: "inherit",
  });
  if (result.status !== 0) failures.push(file);
});

if (failures.length > 0) {
  console.error(`\nFAIL: ${failures.join(", ")}`);
  process.exit(1);
}

console.log(`\nAll ${TEST_FILES.length} test files passed.`);
