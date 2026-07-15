import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const sourceRepo = process.env.AOL_SOURCE_REPO || "D:/AOL-Progz-Source";
const scanLimit = Number(process.env.AOL_URL_SCAN_LIMIT || 250);
const scanTimeoutMs = Number(process.env.AOL_URL_SCAN_TIMEOUT_MS || 5000);
const scanRepoText = process.env.AOL_SCAN_REPO_TEXT !== "0";
const catalogPath = path.join(rootDir, "data", "catalog.js");
const indexJsonPath = path.join(rootDir, "data", "url-index.json");
const indexJsPath = path.join(rootDir, "data", "url-index.js");

function readCatalog() {
  const text = readFileSync(catalogPath, "utf8")
    .replace(/^window\.AOL_PROGZ_DATA\s*=\s*/, "")
    .replace(/;\s*$/, "");
  return JSON.parse(text);
}

function readExistingIndex() {
  if (!existsSync(indexJsonPath)) {
    return { generatedAt: "", perProgram: {}, global: [], repoText: [] };
  }
  try {
    return JSON.parse(readFileSync(indexJsonPath, "utf8"));
  } catch {
    return { generatedAt: "", perProgram: {}, global: [], repoText: [] };
  }
}

function cleanUrl(raw) {
  let value = String(raw || "")
    .trim()
    .split(/[\x00-\x1f\x7f]/)[0]
    .replace(/^["'(<\[]+/, "")
    .replace(/[>"')\].,;:!?]+$/g, "");
  value = value.replace(/&amp;/g, "&");
  if (value.length > 300 || /[^\x20-\x7e]/.test(value)) return "";
  if (/^www\./i.test(value)) value = `http://${value}`;
  if (!/^(https?|ftp):\/\//i.test(value)) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return value;
  }
}

function isUsefulUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (["localhost", "linux"].includes(host)) return false;
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

function urlKey(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }
    parsed.pathname = parsed.pathname
      .replace(/\/(?:index|default|home)\.(?:html?|php|asp)$/i, "/")
      .replace(/\/+$/g, "/");
    return parsed.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

function extractUrls(text) {
  const found = [];
  const regex = /\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>"'`]+/gi;
  for (const match of String(text || "").matchAll(regex)) {
    const cleaned = cleanUrl(match[0]);
      if (isUsefulUrl(cleaned)) found.push(cleaned);
  }
  return found;
}

function listArchiveEntries(archivePath) {
  const result = spawnSync("tar", ["-tf", archivePath], {
    encoding: "utf8",
    timeout: scanTimeoutMs,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isTextLikeEntry(entry) {
  const lower = entry.toLowerCase();
  if (/[\/\\]$/.test(lower)) return false;
  if (/(readme|site|url|link|home|web|author|about|install|license|nfo|diz)/.test(lower)) {
    return true;
  }
  return /\.(txt|text|nfo|diz|url|ini|cfg|log|md|htm|html|bas|frm|vbp|cls|ctl|pag|asp)$/i.test(lower);
}

function extractArchiveEntry(archivePath, entry) {
  const result = spawnSync("tar", ["-xOf", archivePath, entry], {
    encoding: "utf8",
    timeout: scanTimeoutMs,
    maxBuffer: 1024 * 1024 * 2,
  });
  if (result.status !== 0 || result.error) return "";
  return result.stdout || "";
}

function scanArchive(program) {
  const localPath = program.download?.path ? path.join(rootDir, program.download.path) : "";
  if (!localPath || !existsSync(localPath)) {
    return { urls: [], scanned: false, reason: "no-local-file" };
  }
  if (!/\.(zip|jar)$/i.test(localPath)) {
    return { urls: [], scanned: false, reason: "unsupported-archive-type" };
  }
  const entries = listArchiveEntries(localPath).filter(isTextLikeEntry).slice(0, 24);
  const seen = new Set();
  const urls = [];
  for (const entry of entries) {
    const text = extractArchiveEntry(localPath, entry);
    for (const url of extractUrls(text)) {
      const key = urlKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push({
        url,
        foundIn: entry,
        source: "archive text",
      });
      if (urls.length >= 30) break;
    }
    if (urls.length >= 30) break;
  }
  return {
    urls,
    scanned: true,
    scannedFiles: entries.length,
    localSize: statSync(localPath).size,
  };
}

function scanRepoUrls() {
  if (!scanRepoText) return [];
  const safeDirectory = sourceRepo.replaceAll("\\", "/");
  const args = [
    "-c",
    `safe.directory=${safeDirectory}`,
    "-C",
    sourceRepo,
    "grep",
    "-I",
    "-n",
    "-E",
    "https?://|ftp://|www\\.",
    "origin/main",
    "--",
    "README.md",
    "docs/**",
    "programming/**",
  ];
  const result = spawnSync("git", args, {
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 1024 * 1024 * 12,
  });
  if (![0, 1, null].includes(result.status)) return [];
  const seen = new Set();
  const links = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const match = line.match(/^origin\/main:([^:]+):(\d+):(.*)$/);
    if (!match) continue;
    const [, sourcePath, lineNumber, content] = match;
    for (const url of extractUrls(content)) {
      const key = urlKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        url,
        sourcePath,
        line: Number(lineNumber),
        source: "repository text",
      });
      if (links.length >= 800) return links;
    }
  }
  return links;
}

function buildGlobal(perProgram, repoText) {
  const seen = new Set();
  const global = [];
  for (const entry of Object.values(perProgram)) {
    for (const item of entry.urls || []) {
      if (!isUsefulUrl(item.url)) continue;
      const key = urlKey(item.url);
      if (seen.has(key)) continue;
      seen.add(key);
      global.push({
        url: item.url,
        source: item.source,
        programId: entry.programId,
        programName: entry.programName,
        foundIn: item.foundIn,
      });
    }
  }
  for (const item of repoText) {
    if (!isUsefulUrl(item.url)) continue;
    const key = urlKey(item.url);
    if (seen.has(key)) continue;
    seen.add(key);
    global.push(item);
  }
  return global.sort((a, b) => a.url.localeCompare(b.url));
}

function sanitizePerProgram(perProgram) {
  for (const entry of Object.values(perProgram)) {
    const seen = new Set();
    entry.urls = (entry.urls || []).filter((item) => {
      if (!isUsefulUrl(item.url)) return false;
      const key = urlKey(item.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

function writeIndex(index) {
  mkdirSync(path.dirname(indexJsonPath), { recursive: true });
  writeFileSync(indexJsonPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  writeFileSync(indexJsPath, `window.AOL_PROGZ_URL_INDEX = ${JSON.stringify(index, null, 2)};\n`, "utf8");
}

function main() {
  const catalog = readCatalog();
  const index = readExistingIndex();
  const perProgram = index.perProgram || {};
  let scannedThisRun = 0;

  for (const program of catalog.programs) {
    if (scanLimit && scannedThisRun >= scanLimit) break;
    const existing = perProgram[program.id];
    const localPath = program.download?.path || "";
    if (existing?.scanned && existing?.localPath === localPath) continue;
    if (!localPath) continue;

    const scan = scanArchive(program);
    perProgram[program.id] = {
      programId: program.id,
      programName: program.name,
      file: program.file,
      localPath,
      scanned: scan.scanned,
      reason: scan.reason || "",
      scannedFiles: scan.scannedFiles || 0,
      localSize: scan.localSize || 0,
      urls: scan.urls,
      scannedAt: new Date().toISOString(),
    };
    scannedThisRun += 1;
  }

  const repoText = scanRepoText ? scanRepoUrls() : index.repoText || [];
  sanitizePerProgram(perProgram);
  const next = {
    generatedAt: new Date().toISOString(),
    scannedPrograms: Object.values(perProgram).filter((item) => item.scanned).length,
    programsWithUrls: Object.values(perProgram).filter((item) => item.urls?.length).length,
    perProgram,
    repoText,
    global: buildGlobal(perProgram, repoText),
  };
  writeIndex(next);
  console.log(
    `Scanned ${scannedThisRun} archives this run, ${next.scannedPrograms} total, ${next.programsWithUrls} with URLs, ${next.global.length} unique URLs.`,
  );
}

main();
