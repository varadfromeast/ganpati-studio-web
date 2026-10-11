#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.resolve(webRoot, "../assets/runtime-packs");
const outputRoot = path.resolve(webRoot, "dist/packs");
const manifestName = "manifest.v2.json";
const allowedPackName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const releasePacks = ["bal-dancing-geometry-v1", "bal-seated-crowns-v2"];

function validateAssetPath(value, expectedDirectory, context) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty path.`);
  }
  if (
    value.includes("\\")
    || value.includes("?")
    || value.includes("#")
    || !/^(?:layers|thumbnails)\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(?:avif|jpe?g|png|webp)$/.test(value)
    || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || !value.startsWith(`${expectedDirectory}/`)
    || value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${context} is not a safe ${expectedDirectory} path: ${JSON.stringify(value)}`);
  }
  return value;
}

async function assertRegularFileInsidePack(packRoot, relativePath) {
  const sourcePath = path.resolve(packRoot, ...relativePath.split("/"));
  const packPrefix = `${packRoot}${path.sep}`;
  if (!sourcePath.startsWith(packPrefix)) {
    throw new Error(`Asset escapes its runtime pack: ${relativePath}`);
  }

  let sourceStat;
  try {
    sourceStat = await lstat(sourcePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Manifest references a missing asset: ${relativePath}`);
    }
    throw error;
  }
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`Manifest asset must be a regular file: ${relativePath}`);
  }

  const canonicalSource = await realpath(sourcePath);
  if (!canonicalSource.startsWith(packPrefix)) {
    throw new Error(`Asset resolves outside its runtime pack: ${relativePath}`);
  }
  return sourcePath;
}

async function loadPack(sourceDirectory, packName) {
  if (!allowedPackName.test(packName)) {
    throw new Error(`Invalid runtime pack directory name: ${JSON.stringify(packName)}`);
  }

  const packRoot = path.join(sourceDirectory, packName);
  const packStat = await lstat(packRoot);
  if (!packStat.isDirectory() || packStat.isSymbolicLink()) {
    throw new Error(`${packName} must be a regular directory.`);
  }
  const manifestPath = path.join(packRoot, manifestName);
  const manifestStat = await lstat(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
    throw new Error(`${packName}/${manifestName} must be a regular file.`);
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse ${packName}/${manifestName}: ${error.message}`);
  }
  if (manifest?.schemaVersion !== 2 || !Array.isArray(manifest.layers) || !Array.isArray(manifest.optionGroups)) {
    throw new Error(`${packName}/${manifestName} is not a supported runtime manifest.`);
  }

  const references = new Set([manifestName]);
  for (const [index, layer] of manifest.layers.entries()) {
    references.add(validateAssetPath(layer?.file, "layers", `${packName} layer ${index}`));
  }
  for (const [index, option] of manifest.optionGroups.entries()) {
    references.add(validateAssetPath(option?.thumbnail, "thumbnails", `${packName} option ${index}`));
  }

  const files = [];
  for (const relativePath of [...references].sort()) {
    const sourcePath = relativePath === manifestName
      ? manifestPath
      : await assertRegularFileInsidePack(packRoot, relativePath);
    files.push({ relativePath, sourcePath });
  }
  return { packName, files };
}

async function discoverPacks(sourceDirectory, requiredPacks) {
  if (requiredPacks.length === 0) throw new Error("No release packs were specified.");
  return Promise.all([...new Set(requiredPacks)].sort().map((name) => loadPack(sourceDirectory, name)));
}

async function digest(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function listFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolutePath, relativePath));
    else if (entry.isFile() && !entry.isSymbolicLink()) files.push(relativePath);
    else throw new Error(`Staged packs contain a non-regular entry: ${relativePath}`);
  }
  return files;
}

async function verify(packs, outputDirectory) {
  const expected = packs.flatMap(({ packName, files }) => (
    files.map(({ relativePath }) => `${packName}/${relativePath}`)
  )).sort();
  const actual = (await listFiles(outputDirectory)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const unexpected = actual.filter((file) => !expected.includes(file));
    const missing = expected.filter((file) => !actual.includes(file));
    throw new Error(`Staged pack allowlist mismatch. Missing: ${missing.join(", ") || "none"}. Unexpected: ${unexpected.join(", ") || "none"}.`);
  }

  for (const { packName, files } of packs) {
    for (const { relativePath, sourcePath } of files) {
      const outputPath = path.join(outputDirectory, packName, ...relativePath.split("/"));
      if (await digest(sourcePath) !== await digest(outputPath)) {
        throw new Error(`Staged asset bytes differ from source: ${packName}/${relativePath}`);
      }
    }
  }
}

async function stage(packs, outputDirectory) {
  const stagingRoot = `${outputDirectory}.staging-${process.pid}`;
  await rm(stagingRoot, { recursive: true, force: true });
  try {
    for (const { packName, files } of packs) {
      for (const { relativePath, sourcePath } of files) {
        const outputPath = path.join(stagingRoot, packName, ...relativePath.split("/"));
        await mkdir(path.dirname(outputPath), { recursive: true });
        await copyFile(sourcePath, outputPath);
      }
    }
    await rm(outputDirectory, { recursive: true, force: true });
    await rename(stagingRoot, outputDirectory);
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function stageRuntimePacks({
  sourceDirectory = sourceRoot,
  outputDirectory = outputRoot,
  requiredPacks = releasePacks,
  verifyOnly = false,
} = {}) {
  const canonicalSource = await realpath(sourceDirectory);
  const packs = await discoverPacks(canonicalSource, requiredPacks);
  if (!verifyOnly) await stage(packs, outputDirectory);
  await verify(packs, outputDirectory);
  return { fileCount: packs.reduce((count, pack) => count + pack.files.length, 0), packCount: packs.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { fileCount, packCount } = await stageRuntimePacks({ verifyOnly: process.argv.includes("--verify") });
  console.log(`Verified ${fileCount} allowlisted runtime files across ${packCount} packs.`);
}
