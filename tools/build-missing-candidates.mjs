import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const catalogPath = path.join(rootDir, "data", "catalog.js");
const webResourcesPath = path.join(rootDir, "data", "web-resources.json");
const externalDownloadsPath = path.join(rootDir, "data", "external-downloads.json");
const externalArchiveTextPath = path.join(rootDir, "data", "external-archive-text.json");
const outJson = path.join(rootDir, "data", "missing-candidates.json");
const outJs = path.join(rootDir, "data", "missing-candidates.js");

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function readCatalog() {
  const text = readFileSync(catalogPath, "utf8");
  return JSON.parse(text.slice(text.indexOf("=") + 1).replace(/;\s*$/, ""));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx)$/i, "")
    .replace(/aol|aim|progz?|proggie|toolz?|v\d+(?:\.\d+)?|version|\d+(?:\.\d+)?/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function basenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    return path.posix.basename(parsed.pathname);
  } catch {
    return "";
  }
}

function inferCategory(text) {
  const value = String(text || "").toLowerCase();
  if (/\.(dll|ocx|vbx)\b|msvbvm|comdlg|riched|runtime|missing dll|missing ocx/.test(value)) return "runtime/support file";
  if (/\b(aol|aim)\s*(install|setup|client)|aim\d|aim\s*\d|aol\d|aol\s*\d|aolp\d|setupaol/.test(value)) {
    return "AOL/AIM client installer";
  }
  if (/punt|boot|nuke|disconnect/.test(value)) return "punter/booter";
  if (/room|buster/.test(value)) return "room buster";
  if (/fade|fader/.test(value)) return "fader";
  if (/idle|afk|away|auto[-\s]?respond|bot/.test(value)) return "idler/bot";
  if (/mail|mmer|mass\s*im|spam|blast/.test(value)) return "mass mailer/server";
  if (/phish|fish|pass|crack|netbus|trojan/.test(value)) return "hazardous/account or remote-control context";
  if (/chat|ccom|c-com|macro|scroll|ascii|flood/.test(value)) return "chat/macro";
  if (/skin|profile|buddy/.test(value)) return "AIM";
  if (/aim/.test(value)) return "AIM";
  return "unknown";
}

function preferStatus(existing, incoming) {
  if (!incoming) return existing || "candidate";
  if (!existing || existing === "candidate") return incoming;
  if (existing !== "ready" && incoming === "ready") return incoming;
  return existing;
}

function main() {
  const catalog = readCatalog();
  const web = readJson(webResourcesPath, { links: [] });
  const external = readJson(externalDownloadsPath, { downloads: [] });
  const externalArchiveText = readJson(externalArchiveTextPath, { byLocalPath: {} });
  const externalTextByLocalPath = externalArchiveText.byLocalPath || {};

  const known = new Set();
  for (const program of catalog.programs) {
    known.add(slug(program.name));
    known.add(slug(path.posix.basename(program.file || "")));
  }

  const candidates = new Map();
  function addCandidate(item) {
    const fileName = item.name || basenameFromUrl(item.originalUrl || item.url);
    if (!fileName) return;
    const key = slug(fileName);
    if (!key || known.has(key)) return;
    const existing = candidates.get(key) || {
      key,
      fileName,
      category: inferCategory(`${fileName} ${item.text || ""} ${item.description || ""} ${item.originalUrl || ""}`),
      mirrors: [],
      readyLocalFiles: [],
      sourcePages: new Set(),
      externalTextAuthors: new Set(),
      externalTextPurposeSignals: new Set(),
      externalTextVersions: new Set(),
      externalTextUrls: new Set(),
      externalTextDescriptions: [],
      externalTextFileCount: 0,
    };
    if (item.originalUrl || item.url) {
      const url = item.originalUrl || item.url;
      const mirror = existing.mirrors.find((candidateMirror) => candidateMirror.url === url);
      if (mirror) {
        mirror.waybackUrl = item.waybackUrl || item.url || mirror.waybackUrl || "";
        mirror.source = mirror.source || item.sourceList || item.pageName || "";
        mirror.status = preferStatus(mirror.status, item.status);
      } else {
        existing.mirrors.push({
          url,
          waybackUrl: item.waybackUrl || item.url || "",
          source: item.sourceList || item.pageName || "",
          status: item.status || "candidate",
        });
      }
    }
    if (item.localPath && !existing.readyLocalFiles.includes(item.localPath)) {
      existing.readyLocalFiles.push(item.localPath);
    }
    const textEvidence = item.localPath ? externalTextByLocalPath[item.localPath] : null;
    if (textEvidence?.scanned) {
      existing.externalTextFileCount += textEvidence.textFileCount || 0;
      if (textEvidence.preferredAuthor) existing.externalTextAuthors.add(textEvidence.preferredAuthor);
      for (const author of textEvidence.authorCandidates || []) {
        if (author.name) existing.externalTextAuthors.add(author.name);
      }
      for (const signal of textEvidence.purposeSignals || []) existing.externalTextPurposeSignals.add(signal);
      for (const version of textEvidence.versionMentions || []) existing.externalTextVersions.add(version);
      for (const url of textEvidence.urls || []) existing.externalTextUrls.add(url);
      for (const description of textEvidence.descriptionCandidates || []) {
        if (description.text && !existing.externalTextDescriptions.some((item) => item.text === description.text)) {
          existing.externalTextDescriptions.push(description);
        }
      }
    }
    if (item.pageName) existing.sourcePages.add(item.pageName);
    candidates.set(key, existing);
  }

  for (const link of web.links || []) {
    if (link.type === "download") addCandidate(link);
  }
  for (const download of external.downloads || []) {
    addCandidate(download);
  }

  const rows = [...candidates.values()]
    .map((item) => ({
      ...item,
      sourcePages: [...item.sourcePages],
      externalTextAuthors: [...item.externalTextAuthors].slice(0, 8),
      externalTextPurposeSignals: [...item.externalTextPurposeSignals].slice(0, 10),
      externalTextVersions: [...item.externalTextVersions].slice(0, 10),
      externalTextUrls: [...item.externalTextUrls].slice(0, 10),
      externalTextDescriptions: item.externalTextDescriptions.slice(0, 6),
      mirrorCount: item.mirrors.length,
      readyCount: item.readyLocalFiles.length,
    }))
    .sort((a, b) => b.readyCount - a.readyCount || b.mirrorCount - a.mirrorCount || a.fileName.localeCompare(b.fileName));

  const data = {
    generatedAt: new Date().toISOString(),
    candidateCount: rows.length,
    readyCandidateCount: rows.filter((row) => row.readyCount > 0).length,
    candidates: rows,
  };
  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(outJs, `window.AOL_PROGZ_MISSING_CANDIDATES = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(`Missing candidates: ${data.candidateCount}, ready: ${data.readyCandidateCount}.`);
}

main();
