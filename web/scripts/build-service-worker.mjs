#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function buildFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await buildFiles(path.join(directory, entry.name), relativePath));
    else if (entry.isFile() && relativePath !== "sw.js") files.push(relativePath);
    else if (!entry.isFile()) throw new Error(`Build output contains a non-regular entry: ${relativePath}`);
  }
  return files.sort();
}

export async function buildServiceWorker({
  distRoot = path.join(webRoot, "dist"),
  templatePath = path.join(webRoot, "public/sw.js"),
  verifyOnly = false,
} = {}) {
  const template = await readFile(templatePath, "utf8");
  if (!template.includes('"__BUILD_VERSION__"') || !template.includes("__PRECACHE_URLS__")) {
    throw new Error("Service worker template is missing its build markers.");
  }
  const files = await buildFiles(distRoot);
  for (const required of ["index.html", "manifest.webmanifest", "icons/pwa-192.png", "icons/pwa-512.png"]) {
    if (!files.includes(required)) throw new Error(`Service worker build is missing ${required}.`);
  }
  const hash = createHash("sha256").update(template);
  for (const file of files) {
    const bytes = await readFile(path.join(distRoot, file));
    hash.update(`\0${file}\0${bytes.length}\0`).update(bytes);
  }
  const buildVersion = hash.digest("hex").slice(0, 24);
  // Cache the small shell and code for offline routes. Pack artwork stays on demand.
  const shell = ["/", ...files
    .filter((file) => file === "manifest.webmanifest" || file.startsWith("icons/") || file.startsWith("assets/"))
    .map((file) => `/${file}`)];
  const serviceWorker = template
    .replace('"__BUILD_VERSION__"', JSON.stringify(buildVersion))
    .replace("__PRECACHE_URLS__", JSON.stringify(shell));
  const outputPath = path.join(distRoot, "sw.js");
  if (verifyOnly) {
    if (await readFile(outputPath, "utf8") !== serviceWorker) {
      throw new Error("Built service worker does not match the current release content.");
    }
  } else {
    await writeFile(outputPath, serviceWorker);
  }
  return { buildVersion, precacheCount: shell.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildServiceWorker({ verifyOnly: process.argv.includes("--verify") });
  console.log(`Verified service worker ${result.buildVersion} with ${result.precacheCount} shell resources.`);
}
