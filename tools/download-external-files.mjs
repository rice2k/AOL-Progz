import { mkdirSync, existsSync, createWriteStream, readFileSync, writeFileSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const rootDir = path.resolve(import.meta.dirname, "..");
const listDir = path.join(rootDir, "data", "external-url-lists");
const manifestPath = path.join(rootDir, "data", "external-downloads.json");
const manifestJsPath = path.join(rootDir, "data", "external-downloads.js");
const webResourcesPath = path.join(rootDir, "data", "web-resources.json");
const archiveOrgPath = path.join(rootDir, "data", "archiveorg-software.json");
const limit = Number(process.env.AOL_EXTERNAL_DOWNLOAD_LIMIT || 50);
const maxMb = Number(process.env.AOL_EXTERNAL_MAX_MB || 50);
const timeoutMs = Number(process.env.AOL_EXTERNAL_TIMEOUT_MS || 25000);
const retryExisting = /^(1|true|yes)$/i.test(process.env.AOL_EXTERNAL_RETRY || "");
const sourceMatch = process.env.AOL_EXTERNAL_SOURCE_MATCH
  ? new RegExp(process.env.AOL_EXTERNAL_SOURCE_MATCH, "i")
  : null;

const urlLists = [
  {
    name: "ProgzRescue Angelfire files",
    url: "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-angelfire-files.txt",
    local: "found-angelfire-files.txt",
  },
  {
    name: "ProgzRescue Geocities SiliconValley files",
    url: "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-geocities-silicon-valley-files.txt",
    local: "found-geocities-silicon-valley-files.txt",
  },
  {
    name: "ProgzRescue FortuneCity Skyscraper files",
    url: "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-forune-city-skyscraper-files.txt",
    local: "found-forune-city-skyscraper-files.txt",
  },
];

const directDownloads = [
  {
    name: "AOL Progs ARCHIVE.rar",
    sourceList: "User-supplied Kadeklizem archive",
    originalUrl: "http://kadeklizem.com/AOL%20Progs%20ARCHIVE.rar",
    waybackUrl: "https://web.archive.org/web/20220321112058/http://kadeklizem.com/AOL%20Progs%20ARCHIVE.rar",
  },
  {
    name: "FormatSN.zip",
    sourceList: "User-supplied AOL utility links",
    originalUrl: "http://www.8op.com/ironbloodownz/dopeeffects/FormatSN.zip",
    waybackUrl: "https://web.archive.org/web/20020601203124/http://www.8op.com/ironbloodownz/dopeeffects/FormatSN.zip",
    discoveredText: "Format SN - change the format of your screenname for AOL",
  },
  {
    name: "AIM44.zip",
    sourceList: "User-supplied DNX ACP downloads",
    originalUrl: "http://www.dnx-online.net/~acp/downloads/AIM44.zip",
    waybackUrl: "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/AIM44.zip",
    discoveredText: "AIM 4.4",
  },
  {
    name: "AOL30german.exe",
    sourceList: "User-supplied DNX ACP downloads",
    originalUrl: "http://www.dnx-online.net/~acp/downloads/AOL30german.exe",
    waybackUrl: "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/AOL30german.exe",
    discoveredText: "AOL Germany 3.0",
  },
  {
    name: "masteraol5.zip",
    sourceList: "User-supplied DNX ACP downloads",
    originalUrl: "http://www.dnx-online.net/~acp/downloads/masteraol5.zip",
    waybackUrl: "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/masteraol5.zip",
    discoveredText: "master aol 5.0",
  },
  {
    name: "aimcreat.zip",
    sourceList: "User-supplied DNX ACP downloads",
    originalUrl: "http://www.dnx-online.net/~acp/downloads/aimcreat.zip",
    waybackUrl: "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/aimcreat.zip",
    discoveredText: "aim creation",
  },
  {
    name: "aimpluss.zip",
    sourceList: "User-supplied DNX ACP downloads",
    originalUrl: "http://www.dnx-online.net/~acp/downloads/aimpluss.zip",
    waybackUrl: "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/aimpluss.zip",
    discoveredText: "aim pluss",
  },
  {
    name: "aimster.zip",
    sourceList: "User-supplied DNX ACP downloads",
    originalUrl: "http://www.dnx-online.net/~acp/downloads/aimster.zip",
    waybackUrl: "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/aimster.zip",
    discoveredText: "aimster",
  },
  {
    name: "acaimpasswordcracker.zip",
    sourceList: "User-supplied DNX ACP downloads",
    originalUrl: "http://www.dnx-online.net/~acp/downloads/acaimpasswordcracker.zip",
    waybackUrl: "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/acaimpasswordcracker.zip",
  },
  {
    name: "aolfiledownloader50.zip",
    sourceList: "User-supplied DNX ACP downloads",
    originalUrl: "http://www.dnx-online.net/~acp/downloads/aolfiledownloader50.zip",
    waybackUrl: "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/aolfiledownloader50.zip",
  },
  {
    name: "rampagetools2source.zip",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.com/download/rampagetools2source.zip",
    waybackUrl: "https://web.archive.org/web/20130805181931/http://www.oogle.com/download/rampagetools2source.zip",
    discoveredText: "Rampage Toolz 2 source-code ZIP lead; retained even when Wayback replays HTML instead of a ZIP.",
  },
  {
    name: "rt1_src.zip",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.net/rt1source/rt1_src.zip",
    waybackUrl: "https://web.archive.org/web/20000619003422/http://www.oogle.net/rt1source/rt1_src.zip",
    discoveredText: "Rampage Toolz 1.1 source-code ZIP linked from Oogle's archived source page.",
  },
  {
    name: "rt1_src.zip",
    sourceList: "AOLUnderground reference mirror source-code files",
    sourceListUrl: "https://aolunderground.com/proggies/",
    originalUrl:
      "https://raw.githubusercontent.com/ssstonebraker/aolunderground-proggies/main/programming/vb/aol/unsorted/rt1_src.zip",
    waybackUrl:
      "https://github.com/ssstonebraker/aolunderground-proggies/blob/main/programming/vb/aol/unsorted/rt1_src.zip",
    downloadUrl:
      "https://raw.githubusercontent.com/ssstonebraker/aolunderground-proggies/main/programming/vb/aol/unsorted/rt1_src.zip",
    discoveredText:
      "Rampage Toolz 1.1 source-code ZIP recovered from the AOLUnderground public archive mirror; recorded as a reference copy, not an authorship source.",
  },
  {
    name: "setuprt22.exe",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.net/rampage/setuprt22.exe",
    waybackUrl: "https://web.archive.org/web/20010613064806/http://www.oogle.net/rampage/setuprt22.exe",
    discoveredText: "Rampage Toolz 2.2 setup executable lead from Oogle/Rampage pages.",
  },
  {
    name: "skin_elite.zip",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.net/rampage/skin_elite.zip",
    waybackUrl: "https://web.archive.org/web/20000604165228id_/http://www.oogle.net/rampage/skin_elite.zip",
    discoveredText: "Rampage Toolz skin ZIP recovered from the Oogle Rampage directory.",
  },
  {
    name: "skin_insane.zip",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.net/rampage/skin_insane.zip",
    waybackUrl: "https://web.archive.org/web/20000531142607id_/http://www.oogle.net/rampage/skin_insane.zip",
    discoveredText: "Rampage Toolz skin ZIP recovered from the Oogle Rampage directory.",
  },
  {
    name: "rscript.zip",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.net/downloads/rscript.zip",
    waybackUrl: "https://web.archive.org/web/20001205033300/http://www.oogle.net/downloads/rscript.zip",
    discoveredText: "Rampage Script SDK download linked from Oogle's Rampage tutorial page.",
  },
  {
    name: "script_tutorial1.doc",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.net/downloads/script_tutorial1.doc",
    waybackUrl: "https://web.archive.org/web/20001205033300/http://www.oogle.net/downloads/script_tutorial1.doc",
    discoveredText: "Oogle Rampage Script Tutorial #1, listed at 645 KB on the archived tutorial page.",
  },
  {
    name: "script_tutorial2.doc",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.net/downloads/script_tutorial2.doc",
    waybackUrl: "https://web.archive.org/web/20001205033300/http://www.oogle.net/downloads/script_tutorial2.doc",
    discoveredText: "Oogle Rampage Script Tutorial #2, listed at 1,274 KB on the archived tutorial page.",
  },
  {
    name: "script_tutorial3.doc",
    sourceList: "User-supplied Oogle Rampage source leads",
    originalUrl: "http://www.oogle.net/downloads/script_tutorial3.doc",
    waybackUrl: "https://web.archive.org/web/20001205033300/http://www.oogle.net/downloads/script_tutorial3.doc",
    discoveredText: "Oogle Rampage Script Tutorial #3, listed at 10 KB on the archived tutorial page.",
  },
  ...[
    "ChatOCX2.ocx",
    "chatscan%C2%B3.ocx",
    "COMDLG32.DLL",
    "COMDLG32.OCX",
    "msinet.ocx",
    "MSVBVM60.DLL",
    "mswinsck.ocx",
    "playcd2.ocx",
    "RICHED32.DLL",
    "VB5CHAT2.ocx",
    "VB40032.DLL",
  ].map((file) => ({
    name: decodeURIComponent(file),
    sourceList: "User-supplied ColtPro missing DLL/OCX files",
    originalUrl: `http://www.coltpro.net/files3/missings/${file}`,
    waybackUrl: `https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/${file}`,
    discoveredText: "missing DLL/OCX runtime support file",
  })),
];

const likelyPattern =
  /(aol|aim|prog|proggie|progz|toolz|punter|punt|booter|boot|fader|fade|mmer|mail|tos|term|idler|idle|phish|fish|crack|cracker|buster|room|chat|macro|scroll|hell|ccom|c-com|x'er|xer|server|vb|ocx|dll)/i;
const extensionPattern = /\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx|iso|img|ima|wsz|bin|cue|doc)(?:$|[?#])/i;
const archiveOrgExtensionPattern = /\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx|iso|img|ima|wsz|bin|cue|doc)(?:$|[?#])/i;

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[_\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 150) || "file";
}

function cleanUrl(raw) {
  const match = String(raw || "").match(/https?:\/\/[^"',\]\s]+/i);
  if (!match) return "";
  return match[0].replace(/[)\].,;]+$/g, "");
}

function canonicalUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }
    return parsed.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url).replace(/\/$/, "").toLowerCase();
  }
}

