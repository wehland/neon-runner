import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

if (!existsSync(dist)) {
  console.error("missing dist/");
  process.exit(1);
}

const files = walk(dist);
let failed = false;

if (files.some((file) => file.endsWith(".map"))) {
  console.error("Source maps must not ship in dist");
  failed = true;
}

const htmlJs = files.filter((file) => /\.(html|js)$/i.test(file));
for (const file of htmlJs) {
  const text = readFileSync(file, "utf8");
  if (text.includes("__NEON_RUNNER__")) {
    console.error(`E2E instrumentation present in production bundle: ${file}`);
    failed = true;
  }
  if (text.includes("sourceMappingURL")) {
    console.error(`sourceMappingURL present in ${file}`);
    failed = true;
  }
}

const html = readFileSync(join(dist, "index.html"), "utf8");
if (/<script[^>]+src=["']https?:\/\//i.test(html)) {
  console.error("index.html hot-links an external script");
  failed = true;
}

if (!existsSync(join(dist, "audio", "bgm.ogg"))) {
  console.error("missing local audio in dist");
  failed = true;
}

if (failed) process.exit(1);
console.log(`Production build checks passed (${files.length} files).`);
