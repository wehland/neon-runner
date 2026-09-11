import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";
const needles = [
  /BEGIN OPENSSH/,
  /API_KEY/,
  /SECRET_KEY/,
  /id_ed25519/,
];

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

const files = walk(dist);
if (files.some((file) => file.endsWith(".map"))) {
  console.error("Source maps must not ship in dist");
  process.exit(1);
}

let failed = false;
for (const file of files) {
  if (!/\.(js|css|html|txt|json|svg)$/i.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const needle of needles) {
    if (needle.test(text)) {
      console.error(`Secret-like pattern ${needle} found in ${file}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);

for (const name of ["bgm.ogg", "jump.ogg", "collect.ogg", "crash.ogg"]) {
  const audioPath = join(dist, "audio", name);
  if (!existsSync(audioPath)) {
    console.error(`Missing dist audio: ${audioPath}`);
    process.exit(1);
  }
}

console.log(`Checked ${files.length} dist files: no secrets, no source maps.`);