async function fetchList(list) {
  mkdirSync(listDir, { recursive: true });
  const target = path.join(listDir, list.local);
  if (existsSync(target) && statSync(target).size > 0) return readFileSync(target, "utf8");
  const response = await fetch(list.url, {
    headers: { "user-agent": "AOL-Progz-external-downloader/1.0" },
  });
  if (!response.ok) throw new Error(`${list.name}: ${response.status}`);
  const text = await response.text();
  writeFileSync(target, text, "utf8");
  return text;
}

function parseCandidates(list, text) {
  const links = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    const url = cleanUrl(line);
    if (!url || !extensionPattern.test(url) || !likelyPattern.test(url)) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      sourceList: list.name,
      sourceListUrl: list.url,
      originalUrl: url,
      waybackUrl: `https://web.archive.org/web/0id_/${url}`,
      name: path.posix.basename(new URL(url).pathname) || "archive.zip",
    });
  }
  return links;
}

function originalFromWayback(url) {
  const match = String(url).match(/https?:\/\/web\.archive\.org\/web\/[^/]+\/(https?:\/\/.*)$/i);
  return match?.[1] || url;
}

function parseWebResourceCandidates() {
  if (!existsSync(webResourcesPath)) return [];
  const web = JSON.parse(readFileSync(webResourcesPath, "utf8"));
  return (web.links || [])
    .filter((link) => link.type === "download")
    .map((link) => {
      const original = link.originalUrl || originalFromWayback(link.url);
      return {
        sourceList: `Web page: ${link.pageName || "resource"}`,
        sourceListUrl: link.pageUrl || "",
        originalUrl: original,
        waybackUrl: link.url,
        name: path.posix.basename(new URL(original).pathname) || link.text || "archive.zip",
        discoveredText: link.text || "",
      };
    })
    .filter((candidate) => extensionPattern.test(candidate.originalUrl));
}

