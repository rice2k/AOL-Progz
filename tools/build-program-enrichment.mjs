import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const rootDir = path.resolve(import.meta.dirname, "..");
const outJson = path.join(rootDir, "data", "program-enrichment.json");
const outJs = path.join(rootDir, "data", "program-enrichment.js");

function readJson(relativePath, fallback) {
  const fullPath = path.join(rootDir, relativePath);
  if (!existsSync(fullPath)) return fallback;
  return JSON.parse(readFileSync(fullPath, "utf8"));
}

function readCatalog() {
  const sandbox = { window: {} };
  const source = readFileSync(path.join(rootDir, "data", "catalog.js"), "utf8");
  vm.runInNewContext(source, sandbox);
  return sandbox.window.AOL_PROGZ_DATA;
}

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/&#8217;|&#x2019;/gi, "'")
    .replace(/&#8211;|&#8212;|&#x2013;|&#x2014;/gi, "-")
    .replace(/&#8220;|&#8221;|&#x201c;|&#x201d;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  return clean(
    String(value ?? "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function titleCase(value) {
  return clean(value)
    .split(/\s+/)
    .map((word) => {
      if (/^(aol|aim|icq|msn|vb|tos|oh|afk|im|ocx|dll|vbx|mp3|html)$/i.test(word)) {
        return word.toUpperCase();
      }
      const special = new Map([
        ["aohell", "AOHell"],
        ["aomess", "AOMess"],
        ["icyhot", "IcyHot"],
        ["phrostbyte", "PhrostByte"],
        ["methodus", "Methodus"],
        ["netbus", "NetBus"],
        ["ccom", "C-Com"],
        ["c-com", "C-Com"],
      ]);
      const lower = word.toLowerCase();
      if (special.has(lower)) return special.get(lower);
      return word.slice(0, 1).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function slugify(value) {
  const slug = clean(value)
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[_\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || "";
}

function basenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    return safeDecode(path.posix.basename(parsed.pathname));
  } catch {
    return safeDecode(path.posix.basename(String(url || "")));
  }
}

function fileStem(value) {
  const base = basenameFromUrl(value);
  return base.replace(/\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx)$/i, "");
}

function archiveFilename(program) {
  return path.posix.basename(clean(program.file) || clean(program.download?.path) || "");
}

function normalizeProgramKey(value) {
  let text = safeDecode(clean(value)).toLowerCase();
  text = text.replace(/\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx)$/i, "");
  text = text.replace(/\[[^\]]*aol[^\]]*\]/gi, " ");
  text = text.replace(/\([^)]*password[^)]*\)/gi, " ");
  text = text.replace(/\bpassword\s*=?\s*[^ ]+/gi, " ");
  text = text.replace(/\bfor\s+aol\s*\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\.\d+)?)?/gi, " ");
  text = text.replace(/\baol\s*\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\.\d+)?)?/gi, " ");
  text = text.replace(/\b(by|from)\b.+$/i, " ");
  text = text.replace(/[_+~[\]{}()!@#$%^&*=;:'",<>?/\\|]+/g, " ");
  text = text.replace(/\s+/g, " ").trim();
  return slugify(text);
}

function formatHumanName(value) {
  let text = safeDecode(clean(value));
  text = text.replace(/\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx)$/i, "");
  text = text.replace(/\[[^\]]*aol[^\]]*\]/gi, " ");
  text = text.replace(/\([^)]*password[^)]*\)/gi, " ");
  text = text.replace(/\bpassword\s*=?\s*[^ ]+/gi, " ");
  text = text.replace(/\bfor\s+aol\s*\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\.\d+)?)?/gi, " ");
  text = text.replace(/\baol\s*\d+(?:\.\d+)?(?:\s*[-/]\s*\d+(?:\.\d+)?)?/gi, " ");
  text = text.replace(/[_]+/g, " ");
  text = text.replace(/([a-z])(\d)/gi, "$1 $2");
  text = text.replace(/([a-z])([A-Z])/g, "$1 $2");
  text = text.replace(/\s+-\s+/g, " - ");
  text = text.replace(/\s+/g, " ").trim();
  return titleCase(text);
}

