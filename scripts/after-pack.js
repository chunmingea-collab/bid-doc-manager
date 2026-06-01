// electron-builder afterPack hook — verifies the bundle is complete enough to ship.
//
// Run automatically after the app is packed but before installers are created.
// Fails the build if any critical resource is missing.

const fs = require("fs");
const path = require("path");

const REQUIRED_RESOURCES = [
  path.join("resources", "prisma", "bid_doc_manager.db"),
  path.join("resources", "paddle-ocr-models", "ch_PP-OCRv4_det_infer"),
  path.join("resources", "paddle-ocr-models", "ch_PP-OCRv4_rec_infer"),
];

const OPTIONAL_BUT_WARN = [
  path.join("resources", "vendor", "paddleocr", "paddleocr_runner.exe"),
];

// Prisma SQLite query engine file — name varies by platform
const PRISMA_ENGINE_GLOBS = [/query_engine.*\.node/, /query_engine.*\.dll/];

function findPrismaEngine(root) {
  // Walk asar-unpacked dir for a query-engine binary
  const unpacked = path.join(root, "app.asar.unpacked");
  if (!fs.existsSync(unpacked)) return null;
  const stack = [unpacked];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (PRISMA_ENGINE_GLOBS.some((re) => re.test(entry.name))) {
        return full;
      }
    }
  }
  return null;
}

exports.default = async function afterPack(context) {
  const appOut = context.appOutDir;
  const missing = [];

  for (const rel of REQUIRED_RESOURCES) {
    const abs = path.join(appOut, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
    }
  }

  for (const rel of OPTIONAL_BUT_WARN) {
    const abs = path.join(appOut, rel);
    if (!fs.existsSync(abs)) {
      console.warn(`[after-pack] WARNING: ${rel} not bundled (OCR will be unavailable).`);
    }
  }

  const enginePath = findPrismaEngine(path.join(appOut, "resources"));
  if (!enginePath) {
    missing.push("prisma query engine (query_engine-*.node)");
  } else {
    console.log(`[after-pack] Prisma engine: ${enginePath}`);
  }

  if (missing.length > 0) {
    throw new Error(
      `[after-pack] Bundle is incomplete. Missing:\n${missing.map((m) => "  - " + m).join("\n")}`,
    );
  }

  console.log("[after-pack] Bundle verification passed.");
};
