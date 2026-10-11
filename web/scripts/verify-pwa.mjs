#!/usr/bin/env node

import { buildServiceWorker } from "./build-service-worker.mjs";
import { readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, "..");
const publicRoot = path.join(webRoot, "public");
const distRoot = path.join(webRoot, "dist");

const iconExpectations = new Map([
  ["icons/favicon-32.png", 32],
  ["icons/apple-touch-icon-180.png", 180],
  ["icons/pwa-192.png", 192],
  ["icons/pwa-512.png", 512],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readPngSize(filePath) {
  const bytes = await readFile(filePath);
  assert(bytes.subarray(1, 4).toString("ascii") === "PNG", `${filePath} is not a PNG.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

for (const [relativePath, expectedSize] of iconExpectations) {
  const publicPath = path.join(publicRoot, relativePath);
  const stat = await lstat(publicPath);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${relativePath} must be a regular file.`);
  const size = await readPngSize(publicPath);
  assert(size.width === expectedSize && size.height === expectedSize, `${relativePath} must be ${expectedSize}x${expectedSize}.`);
  const distSize = await readPngSize(path.join(distRoot, relativePath));
  assert(distSize.width === expectedSize && distSize.height === expectedSize, `Built ${relativePath} has the wrong size.`);
}

const manifest = JSON.parse(await readFile(path.join(publicRoot, "manifest.webmanifest"), "utf8"));
assert(Array.isArray(manifest.icons) && manifest.icons.length === 2, "The PWA manifest must declare the two right-sized install icons.");
assert(manifest.icons.every((icon) => icon.purpose === "any"), "Icon purpose must not claim unsupported maskable safe-area artwork.");
for (const icon of manifest.icons) {
  const relativePath = icon.src.replace(/^\//, "");
  assert(iconExpectations.has(relativePath), `Unexpected manifest icon: ${icon.src}`);
  assert(icon.sizes === `${iconExpectations.get(relativePath)}x${iconExpectations.get(relativePath)}`, `Incorrect sizes metadata for ${icon.src}.`);
}

const html = await readFile(path.join(webRoot, "index.html"), "utf8");
assert(!html.includes("/app-icon.png"), "index.html still references the oversized legacy icon.");
assert(html.includes('/icons/favicon-32.png'), "index.html is missing the favicon.");
assert(html.includes('/icons/apple-touch-icon-180.png'), "index.html is missing the Apple touch icon.");

const sw = await readFile(path.join(publicRoot, "sw.js"), "utf8");
await buildServiceWorker({ verifyOnly: true });

assert(sw.includes('url.origin !== self.location.origin'), "The service worker must reject cross-origin requests.");
assert(sw.includes('event.request.method !== "GET"'), "The service worker must reject non-GET requests.");
assert(sw.includes('url.search !== ""'), "The service worker must not cache signed or query-bearing URLs.");
assert(sw.includes('url.pathname === "/manifest.webmanifest"'), "The web app manifest must use network-first caching.");
assert(!sw.includes("/app-icon.png"), "The service worker still references the oversized legacy icon.");

console.log("Verified PWA icons, metadata, and cache safety invariants.");
