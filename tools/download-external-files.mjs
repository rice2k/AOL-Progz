import { mkdirSync, existsSync, createWriteStream, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const rootDir = path.resolve(import.meta.dirname, "..");
const listDir = path.join(rootDir, "data", "external-url-lists");
const manifestPath = path.join(rootDir, "data", "external-downloads.json");
const manifestJsPath = path.join(rootDir, "data", "external-downloads.js");
const webResourcesPath = path.join(rootDir, "data", "web-resources.json");
const limit = Number(process.env.AOL_EXTERNAL_DOWNLOAD_LIMIT || 50);
const maxMb = Number(process.env.AOL_EXTERNAL_MAX_MB || 50);
const timeoutMs = Number(process.env.AOL_EXTERNAL_TIMEOUT_MS || 25000);
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
const extensionPattern = /\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx)(?:$|[?#])/i;

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

function candidatePriority(candidate) {
  const value = `${candidate.originalUrl} ${candidate.name} ${candidate.sourceList}`.toLowerCase();
  if (/methodus|netbus/.test(value)) return 0;
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

async function downloadFile(candidate) {
  const localPath = targetFor(candidate);
  const target = path.join(rootDir, localPath);
  if (existsSync(target) && statSync(target).size > 0) {
    return { ...candidate, localPath, status: "ready", size: statSync(target).size };
  }

  mkdirSync(path.dirname(target), { recursive: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const temp = `${target}.tmp`;
  let size = 0;
  try {
    const response = await fetch(candidate.waybackUrl, {
      signal: controller.signal,
      headers: { "user-agent": "AOL-Progz-external-downloader/1.0" },
    });
    if (!response.ok) {
      return { ...candidate, localPath: "", status: `http-${response.status}`, size: 0 };
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > maxMb * 1024 * 1024) {
      return { ...candidate, localPath: "", status: "too-large", size: contentLength };
    }
    const out = createWriteStream(temp);
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxMb * 1024 * 1024) {
        out.destroy();
        return { ...candidate, localPath: "", status: "too-large", size };
      }
      out.write(chunk);
    }
    await new Promise((resolve) => out.end(resolve));
    await import("node:fs").then(({ renameSync }) => renameSync(temp, target));
    return { ...candidate, localPath, status: "ready", size };
  } catch (error) {
    return { ...candidate, localPath: "", status: error.name === "AbortError" ? "timeout" : "failed", size };
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
  const existingByUrl = new Map(existing.map((item) => [canonicalUrl(item.originalUrl), item]));
  const downloads = [...existing];
  let attempted = 0;

  for (const candidate of filteredCandidates) {
    const key = canonicalUrl(candidate.originalUrl);
    const previous = existingByUrl.get(key);
    if (previous?.status === "ready") continue;
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