function parseByline(value) {
  const text = clean(value).replace(/[_]+/g, " ");
  const match = text.match(/^(.+?)\s+(?:by|by:|from)\s+(.+?)$/i);
  if (!match) return null;
  const name = formatHumanName(match[1]);
  const author = clean(match[2])
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\baol\s*\d+(?:\.\d+)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(rar|zip|7z|ace|arj|lzh|exe|dll|ocx|vbx|archive|file)$/i.test(author)) return null;
  if (/\b(?:unknown|downloaded|download|install|setup|license|webpage|web\s*page|homepage|if|was|were|about)\b/i.test(author)) {
    return null;
  }
  if (!name || !author || author.length > 80) return null;
  return { name, author: titleCase(author) };
}

function inferFromFilename(program) {
  const filename = archiveFilename(program);
  const stem = fileStem(filename);
  const spaced = safeDecode(stem).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const versionMatch =
    spaced.match(/\[aol\s*([\d.]+(?:\s*[-/]\s*[\d.]+)?)\]/i) ||
    spaced.match(/\bfor\s+aol\s*([\d.]+(?:\s*[-/]\s*[\d.]+)?)/i) ||
    spaced.match(/\baol\s*([\d.]+(?:\s*[-/]\s*[\d.]+)?)/i);
  const byline = parseByline(spaced);
  const rawName = byline?.name || formatHumanName(spaced.replace(/\s+(?:by|by:|from)\s+.+$/i, ""));
  const derivedName = clean(rawName);
  const catalogKey = normalizeProgramKey(program.name);
  const derivedKey = normalizeProgramKey(derivedName);
  const catalogName = clean(program.name);
  const isWeakCatalog =
    catalogName.length <= 5 ||
    /^(readme|setup|install|prog|program|app|unknown|sheep|file|new|test|\d+)$/i.test(catalogName) ||
    !catalogKey ||
    (derivedKey && catalogKey && !derivedKey.includes(catalogKey) && !catalogKey.includes(derivedKey) && /_by_|\[aol|\bfor\s+aol/i.test(filename));
  const isMoreComplete =
    derivedName &&
    catalogName &&
    derivedName.length > catalogName.length + 3 &&
    derivedKey.startsWith(catalogKey || " ");
  return {
    filename,
    derivedName,
    derivedAuthor: byline?.author || "",
    derivedAolVersion: versionMatch ? `AOL ${clean(versionMatch[1]).replace(/\s+/g, "")}` : "",
    bestName: isWeakCatalog || isMoreComplete ? derivedName : catalogName,
    reason: isWeakCatalog || isMoreComplete ? "archive filename" : "catalog",
  };
}

function resolveHref(href, pageUrl) {
  if (!href) return "";
  let value = clean(href);
  if (!value || value.startsWith("#") || /^javascript:/i.test(value)) return "";
  if (value.startsWith("//")) value = `https:${value}`;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/web/")) return `https://web.archive.org${value}`;
  try {
    return new URL(value, pageUrl).href;
  } catch {
    return "";
  }
}

function originalUrl(url) {
  const match = String(url || "").match(/^https?:\/\/web\.archive\.org\/web\/[^/]+\/(https?:\/\/.*)$/i);
  return match?.[1] || url;
}

function classifyUrl(url) {
  if (/\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx)(?:[?#]|$)/i.test(url)) return "download";
  if (/\.(gif|png|jpe?g|bmp|webp)(?:[?#]|$)/i.test(url)) return "image";
  return "page";
}

function extractLinks(html, pageUrl) {
  const links = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = resolveHref(match[1], pageUrl);
    if (!url) continue;
    links.push({
      text: stripHtml(match[2]) || basenameFromUrl(url) || url,
      url,
      originalUrl: originalUrl(url),
      type: classifyUrl(url),
    });
  }
  for (const match of html.matchAll(/<img\b[^>]*(?:src|data-src)\s*=\s*["']?([^"'\s>]+)[^>]*>/gi)) {
    const url = resolveHref(match[1], pageUrl);
    if (!url) continue;
    links.push({
      text: basenameFromUrl(url) || "image",
      url,
      originalUrl: originalUrl(url),
      type: "image",
    });
  }
  return links;
}

function extractHeadingSections(html, pageUrl, sourceName) {
  const headings = [...html.matchAll(/<h([2-6])\b[^>]*(?:id=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/h\1>/gi)].map(
    (match) => ({
      level: Number(match[1]),
      id: clean(match[2]),
      text: stripHtml(match[3]),
      index: match.index || 0,
      raw: match[0],
    }),
  );
  const sections = [];
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    if (!heading.text || heading.text.length > 120) continue;
    const next = headings.find((candidate, idx) => idx > i && candidate.level <= heading.level);
    const htmlPart = html.slice(heading.index + heading.raw.length, next?.index ?? Math.min(html.length, heading.index + 5000));
    const text = stripHtml(htmlPart).slice(0, 900);
    const aolMatch = text.match(
      /\bAOL\s+Version(?:\(s\))?\s*:?\s*((?:all|unknown|\d+(?:\.\d+)?)(?:\s*(?:[-/,]|and)\s*(?:all|unknown|\d+(?:\.\d+)?))*)/i,
    );
    const author = parseByline(heading.text)?.author || "";
    const sectionLinks = extractLinks(htmlPart, pageUrl).slice(0, 20);
    const detailBits = [];
    const inferredAolVersion = aolMatch ? clean(aolMatch[1]).split(/\s{2,}|Website|Download|From/i)[0].trim() : "";
    if (inferredAolVersion) detailBits.push(`AOL/version listed as ${inferredAolVersion}.`);
    if (sectionLinks.some((item) => item.type === "download")) detailBits.push(`${sectionLinks.filter((item) => item.type === "download").length} download link(s) in the source section.`);
    if (sectionLinks.some((item) => item.type === "image")) detailBits.push(`${sectionLinks.filter((item) => item.type === "image").length} image link(s) in the source section.`);
    if (/\bwebsite\s*:/i.test(text)) detailBits.push("Website field present in the source section.");
    sections.push({
      level: heading.level,
      sourceName,
      sourceUrl: pageUrl,
      heading: heading.text,
      anchorUrl: heading.id ? `${pageUrl.split("#")[0]}#${heading.id}` : pageUrl,
      inferredName: parseByline(heading.text)?.name || heading.text,
      inferredAuthor: author,
      inferredAolVersion,
      summary: detailBits.join(" ") || "Program heading matched in the source section.",
      links: sectionLinks,
    });
  }
  return sections;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "AOL-Progz-enrichment/1.0" },
    });
    const buffer = await response.arrayBuffer();
    const text = new TextDecoder("windows-1252").decode(buffer);
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function addLimited(list, item, keyFn, max = 20) {
  const key = keyFn(item);
  if (!key) return;
  if (list.some((existing) => keyFn(existing) === key)) return;
  if (list.length < max) list.push(item);
}

function buildProgramMatcher(programs, inferredById) {
  const keyMap = new Map();
  const genericKeys = new Set([
    "aol",
    "aim",
    "archive",
    "beta",
    "booter",
    "buster",
    "crack",
    "cracker",
    "download",
    "fader",
    "file",
    "final",
    "index",
    "install",
    "installer",
    "idler",
    "linker",
    "main",
    "mailer",
    "new",
    "old",
    "private",
    "prog",
    "program",
    "public",
    "punter",
    "readme",
    "scroller",
    "server",
    "setup",
    "source",
    "tool",
    "tools",
    "toolz",
    "unknown",
    "zip",
  ]);
  const add = (key, program) => {
    if (!key || key.length < 3) return;
    if (genericKeys.has(key)) return;
    const list = keyMap.get(key) || [];
    if (list.some((item) => item.id === program.id)) return;
    list.push(program);
    keyMap.set(key, list);
  };
  for (const program of programs) {
    const inferred = inferredById.get(program.id) || {};
    const candidates = [
      program.name,
      inferred.bestName,
      inferred.derivedName,
      fileStem(program.file),
      fileStem(program.download?.path),
      archiveFilename(program),
    ];
    for (const candidate of candidates) {
      add(normalizeProgramKey(candidate), program);
    }
  }
  const sortedKeys = [...keyMap.keys()]
    .filter((key) => key.length >= 5 && !genericKeys.has(key))
    .sort((a, b) => b.length - a.length);
  return function matchProgram(...values) {
    const candidateKeys = values
      .filter(Boolean)
      .flatMap((value) => [normalizeProgramKey(value), normalizeProgramKey(fileStem(value))])
      .filter((key) => key.length >= 3 && !genericKeys.has(key));
    for (const key of candidateKeys) {
      const exact = keyMap.get(key);
      if (exact?.length === 1) return { program: exact[0], matchedBy: `exact:${key}` };
    }
    for (const key of candidateKeys.filter((item) => item.length >= 5)) {
      for (const known of sortedKeys) {
        if (known.length < 5) continue;
        if (key.includes(known) || known.includes(key)) {
          const matches = keyMap.get(known) || [];
          if (matches.length === 1) return { program: matches[0], matchedBy: `loose:${known}` };
        }
      }
    }
    return null;
  };
}

function fileSizeFor(program) {
  if (program.download?.size) {
    return { bytes: program.download.size, label: program.download.sizeLabel || "" };
  }
  if (program.download?.path) {
    const fullPath = path.join(rootDir, program.download.path);
    if (existsSync(fullPath)) {
      const bytes = statSync(fullPath).size;
      return { bytes, label: formatBytes(bytes) };
    }
  }
  return { bytes: 0, label: "" };
}

function formatBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function addManualEvidence(perProgram) {
  const rampageIds = ["prog-1574-rampage-toolz", "prog-1575-rampage2"];
  const sourceName = "User-supplied Rampage/Oogle reference";
  const sourceUrl = "https://web.archive.org/web/20010212021145/http://www.oogle.net/main.htm";
  const mention = {
    sourceName,
    sourceUrl,
    label: "Rampage Toolz and Oogle (Justin Tunney)",
    url: sourceUrl,
    originalUrl: sourceUrl,
    kind: "manual evidence",
    matchedBy: "manual:rampage-oogle",
    inferredAuthor: "Oogle (Justin Tunney)",
    inferredAolVersion: "",
    summary:
      "The supplied Oogle/Rampage reference identifies Rampage Toolz, including version 2.0, as Oogle / Justin Tunney work and points to archived Oogle resources.",
  };
  const sourceZip = {
    sourceName,
    sourceUrl,
    label: "Rampage Toolz 2 source code",
    url: "https://web.archive.org/web/20130805181931/http://www.oogle.com/download/rampagetools2source.zip",
    originalUrl: "http://www.oogle.com/download/rampagetools2source.zip",
    kind: "manual old-web download lead",
    matchedBy: "manual:rampage-oogle",
  };
  const setupExe = {
    sourceName: "Oogle AIM progs",
    sourceUrl: "https://web.archive.org/web/20010424150235/http://www.oogle.net/d_aimprogs.htm",
    label: "Rampage Toolz 2.0 setup",
    url: "https://web.archive.org/web/20010613064806/http://www.oogle.net/rampage/setuprt22.exe",
    originalUrl: "http://www.oogle.net/rampage/setuprt22.exe",
    kind: "manual old-web download lead",
    matchedBy: "manual:rampage-oogle",
  };

  for (const id of rampageIds) {
    const record = perProgram[id];
    if (!record) continue;
    record.manualAuthor = "Oogle (Justin Tunney)";
    record.manualPurposeSignals = ["All-in-one prog suite", "AOL/AIM chat utility", "Scroller / macro"];
    if (!record.inferredAuthor) record.inferredAuthor = "Oogle (Justin Tunney)";
    if (id === "prog-1575-rampage2" && record.bestNameSource === "catalog") {
      record.bestName = "Rampage Toolz 2.0";
      record.bestNameSource = sourceName;
    }
    addLimited(record.webMentions, mention, (item) => `${item.sourceName}|${item.label}|${item.url}`, 16);
    addLimited(record.webDownloadLinks, sourceZip, (item) => item.originalUrl || item.url, 30);
    addLimited(record.webDownloadLinks, setupExe, (item) => item.originalUrl || item.url, 30);
  }
}

async function main() {
  const catalog = readCatalog();
  const programs = catalog.programs || [];
  const webResources = readJson("data/web-resources.json", { pages: [], links: [] });
  const externalDownloads = readJson("data/external-downloads.json", { downloads: [], mirrorGroups: [] });
  const externalArchiveText = readJson("data/external-archive-text.json", { byLocalPath: {} });
  const missingCandidates = readJson("data/missing-candidates.json", { candidates: [] });
  const archiveTextMetadata = readJson("data/archive-text-metadata.json", { perProgram: {} });
  const inferredById = new Map(programs.map((program) => [program.id, inferFromFilename(program)]));
  const matchProgram = buildProgramMatcher(programs, inferredById);

  const perProgram = {};
  for (const program of programs) {
    const inferred = inferredById.get(program.id);
    const size = fileSizeFor(program);
    const archiveText = archiveTextMetadata.perProgram?.[program.id] || {};
    perProgram[program.id] = {
      programId: program.id,
      catalogName: clean(program.name),
      bestName: inferred.bestName || clean(program.name),
      bestNameSource: inferred.reason || "catalog",
      archiveFilename: inferred.filename || archiveFilename(program),
      fileSizeBytes: size.bytes,
      fileSize: size.label,
      inferredAuthor: inferred.derivedAuthor || "",
      inferredAolVersion: inferred.derivedAolVersion || "",
      archiveTextAuthor: clean(archiveText.preferredAuthor),
      archiveAuthorCandidates: archiveText.authorCandidates || [],
      archiveTextFiles: archiveText.textFiles || [],
      archivePurposeSignals: archiveText.purposeSignals || [],
      archiveAolVersions: archiveText.aolVersionMentions || [],
      archiveTextNotes: archiveText.notes || [],
      manualAuthor: "",
      manualPurposeSignals: [],
      authorConflict: "",
      webMentions: [],
      webDownloadLinks: [],
      webImageLinks: [],
      mirrorLinks: [],
      externalArchiveTextEvidence: [],
    };
  }

  addManualEvidence(perProgram);

  for (const link of webResources.links || []) {
    const match = matchProgram(link.text, link.originalUrl, link.url);
    if (!match) continue;
    const record = perProgram[match.program.id];
    const base = {
      sourceName: link.pageName || "crawled source page",
      sourceUrl: link.pageUrl || "",
      label: clean(link.text) || basenameFromUrl(link.originalUrl || link.url),
      url: link.url,
      originalUrl: link.originalUrl || originalUrl(link.url),
      matchedBy: match.matchedBy,
    };
    if (link.type === "download") {
      addLimited(record.webDownloadLinks, { ...base, kind: "crawled download link" }, (item) => item.originalUrl || item.url, 30);
    } else if (link.type === "image") {
      addLimited(record.webImageLinks, { ...base, kind: "crawled image" }, (item) => item.originalUrl || item.url, 12);
    }
  }

  for (const page of webResources.pages || []) {
    for (const link of page.links || []) {
      const match = matchProgram(link.text, link.originalUrl, link.url);
      if (!match) continue;
      const record = perProgram[match.program.id];
      const base = {
        sourceName: page.name || "crawled source page",
        sourceUrl: page.url || "",
        label: clean(link.text) || basenameFromUrl(link.originalUrl || link.url),
        url: link.url,
        originalUrl: link.originalUrl || originalUrl(link.url),
        matchedBy: match.matchedBy,
      };
      if (link.type === "download") {
        addLimited(record.webDownloadLinks, { ...base, kind: "source-page download link" }, (item) => item.originalUrl || item.url, 30);
      } else if (link.type === "image") {
        addLimited(record.webImageLinks, { ...base, kind: "source-page image" }, (item) => item.originalUrl || item.url, 12);
      }
    }
  }

  const detailPages = [
    { name: "AOLUnderground.com ProGGieS", url: "https://aolunderground.com/proggies/" },
    {
      name: "Plozee AOL proggies history article",
      url: "https://plozee.com/aol-proggies-and-punters-a-neglected-part-of-internet-history/",
    },
  ];
  const fetchedDetails = [];
  for (const page of detailPages) {
    try {
      const fetched = await fetchHtml(page.url);
      fetchedDetails.push({ ...page, ok: fetched.ok, status: fetched.status });
      if (!fetched.ok) continue;
      const sections = extractHeadingSections(fetched.text, page.url, page.name);
      for (const section of sections) {
        if (section.level < 4) continue;
        const match = matchProgram(section.inferredName, section.heading);
        if (!match) continue;
        const record = perProgram[match.program.id];
        const byline = parseByline(section.heading);
        if (byline?.name && record.bestNameSource === "catalog" && normalizeProgramKey(byline.name).length > normalizeProgramKey(record.bestName).length) {
          record.bestName = byline.name;
          record.bestNameSource = page.name;
        }
        if (byline?.author && !record.inferredAuthor) record.inferredAuthor = byline.author;
        if (section.inferredAolVersion && !record.inferredAolVersion) record.inferredAolVersion = section.inferredAolVersion;
        addLimited(
          record.webMentions,
          {
            sourceName: page.name,
            sourceUrl: page.url,
            label: section.heading,
            url: section.anchorUrl,
            originalUrl: section.anchorUrl,
            kind: "program section",
            matchedBy: match.matchedBy,
            summary: section.summary,
            inferredAolVersion: section.inferredAolVersion,
            inferredAuthor: byline?.author || "",
          },
          (item) => `${item.sourceName}|${item.label}|${item.url}`,
          16,
        );
        for (const link of section.links) {
          const targetList = link.type === "image" ? record.webImageLinks : link.type === "download" ? record.webDownloadLinks : record.webMentions;
          addLimited(
            targetList,
            {
              sourceName: page.name,
              sourceUrl: page.url,
              label: clean(link.text) || section.heading,
              url: link.url,
              originalUrl: link.originalUrl || originalUrl(link.url),
              kind: `program-section ${link.type}`,
              matchedBy: match.matchedBy,
            },
            (item) => item.originalUrl || item.url,
            link.type === "download" ? 30 : 16,
          );
        }
      }
    } catch (error) {
      fetchedDetails.push({ ...page, ok: false, status: 0, error: error.message });
    }
  }

  for (const item of externalDownloads.downloads || []) {
    const match = matchProgram(item.name, item.originalUrl, item.waybackUrl);
    if (!match) continue;
    const record = perProgram[match.program.id];
    addLimited(
      record.mirrorLinks,
      {
        sourceName: item.sourceList || "external URL list",
        label: item.name || basenameFromUrl(item.originalUrl),
        originalUrl: item.originalUrl,
        waybackUrl: item.waybackUrl,
        localPath: item.localPath || "",
        status: item.status || "",
        matchedBy: match.matchedBy,
      },
      (mirror) => mirror.originalUrl || mirror.waybackUrl,
      24,
    );
    const evidence = item.localPath ? externalArchiveText.byLocalPath?.[item.localPath] : null;
    if (evidence?.scanned && evidence.textFileCount > 0) {
      addLimited(
        record.externalArchiveTextEvidence,
        {
          sourceName: item.sourceList || "external URL list",
          label: item.name || basenameFromUrl(item.originalUrl),
          localPath: item.localPath || "",
          originalUrl: item.originalUrl || "",
          waybackUrl: item.waybackUrl || "",
          textFileCount: evidence.textFileCount || 0,
          textFiles: evidence.textFiles || [],
          preferredAuthor: evidence.preferredAuthor || "",
          authorCandidates: evidence.authorCandidates || [],
          purposeSignals: evidence.purposeSignals || [],
          versionMentions: evidence.versionMentions || [],
          descriptionCandidates: evidence.descriptionCandidates || [],
          urls: evidence.urls || [],
          matchedBy: match.matchedBy,
        },
        (archiveEvidence) => archiveEvidence.localPath || archiveEvidence.originalUrl,
        8,
      );
    }
  }
  for (const candidate of missingCandidates.candidates || []) {
    const match = matchProgram(candidate.fileName || candidate.key, ...(candidate.mirrors || []).map((mirror) => mirror.url || mirror.waybackUrl));
    if (!match) continue;
    for (const mirror of candidate.mirrors || []) {
      addLimited(
        perProgram[match.program.id].mirrorLinks,
        {
          sourceName: mirror.source || "missing-candidate mirrors",
          label: candidate.fileName || candidate.key,
          originalUrl: mirror.url || "",
          waybackUrl: mirror.waybackUrl || "",
          status: mirror.status || "",
          matchedBy: match.matchedBy,
        },
        (item) => item.originalUrl || item.waybackUrl,
        24,
      );
    }
  }

  for (const program of programs) {
    const record = perProgram[program.id];
    const catalogAuthor = clean(program.author);
    const evidenceAuthor = clean(record.manualAuthor || record.archiveTextAuthor || record.inferredAuthor);
    if (catalogAuthor && evidenceAuthor && catalogAuthor.toLowerCase() !== evidenceAuthor.toLowerCase()) {
      record.authorConflict = `Catalog listed ${catalogAuthor}; evidence prefers ${evidenceAuthor}.`;
    }
  }

  const records = Object.values(perProgram);
  const data = {
    generatedAt: new Date().toISOString(),
    programCount: programs.length,
    programsWithImprovedNames: records.filter((item) => item.bestName && item.bestName !== item.catalogName).length,
    programsWithInferredAuthors: records.filter((item) => item.inferredAuthor).length,
    programsWithManualAuthors: records.filter((item) => item.manualAuthor).length,
    programsWithManualPurposeSignals: records.filter((item) => item.manualPurposeSignals?.length).length,
    programsWithArchiveTextAuthors: records.filter((item) => item.archiveTextAuthor).length,
    programsWithAuthorConflicts: records.filter((item) => item.authorConflict).length,
    programsWithArchivePurposeSignals: records.filter((item) => item.archivePurposeSignals.length).length,
    programsWithArchiveAolVersionMentions: records.filter((item) => item.archiveAolVersions.length).length,
    programsWithInferredAolVersions: records.filter((item) => item.inferredAolVersion).length,
    programsWithWebMentions: records.filter((item) => item.webMentions.length).length,
    programsWithWebDownloadLinks: records.filter((item) => item.webDownloadLinks.length).length,
    programsWithWebImageLinks: records.filter((item) => item.webImageLinks.length).length,
    programsWithMirrorLinks: records.filter((item) => item.mirrorLinks.length).length,
    programsWithExternalArchiveTextEvidence: records.filter((item) => item.externalArchiveTextEvidence.length).length,
    fetchedDetails,
    perProgram,
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(outJs, `window.AOL_PROGZ_PROGRAM_ENRICHMENT = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(
    `Built enrichment for ${data.programCount} programs: ${data.programsWithImprovedNames} improved names, ${data.programsWithWebDownloadLinks} with web downloads, ${data.programsWithWebMentions} with web mentions.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
