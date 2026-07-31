import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "public");
const output = path.join(root, "dist");
const required = ["index.html", "styles.css", "sw.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "js/app.js", "js/data-model.js", "js/crypto-vault.js", "js/webauthn-client.js"];
const forbiddenPatterns = [
  /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /Kalle/i,
  /Diazepam/i,
  /Kokain/i,
  /75\s*(?:kg)?\s*(?:auf|bis)\s*85/i
];

await fs.rm(output, { recursive: true, force: true });
await fs.cp(source, output, { recursive: true });

for (const file of required) await fs.access(path.join(output, file));
JSON.parse(await fs.readFile(path.join(output, "manifest.webmanifest"), "utf8"));

async function filesUnder(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? filesUnder(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
  return nested.flat();
}

for (const file of await filesUnder(output)) {
  if (!/\.(?:html|js|css|json|webmanifest|svg)$/i.test(file)) continue;
  const content = await fs.readFile(file, "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) throw new Error(`Privacy build check failed in ${path.relative(root, file)} (${pattern})`);
  }
}

console.log(JSON.stringify({ event: "build_complete", output: "dist", version: "1.0.0" }));