function parseArchiveOrgCandidates() {
  if (!existsSync(archiveOrgPath)) return [];
  const data = JSON.parse(readFileSync(archiveOrgPath, "utf8"));
  const candidates = [];
  for (const item of data.items || []) {
    for (const file of item.files || []) {
      if (!file.importCandidate || !file.downloadUrl || !archiveOrgExtensionPattern.test(file.name || file.downloadUrl)) continue;
      candidates.push({
        sourceList: `Archive.org: ${item.category || "AOL/AIM software"}`,
        sourceListUrl: item.itemUrl,
        originalUrl: file.downloadUrl,
        waybackUrl: file.downloadUrl,
        downloadUrl: file.downloadUrl,
        name: file.name,
        discoveredText: [item.version, item.title, item.storageNote].filter(Boolean).join(" - "),
        archiveOrgIdentifier: item.identifier,
        archiveOrgTitle: item.title,
        archiveOrgPage: item.itemUrl,
        expectedSha1: file.sha1 || "",
      });
    }
  }
  return candidates;
}

function candidatePriority(candidate) {
  const value = `${candidate.originalUrl} ${candidate.name} ${candidate.sourceList}`.toLowerCase();
  if (/methodus|netbus/.test(value)) return 0;
  if (/archive\.org/.test(value)) return 1;
  if (/freeprogz|oogle|lenshell|loltoolz|ricejerry|progstation|aol-progz|aimthings/.test(value)) return 1;
  if (candidate.sourceList?.startsWith("Web page:")) return 2;
  return 5;
}

function targetFor(candidate) {
  const parsed = new URL(candidate.originalUrl);
  const extension = path.posix.extname(parsed.pathname) || ".zip";
  const host = slugify(parsed.hostname.replace(/^www\./, ""));
  const base = slugify(path.posix.basename(parsed.pathname, extension));
  const shortHash = createHash("sha1").update(canonicalUrl(candidate.originalUrl)).digest("hex").slice(0, 8);
  return `files/external/${host}/${base}-${shortHash}${extension.toLowerCase()}`;
}

function githubRawUrl(url) {
  try {
    const parsed = new URL(originalFromWayback(url));
    if (!/^github\.com$/i.test(parsed.hostname.replace(/^www\./, ""))) return "";
    const parts = parsed.pathname.split("/").filter(Boolean);
    const blobIndex = parts.indexOf("blob");
    if (parts.length < 5 || blobIndex !== 2) return "";
    const [owner, repo, , branch, ...fileParts] = parts;
    if (!owner || !repo || !branch || !fileParts.length) return "";
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${fileParts.map(encodeURIComponent).join("/")}`;
  } catch {
    return "";
  }
}

function downloadUrlFor(candidate) {
  if (candidate.downloadUrl) return candidate.downloadUrl;
  return githubRawUrl(candidate.originalUrl) || githubRawUrl(candidate.waybackUrl) || candidate.waybackUrl;
}

function isOutOfScope(candidate) {
  const value = `${candidate.originalUrl || ""} ${candidate.waybackUrl || ""} ${candidate.downloadUrl || ""} ${
    candidate.sourceList || ""
  } ${candidate.name || ""}`.toLowerCase();
  return (
    /releases\.stackql\.io|github\.com\/mcp\/stackql/.test(value) ||
    /am\.net\/lib\/tools\/google\//.test(value) ||
    /web page:\s*google\//.test(value) ||
    /ottorockit\/media\/01-|\/images\/gradpics\.zip|dutchmarine\/fotos\d*\.zip/.test(value)
  );
}

function removeExternalLocalFile(localPath) {
  if (!localPath) return;
  const externalRoot = path.join(rootDir, "files", "external");
  const fullPath = path.resolve(rootDir, localPath);
  if (!fullPath.startsWith(path.resolve(externalRoot) + path.sep)) return;
  try {
    if (existsSync(fullPath)) unlinkSync(fullPath);
  } catch {
    // The manifest status is still authoritative if cleanup fails.
  }
}

function validateLocalDownload(localPath) {
  const target = path.join(rootDir, localPath);
  if (!existsSync(target)) return { ok: false, status: "missing-local-file", size: 0 };
  const size = statSync(target).size;
  if (size <= 0) return { ok: false, status: "empty-file", size };
  const buffer = readFileSync(target).subarray(0, 512);
  const hex = buffer.subarray(0, 8).toString("hex");
  const text = buffer.toString("latin1");
  if (/^\s*</.test(text) || /<(?:!doctype\s+html|html|head)\b/i.test(text)) {
    return { ok: false, status: "html-replay", size };
  }
  const lower = localPath.toLowerCase();
  if (/\.(exe|dll|ocx|vbx)$/i.test(lower) && !hex.startsWith("4d5a")) {
    return { ok: false, status: "invalid-executable", size };
  }
  if (/\.(zip|jar)$/i.test(lower) && !/^(504b|4d5a|1f8b|52617221)/i.test(hex)) {
    return { ok: false, status: "invalid-archive", size };
  }
  if (/\.rar$/i.test(lower) && !hex.startsWith("52617221")) {
    return { ok: false, status: "invalid-archive", size };
  }
  if (/\.doc$/i.test(lower) && !/^(d0cf11e0|504b0304)/i.test(hex)) {
    return { ok: false, status: "invalid-document", size };
  }
  return { ok: true, status: "ready", size };
}

function sha1File(localPath) {
  const target = path.join(rootDir, localPath);
  if (!existsSync(target)) return "";
  return createHash("sha1").update(readFileSync(target)).digest("hex");
}

function mirrorPreference(item) {
  const value = `${item.originalUrl || ""} ${item.sourceList || ""}`.toLowerCase();
  if (/damiansuess\/legacy-aol-underground/.test(value)) return 0;
  if (/mikrodotnet\/aol-progz/.test(value)) return 1;
  if (/raw\.githubusercontent\.com/.test(value)) return 2;
  if (/ssstonebraker\/aolunderground-proggies/.test(value)) return 20;
  return 5;
}

function isGithubMirror(item) {
  const value = `${item.originalUrl || ""} ${item.downloadUrl || ""} ${item.waybackUrl || ""}`.toLowerCase();
  return /github\.com\/.+\/blob\/|raw\.githubusercontent\.com\//.test(value);
}

function restoreExpectedLocalPaths(downloads) {
  for (const item of downloads) {
  if (item.status !== "ready" || !item.localPath || isGithubMirror(item)) continue;
    let expected = "";
    try {
      expected = targetFor(item);
    } catch {
      continue;
    }
    if (!expected || item.localPath === expected || !existsSync(path.join(rootDir, expected))) continue;
    const validation = validateLocalDownload(expected);
    if (!validation.ok) continue;
    item.localPath = expected;
    item.size = validation.size;
    item.sha1 = sha1File(expected);
    item.dedupeNote = "";
  }
}

function dedupeReadyDownloads(downloads) {
  restoreExpectedLocalPaths(downloads);
  const groups = new Map();
  for (const item of downloads) {
    if (item.status !== "ready" || !item.localPath || !isGithubMirror(item)) continue;
    const sha1 = sha1File(item.localPath);
    if (!sha1) continue;
    item.sha1 = sha1;
    const group = groups.get(sha1) || [];
    group.push(item);
    groups.set(sha1, group);
  }

  const duplicatePaths = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const canonical = [...group].sort(
      (a, b) =>
        mirrorPreference(a) - mirrorPreference(b) ||
        String(a.localPath || "").localeCompare(String(b.localPath || "")) ||
        String(a.originalUrl || "").localeCompare(String(b.originalUrl || "")),
    )[0];
    for (const item of group) {
      const oldPath = item.localPath;
      if (oldPath !== canonical.localPath) duplicatePaths.add(oldPath);
      item.localPath = canonical.localPath;
      item.size = canonical.size;
      item.sha1 = canonical.sha1;
      item.dedupeNote = oldPath === canonical.localPath ? "" : `Identical payload stored once at ${canonical.localPath}.`;
    }
  }

  const referenced = new Set(downloads.filter((item) => item.status === "ready").map((item) => item.localPath).filter(Boolean));
  const externalRoot = path.join(rootDir, "files", "external");
  for (const localPath of duplicatePaths) {
    if (referenced.has(localPath)) continue;
    const fullPath = path.resolve(rootDir, localPath);
    if (!fullPath.startsWith(path.resolve(externalRoot) + path.sep)) continue;
    try {
      if (existsSync(fullPath)) unlinkSync(fullPath);
    } catch {
      // If cleanup fails, the manifest still points all mirrors at the canonical file.
    }
  }
}

async function downloadFile(candidate) {
  if (isOutOfScope(candidate)) {
    return { ...candidate, downloadUrl: downloadUrlFor(candidate), localPath: "", status: "out-of-scope", size: 0 };
  }
  const localPath = targetFor(candidate);
  const downloadUrl = downloadUrlFor(candidate);
  const target = path.join(rootDir, localPath);
  if (existsSync(target) && statSync(target).size > 0) {
    const validation = validateLocalDownload(localPath);
    const sha1 = validation.ok ? sha1File(localPath) : "";
    if (validation.ok && candidate.expectedSha1 && sha1 && sha1.toLowerCase() !== candidate.expectedSha1.toLowerCase()) {
      return { ...candidate, downloadUrl, localPath: "", status: "sha1-mismatch", size: validation.size, sha1 };
    }
    return validation.ok
      ? { ...candidate, downloadUrl, localPath, status: "ready", size: validation.size, sha1 }
      : { ...candidate, downloadUrl, localPath: "", status: validation.status, size: validation.size };
  }

  mkdirSync(path.dirname(target), { recursive: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const temp = `${target}.tmp`;
  let size = 0;
  try {
    const response = await fetch(downloadUrl, {
      signal: controller.signal,
      headers: { "user-agent": "AOL-Progz-external-downloader/1.0" },
    });
    if (!response.ok) {
      return { ...candidate, downloadUrl, localPath: "", status: `http-${response.status}`, size: 0 };
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxMb * 1024 * 1024) {
      return { ...candidate, downloadUrl, localPath: "", status: "too-large", size: contentLength };
    }
    const out = createWriteStream(temp);
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxMb * 1024 * 1024) {
        out.destroy();
        return { ...candidate, downloadUrl, localPath: "", status: "too-large", size };
      }
      out.write(chunk);
    }
    await new Promise((resolve) => out.end(resolve));
    await import("node:fs").then(({ renameSync }) => renameSync(temp, target));
    const validation = validateLocalDownload(localPath);
    const sha1 = validation.ok ? sha1File(localPath) : "";
    if (validation.ok && candidate.expectedSha1 && sha1 && sha1.toLowerCase() !== candidate.expectedSha1.toLowerCase()) {
      try {
        await import("node:fs").then(({ unlinkSync }) => unlinkSync(target));
      } catch {
        // The manifest status is enough if cleanup fails.
      }
      return { ...candidate, downloadUrl, localPath: "", status: "sha1-mismatch", size: validation.size, sha1 };
    }
    if (!validation.ok) {
      try {
        await import("node:fs").then(({ unlinkSync }) => unlinkSync(target));
      } catch {
        // The manifest status is enough if cleanup fails.
      }
      return { ...candidate, downloadUrl, localPath: "", status: validation.status, size: validation.size };
    }
    return { ...candidate, downloadUrl, localPath, status: "ready", size, sha1 };
  } catch (error) {
    return { ...candidate, downloadUrl, localPath: "", status: error.name === "AbortError" ? "timeout" : "failed", size };
  } finally {
    clearTimeout(timer);
    try {
      if (existsSync(temp)) await import("node:fs").then(({ unlinkSync }) => unlinkSync(temp));
    } catch {
      // Stale temp cleanup can be retried by the next run.
    }
  }
}

function readManifest() {
  if (!existsSync(manifestPath)) return { downloads: [] };
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return { downloads: [] };
  }
}

function writeManifest(downloads, candidates) {
  dedupeReadyDownloads(downloads);
  const byStatus = {};
  for (const item of downloads) byStatus[item.status] = (byStatus[item.status] || 0) + 1;
  const groups = buildMirrorGroups(downloads, candidates);
  const data = {
    generatedAt: new Date().toISOString(),
    sourceListCount: urlLists.length,
    candidateCount: candidates.length,
    downloadCount: downloads.length,
    readyCount: downloads.filter((item) => item.status === "ready").length,
    mirrorGroupCount: groups.length,
    byStatus,
    sourceLists: urlLists,
    mirrorGroups: groups,
    downloads,
  };
  writeFileSync(manifestPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(manifestJsPath, `window.AOL_PROGZ_EXTERNAL_DOWNLOADS = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(`External downloads: ${data.readyCount}/${data.downloadCount} ready from ${data.candidateCount} candidates.`);
}

function mirrorKey(item) {
  const name = String(item.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return name || canonicalUrl(item.originalUrl);
}

function buildMirrorGroups(downloads, candidates) {
  const grouped = new Map();
  for (const item of [...candidates, ...downloads]) {
    const key = mirrorKey(item);
    const group = grouped.get(key) || {
      key,
      name: item.name || key,
      mirrors: [],
      localFiles: [],
      readyCount: 0,
      totalMirrors: 0,
    };
    const mirrorUrl = item.originalUrl;
    if (mirrorUrl && !group.mirrors.some((mirror) => canonicalUrl(mirror.originalUrl) === canonicalUrl(mirrorUrl))) {
      group.mirrors.push({
        originalUrl: mirrorUrl,
        waybackUrl: item.waybackUrl || "",
        sourceList: item.sourceList || "",
        status: item.status || "candidate",
      });
    }
    if (item.status === "ready" && item.localPath && !group.localFiles.includes(item.localPath)) {
      group.localFiles.push(item.localPath);
    }
    grouped.set(key, group);
  }
  for (const group of grouped.values()) {
    group.totalMirrors = group.mirrors.length;
    group.readyCount = group.localFiles.length;
  }
  return [...grouped.values()]
    .filter((group) => group.totalMirrors > 1 || group.readyCount > 0)
    .sort((a, b) => b.totalMirrors - a.totalMirrors || a.name.localeCompare(b.name));
}

async function main() {
  const allCandidates = [...directDownloads, ...parseWebResourceCandidates()];
  allCandidates.push(...parseArchiveOrgCandidates());
  for (const list of urlLists) {
    const text = await fetchList(list);
    allCandidates.push(...parseCandidates(list, text));
  }
  allCandidates.push(...parseWebResourceCandidates());

  const uniqueCandidates = [];
  const candidateSeen = new Set();
  for (const candidate of allCandidates) {
    const key = canonicalUrl(candidate.originalUrl);
    if (candidateSeen.has(key)) continue;
    candidateSeen.add(key);
    uniqueCandidates.push(candidate);
  }
  uniqueCandidates.sort((a, b) => candidatePriority(a) - candidatePriority(b));
  const filteredCandidates = sourceMatch
    ? uniqueCandidates.filter((candidate) =>
        sourceMatch.test(
          `${candidate.sourceList || ""} ${candidate.sourceListUrl || ""} ${candidate.originalUrl || ""} ${
            candidate.name || ""
          } ${candidate.discoveredText || ""}`,
        ),
      )
    : uniqueCandidates;

  const existing = readManifest().downloads || [];
  for (const item of existing) {
    if (isOutOfScope(item)) {
      removeExternalLocalFile(item.localPath);
      item.status = "out-of-scope";
      item.localPath = "";
      item.size = 0;
      continue;
    }
    if (item.status !== "ready" || !item.localPath) continue;
    item.downloadUrl = item.downloadUrl || downloadUrlFor(item);
    const validation = validateLocalDownload(item.localPath);
    if (!validation.ok) {
      item.status = validation.status;
      item.localPath = "";
      item.size = validation.size;
    }
  }
  const existingByUrl = new Map(existing.map((item) => [canonicalUrl(item.originalUrl), item]));
  const downloads = [...existing];
  let attempted = 0;

  for (const candidate of filteredCandidates) {
    const key = canonicalUrl(candidate.originalUrl);
    const previous = existingByUrl.get(key);
    if (previous?.status === "ready") continue;
    if (previous && !retryExisting) continue;
    if (limit && attempted >= limit) break;
    attempted += 1;
    const result = await downloadFile(candidate);
    if (previous) {
      Object.assign(previous, result);
    } else {
      downloads.push(result);
      existingByUrl.set(key, result);
    }
  }

  writeManifest(downloads, uniqueCandidates);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
