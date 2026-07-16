import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const rootDir = path.resolve(import.meta.dirname, "..");
const generatedRoot = "docs/generated";
const generatedDir = path.join(rootDir, generatedRoot);
const showProgress = /^(1|true|yes)$/i.test(process.env.AOL_DOC_PROGRESS || "");

function progress(message) {
  if (showProgress) console.log(`[docs] ${message}`);
}

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
    .replace(/\s+/g, " ")
    .trim();
}

function md(value) {
  const text = clean(value);
  return text ? text.replace(/\|/g, "\\|") : "unknown";
}

function mdCode(value) {
  const text = clean(value);
  return text ? `\`${text.replace(/`/g, "'")}\`` : "unknown";
}

function slugify(value) {
  const slug = clean(value)
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[_\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || "unknown";
}

function titleCase(value) {
  return clean(value)
    .split(/\s+/)
    .map((word) => {
      if (/^(aol|aim|icq|msn|vb|tos|oh|afk|im)$/i.test(word)) return word.toUpperCase();
      return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function sortByName(items) {
  return [...items].sort((a, b) => clean(a.name).localeCompare(clean(b.name), "en"));
}

function groupBy(items, getKey) {
  const map = new Map();
  for (const item of items) {
    const key = clean(getKey(item)) || "unknown";
    const list = map.get(key) || [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function writeDoc(relativePath, body) {
  const fullPath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${body.trim()}\n`, "utf8");
}

function relLink(fromDoc, target) {
  if (!target) return "";
  if (/^https?:\/\//i.test(target)) return target;
  let relative = path.posix.relative(path.posix.dirname(fromDoc), target.replaceAll("\\", "/"));
  if (!relative) relative = ".";
  return relative
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
    .replace(/%23/g, "#");
}

function link(label, url) {
  if (!url) return md(label);
  return `[${md(label)}](${url})`;
}

function localLink(fromDoc, label, target) {
  if (!target) return md(label);
  return link(label, relLink(fromDoc, target));
}

function table(headers, rows) {
  const header = `| ${headers.map(md).join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${row.map(md).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function valueOrUnknown(value) {
  return clean(value) || "unknown";
}

function versionLabel(program) {
  const version = clean(program.versions);
  if (!version) return "Mixed/unknown";
  if (/^\d+(?:\.\d+)?$/.test(version)) return `AOL ${version}`;
  return titleCase(version);
}

function versionSlug(program) {
  return slugify(versionLabel(program));
}

function firstBucket(program) {
  const name = clean(program.name);
  const first = name.slice(0, 1).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "0-9-symbols";
}

function categoryDescription(category) {
  const descriptions = {
    "all-in-one prog":
      "A bundled AOL-era utility suite. These often mixed chat tools, idlers, faders, linkers, file helpers, and other scene features in one interface.",
    "chat or IM tool":
      "A chat, instant-message, command, linker, or room workflow utility. These are described here as historical interface helpers only.",
    "account or TOS tool":
      "Account, password, Terms of Service, phishing, or termination-adjacent tooling. Preserved for historical classification only; do not treat these pages as instructions.",
    "development or source":
      "Source code, Visual Basic material, controls, modules, tutorials, or development support files.",
    "fader or text tool":
      "A text effect utility, usually for color fades, styled text, profile text, room text, or IM formatting.",
    "idler or bot":
      "A presence, away-message, AFK, autoreply, or simple automation tool for AOL/AIM-era sessions.",
    "mass mailer":
      "Bulk-mail or mail-bomb-adjacent tooling. Preserved for archive context only.",
    punter:
      "A disruptive disconnect/booting category from AOL chat-room history. Preserved as historical vocabulary only.",
    "room buster":
      "A room-entry or room-disruption category associated with repeatedly trying to enter full rooms or interact with room state.",
    "screen name tool":
      "A screen-name checker, scanner, maker, or related identity-management utility.",
    "scroller or macro":
      "A macro, ASCII art, canned-command, or repeated-text utility for chat/profile output.",
    uncategorized:
      "The catalog metadata and filename do not identify a confident single function yet. These need readme/source review or isolated inspection.",
  };
  return descriptions[category] || descriptions.uncategorized;
}

function safetyNote(category) {
  if (/account|tos|punter|room buster|mass mailer/i.test(category)) {
    return "Historical preservation only. This project records the category, files, links, and screenshots without documenting harmful operating steps.";
  }
  return "Historical preservation note: unknown binaries should only be inspected in an isolated vintage VM or emulator.";
}

function appTags(program, embeddedUrls) {
  const tags = new Set();
  const enrichment = enrichmentFor(program);
  tags.add(slugify(program.platform || "unknown-platform"));
  tags.add(slugify(versionLabel(program)));
  tags.add(slugify(program.category || "uncategorized"));
  if (program.visualBasic) tags.add(slugify(program.visualBasic));
  if (program.compile) tags.add(`compile-${slugify(program.compile)}`);
  if (program.download?.status) tags.add(`file-${slugify(program.download.status)}`);
  if (program.screenshotCount > 0) tags.add("has-screenshots");
  if (embeddedUrls?.length) tags.add("has-embedded-urls");
  if (program.duplicates > 0) tags.add("duplicate-metadata");
  if (program.password) tags.add("password-metadata");
  if (enrichment.archiveTextAuthor) tags.add("has-archive-text-author");
  if (enrichment.manualPurposeSignals?.length) tags.add("has-manual-purpose-clues");
  if (enrichment.archivePurposeSignals?.length) tags.add("has-readme-purpose-clues");
  if (enrichment.archiveAolVersions?.length) tags.add("has-readme-aol-version-clues");
  if (enrichment.externalArchiveTextEvidence?.length) tags.add("has-external-zip-text-evidence");
  if (enrichment.webDownloadLinks?.length) tags.add("has-old-web-downloads");
  return [...tags].sort();
}

function appPurpose(program) {
  const category = clean(program.category) || "uncategorized";
  const enrichment = enrichmentFor(program);
  const bits = [categoryDescription(category)];
  const name = `${program.name} ${program.file}`.toLowerCase();
  const cues = [];
  if (/\bfade|fader|phader/.test(name)) cues.push("text fading");
  if (/\bidle|afk/.test(name)) cues.push("idling or away automation");
  if (/\blink/.test(name)) cues.push("linking/chat link workflows");
  if (/\bscroll|ascii|macro/.test(name)) cues.push("scrolling, macros, or ASCII text");
  if (/\broom|bust/.test(name)) cues.push("room buster vocabulary");
  if (/\bpunt|boot|nuke/.test(name)) cues.push("punter/booter vocabulary");
  if (/\bmail|mmer|spam/.test(name)) cues.push("mailing or mass-mail vocabulary");
  if (/\bphish|pass|password|tos|term/.test(name)) cues.push("account/TOS abuse vocabulary");
  if (cues.length) bits.push(`Filename/catalog cues suggest: ${cues.join(", ")}.`);
  if (enrichment.archivePurposeSignals?.length) {
    bits.push(`Readable archive text also suggests: ${enrichment.archivePurposeSignals.slice(0, 6).join(", ")}.`);
  }
  const externalSignals = uniqueBy(
    (enrichment.externalArchiveTextEvidence || []).flatMap((item) => item.purposeSignals || []),
    (item) => item,
  );
  if (externalSignals.length) {
    bits.push(`Recovered external ZIP text also suggests: ${externalSignals.slice(0, 6).join(", ")}.`);
  }
  if (enrichment.manualPurposeSignals?.length) {
    bits.push(`Curated source evidence also suggests: ${enrichment.manualPurposeSignals.slice(0, 6).join(", ")}.`);
  }
  return bits.join(" ");
}

function programType(program) {
  const enrichment = enrichmentFor(program);
  const haystack = `${program.name} ${program.file} ${program.category}`.toLowerCase();
  const checks = [
    ["All-in-one prog suite", /\b(aohell|hell|toolz|tools|proggy|progz|suite|collection)\b/],
    ["Room buster", /\b(room[-\s]?buster|room[-\s]?bust|roombust|bust[-\s]?in|buster)\b/],
    ["Punter / booter", /\b(punt|punter|punta|boot|booter|nuke|knock|disconnect)\b/],
    ["Fader / text styler", /\b(fader|fade|phader|rainbow|color|font|text[-\s]?tool)\b/],
    ["Idler / AFK bot", /\b(idle|idler|afk|away|auto[-\s]?reply|autoreply)\b/],
    ["C-Com / command list", /\b(c[-\s]?com|ccom|comz|commands?)\b/],
    ["Scroller / macro", /\b(scroll|scroller|macro|ascii|banner)\b/],
    ["Linker / chat linker", /\b(linker|links?|url)\b/],
    ["Mass mailer / server", /\b(mmer|mass[-\s]?mail|mailer|mail[-\s]?bomb|server|spam|spammer)\b/],
    ["Account / TOS utility", /\b(phish|fish|pass|password|pw|cracker|crack|tos|termer|term|account|card)\b/],
    ["Screen-name utility", /\b(screen[-\s]?name|sn[-\s]?tool|sn[-\s]?check|scanner|checker)\b/],
    ["Source / developer file", /\b(source|module|bas|vb|ocx|dll|control|tutorial|decompile)\b/],
    ["Media / file utility", /\b(mp3|player|wav|sound|file|download|image|picture)\b/],
    ["Chat / IM utility", /\b(chat|im|instant[-\s]?message|message|msg)\b/],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(haystack)) return label;
  }
  if (enrichment.manualPurposeSignals?.length) return enrichment.manualPurposeSignals[0];
  if (enrichment.archivePurposeSignals?.length) return enrichment.archivePurposeSignals[0];
  if (clean(program.category) && program.category !== "uncategorized") return titleCase(program.category);
  return "Unknown / needs review";
}

function fileStem(filePath) {
  return path.posix.basename(clean(filePath)).replace(/\.[^.]+$/, "");
}

function urlHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function originalFromWayback(url) {
  const match = String(url || "").match(/^https?:\/\/web\.archive\.org\/web\/[^/]+\/(https?:\/\/.*)$/i);
  return match?.[1] || url;
}

function canonicalUrl(url) {
  try {
    const parsed = new URL(originalFromWayback(url));
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }
    return parsed.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return clean(url).replace(/\/$/, "").toLowerCase();
  }
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function compactRows(rows, max = 250) {
  if (rows.length <= max) return rows;
  return rows.slice(0, max);
}

function enrichmentFor(program) {
  return programEnrichment.perProgram?.[program.id] || {};
}

function displayName(program) {
  return clean(enrichmentFor(program).bestName) || clean(program.name) || "Unknown program";
}

function displayAuthor(program) {
  const catalogAuthor = clean(program.author);
  const enrichment = enrichmentFor(program);
  const manualAuthor = clean(enrichment.manualAuthor);
  const archiveAuthor = clean(enrichment.archiveTextAuthor);
  const inferredAuthor = clean(enrichmentFor(program).inferredAuthor);
  const preferred = manualAuthor || archiveAuthor || inferredAuthor || catalogAuthor;
  if (preferred && catalogAuthor && preferred.toLowerCase() !== catalogAuthor.toLowerCase()) {
    return `${preferred}; catalog listed ${catalogAuthor}`;
  }
  return preferred || "unknown";
}

function primaryAuthor(program) {
  const enrichment = enrichmentFor(program);
  return clean(enrichment.manualAuthor || enrichment.archiveTextAuthor || enrichment.inferredAuthor || program.author);
}

function displayVersion(program) {
  const catalogVersion = versionLabel(program);
  const inferredVersion = clean(enrichmentFor(program).inferredAolVersion);
  const archiveVersions = enrichmentFor(program).archiveAolVersions || [];
  const archiveText = archiveVersions.length ? `archive text: ${archiveVersions.join(", ")}` : "";
  if (inferredVersion && catalogVersion === "Mixed/unknown") return inferredVersion;
  if (inferredVersion && inferredVersion.toLowerCase() !== catalogVersion.toLowerCase()) {
    return [catalogVersion, `inferred: ${inferredVersion}`, archiveText].filter(Boolean).join("; ");
  }
  if (archiveText) return `${catalogVersion}; ${archiveText}`;
  return catalogVersion;
}

function fileSizeLabel(program) {
  return clean(enrichmentFor(program).fileSize) || clean(program.download?.sizeLabel) || "unknown";
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function archiveFileName(program) {
  return clean(enrichmentFor(program).archiveFilename) || path.posix.basename(clean(program.file) || clean(program.download?.path) || "");
}

function joinedWebLinks(items, labelKey = "label", urlKey = "url") {
  const links = (items || [])
    .filter((item) => clean(item[urlKey] || item.originalUrl || item.waybackUrl))
    .map((item) => link(clean(item[labelKey]) || clean(item[urlKey] || item.originalUrl || item.waybackUrl), item[urlKey] || item.originalUrl || item.waybackUrl));
  return links.length ? links.join("<br>") : "unknown";
}

function joinedMirrorLinks(items, fromDoc = "docs/generated/applications/all-program-downloads.md") {
  const links = [];
  for (const item of items || []) {
    if (item.originalUrl) links.push(link(item.originalUrl, item.originalUrl));
    if (item.waybackUrl) links.push(link(`${item.label || "mirror"} Wayback`, item.waybackUrl));
    if (item.localPath) links.push(localLink(fromDoc, item.localPath, item.localPath));
  }
  return links.length ? links.join("<br>") : "unknown";
}

function joinedReferenceMirrorLinks(program) {
  const links = [];
  if (program.download?.originalUrl) links.push(link("reference page", program.download.originalUrl));
  if (program.download?.rawUrl) links.push(link("reference raw file", program.download.rawUrl));
  return links.length ? links.join("<br>") : "not listed";
}

function oldWebDownloadCount(program) {
  const enrichment = enrichmentFor(program);
  return String((enrichment.webDownloadLinks?.length || 0) + (enrichment.mirrorLinks?.length || 0));
}

function appTable(fromDoc, items) {
  return table(
    ["#", "Best known name", "Catalog label", "Prog type", "Category", "AOL/version", "Author", "Size", "File", "Shots"],
    sortByName(items).map((program) => [
      String(program.index),
      localLink(fromDoc, displayName(program), appDocPaths.get(program.id)),
      program.name,
      programType(program),
      program.category || "uncategorized",
      displayVersion(program),
      displayAuthor(program),
      fileSizeLabel(program),
      program.download?.path ? localLink(fromDoc, "local", program.download.path) : program.download?.status || "remote-only",
      String(program.screenshotCount || 0),
    ]),
  );
}

function programInventoryTable(fromDoc, items) {
  return table(
    [
      "#",
      "Best known name",
      "Catalog label",
      "Archive filename",
      "Size",
      "Prog type",
      "Category",
      "AOL/version",
      "Author",
      "Local file",
      "Old-web/download leads",
      "Reference mirror",
      "Embedded URLs",
      "Screens",
    ],
    items.map((program) => {
      const embedded = uniqueBy(urlIndex.perProgram?.[program.id]?.urls || [], (item) => item.url);
      const enrichment = enrichmentFor(program);
      return [
        String(program.index),
        localLink(fromDoc, displayName(program), appDocPaths.get(program.id)),
        program.name,
        archiveFileName(program),
        fileSizeLabel(program),
        programType(program),
        program.category || "uncategorized",
        displayVersion(program),
        displayAuthor(program),
        program.download?.path ? localLink(fromDoc, program.download.path, program.download.path) : program.download?.status || "remote-only",
        oldWebDownloadCount(program),
        joinedReferenceMirrorLinks(program),
        embedded.length ? embedded.map((item) => link(item.url, item.url)).join("<br>") : "",
        String(program.screenshotCount || 0),
      ];
    }),
  );
}

function programDownloadTable(fromDoc, items) {
  return table(
    [
      "#",
      "Best known name",
      "Catalog label",
      "Archive filename",
      "Size",
      "Local file",
      "Old-web and Wayback download leads",
      "Mirror leads",
      "Reference repository mirror",
    ],
    items.map((program) => {
      const enrichment = enrichmentFor(program);
      return [
        String(program.index),
        localLink(fromDoc, displayName(program), appDocPaths.get(program.id)),
        program.name,
        archiveFileName(program),
        fileSizeLabel(program),
        program.download?.path ? localLink(fromDoc, program.download.path, program.download.path) : program.download?.status || "remote-only",
        joinedWebLinks(enrichment.webDownloadLinks || [], "label", "url"),
        joinedMirrorLinks(enrichment.mirrorLinks || [], fromDoc),
        joinedReferenceMirrorLinks(program),
      ];
    }),
  );
}

function statRows(stats) {
  return (stats || []).map((item) => [
    item.name,
    String(item.count),
    item.local === undefined ? "" : String(item.local),
    item.screenshots === undefined ? "" : String(item.screenshots),
    item.sizeLabel || "",
  ]);
}

function inferredClientVersion(item) {
  const value = `${item.discoveredText || ""} ${item.name || ""} ${item.originalUrl || ""}`.toLowerCase();
  const explicit = value.match(/\b(aim|aol)\s+(?:version\s*)?(\d+(?:[._]\d+)*)\b/i);
  if (explicit) return `${explicit[1].toUpperCase()} ${explicit[2].replaceAll("_", ".")}`;
  const aimDotted = value.match(/\baim(\d+\.\d+(?:\.\d+)*)/i);
  if (aimDotted) return `AIM ${aimDotted[1]}`;
  const aimCompact = value.match(/\baim(?:[_-]?install)?[_-]?(\d)(\d)?(?:[._-](\d+))?/i);
  if (aimCompact) return `AIM ${[aimCompact[1], aimCompact[2] || "0", aimCompact[3]].filter(Boolean).join(".")}`;
  const aolGerman = value.match(/\baol\s*germany\s*(\d+(?:\.\d+)?)/i);
  if (aolGerman) return `AOL Germany ${aolGerman[1]}`;
  const aolCompact = value.match(/\baol(?:p|setup)?[_-]?(\d)(\d)?(?:[._-](\d+))?/i);
  if (aolCompact) return `AOL ${[aolCompact[1], aolCompact[2], aolCompact[3]].filter(Boolean).join(".")}`;
  const setupAol = value.match(/\bsetupaol[_-]?(\d)(\d)?/i);
  if (setupAol) return `AOL ${[setupAol[1], setupAol[2]].filter(Boolean).join(".")}`;
  return "";
}

function isClientOrRuntimeDownload(item) {
  const value = `${item.sourceList || ""} ${item.discoveredText || ""} ${item.name || ""} ${item.originalUrl || ""}`.toLowerCase();
  const source = String(item.sourceList || "").toLowerCase();
  const file = String(item.name || item.originalUrl || "").toLowerCase();
  if (/aol client and aim version directory|user-supplied dnx acp|user-supplied coltpro|user-supplied aol utility|aim versions|missing files/.test(source)) {
    return true;
  }
  if (/\.(dll|ocx|vbx)(?:$|[?#])/.test(file)) return true;
  return /\b(aim[_\s-]?(?:install|\d)|aim%20\d|aolp\d|setupaol|aol\dsetup|aolsetup|deadaim|aolcommunicator|msvbvm|comdlg|riched|chatocx|chatscan|msinet|mswinsck|vb5chat|vb40032)\b/.test(
    value,
  );
}

const catalog = readCatalog();
const programs = catalog.programs || [];
const urlIndex = readJson("data/url-index.json", { perProgram: {} });
const webResources = readJson("data/web-resources.json", { pages: [], links: [] });
const webAssets = readJson("data/web-assets.json", { assets: [] });
const externalDownloads = readJson("data/external-downloads.json", { downloads: [], mirrorGroups: [] });
const externalArchiveText = readJson("data/external-archive-text.json", { records: [], byLocalPath: {} });
const missingCandidates = readJson("data/missing-candidates.json", { candidates: [] });
const programEnrichment = readJson("data/program-enrichment.json", { perProgram: {} });
const externalDownloadByUrl = new Map((externalDownloads.downloads || []).map((item) => [canonicalUrl(item.originalUrl), item]));

function recoveryForUrl(url) {
  return externalDownloadByUrl.get(canonicalUrl(url)) || null;
}

function externalTextFor(item) {
  return item?.localPath ? externalArchiveText.byLocalPath?.[item.localPath] || null : null;
}

const userSuppliedLinks = [
  ["Reference mirror: AOL Underground Proggies Archive", "reference GitHub mirror", "https://github.com/ssstonebraker/aolunderground-proggies"],
  ["AOLUnderground.com ProGGieS", "scene index", "https://aolunderground.com/proggies/"],
  ["JustinAKAPaste", "large web archive", "https://justinakapaste.com/"],
  ["Legacy AOL Underground", "GitHub mirror/fork", "https://github.com/DamianSuess/Legacy-AOL-Underground"],
  ["HyPeR's AOL Progs", "old-school web list", "https://hyperspage.com/progs/aol-progs"],
  ["Plozee AOL proggies history article", "context article", "https://plozee.com/aol-proggies-and-punters-a-neglected-part-of-internet-history/"],
  ["Kadeklizem AOL Progs ARCHIVE.rar", "large Wayback file", "https://web.archive.org/web/20220321112058/http://kadeklizem.com/AOL%20Progs%20ARCHIVE.rar"],
  ["Aciddr0p", "old domain", "http://www.aciddr0p.net/"],
  ["Koin", "old domain", "https://koin.org/"],
  ["Rexflex Progs", "old domain", "https://progs.rexflex.net/"],
  ["DarcFX Submissions", "GitHub source/code archive", "https://github.com/darcfx/darcfx-submissions"],
  ["ProgzRescue", "Wayback recovery project", "https://github.com/raysuelzer/ProgzRescue"],
  ["ProgzRescue README", "raw project notes", "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/README.md"],
  ["ProgzRescue Geocities SiliconValley raw list", "raw URL list", "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-geocities-silicon-valley-files.txt"],
  ["ProgzRescue FortuneCity Skyscraper raw list", "raw URL list", "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-forune-city-skyscraper-files.txt"],
  ["Oogle.net archived main", "Oogle/Rampage resource", "https://web.archive.org/web/20010212021145/http://www.oogle.net/main.htm"],
  ["Oogle.net wildcard", "Wayback wildcard", "https://web.archive.org/web/*/http://www.oogle.net/*"],
  ["Rampage Toolz 2 source code", "Wayback download lead", "https://web.archive.org/web/20130805181931/http://www.oogle.com/download/rampagetools2source.zip"],
  ["Rampage Toolz 2 setup", "Wayback download lead", "https://web.archive.org/web/20010613064806/http://www.oogle.net/rampage/setuprt22.exe"],
  ["FreeProgz main", "Wayback prog hub", "https://web.archive.org/web/20010516214202/http://www.freeprogz.com/"],
  ["Oogle AIM progs", "AIM download page", "https://web.archive.org/web/20010424150235/http://www.oogle.net/d_aimprogs.htm"],
  ["AOL-Progz.com", "AOL prog portal", "https://web.archive.org/web/20010301094602/http://www.aol-progz.com:80/"],
  ["Angelfire progz capture index", "Wayback capture index", "https://web.archive.org/web/20250000000000*/http://www.angelfire.com/in3/progz/"],
  ["Prog.net", "user supplied URL", "https://web.archive.org/web/20020601170723/http://www.prog.net/"],
  ["AimThings", "AIM files and tricks", "https://web.archive.org/web/20030623040448/http://aimthings.com/"],
  ["Titan Spaceports progs", "prog list", "https://web.archive.org/web/20010504044037/http://titan.spaceports.com/~info/progs2.htm"],
  ["Rexflex live prog endpoint", "live endpoint", "https://progs.rexflex.net/prog"],
  ["LensHellArchive index", "prog archive hub", "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/Index.html"],
  ["LensHell AIM progs", "AIM progs", "https://web.archive.org/web/20111002120811/http://lenshellarchive.com/aim.html"],
  ["LensHell hells/progs", "AOL progs and categories", "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/hell.html"],
  ["LensHell faders", "faders", "https://web.archive.org/web/20110904002536/http://lenshellarchive.com/faders.html"],
  ["ProgStation AIM", "AIM progs", "https://web.archive.org/web/20010221023818/http://progstation.hypermart.net:80/aim.html"],
  ["PHAT secrets", "AIM/AOL secrets", "https://web.archive.org/web/20000611162712/http://solo5.abac.com/phat/secrets.htm"],
  ["FreeProgz links", "old link directory", "https://web.archive.org/web/20010603213502/http://www.freeprogz.com/links.htm#"],
  ["LolToolz progs", "Geocities prog page", "https://web.archive.org/web/20021018083822/http://www.geocities.com:80/loltoolz/progs.html"],
  ["LoLToolz AIM progs", "AIM progs local source snapshot", "https://web.archive.org/web/20021018083822/http://www.geocities.com/loltoolz/aim.htm"],
  ["ProgzRescue archived URLs", "GitHub recovery lists", "https://github.com/raysuelzer/ProgzRescue/tree/main/archived-urls"],
  ["ProgzRescue Angelfire raw list", "raw URL list", "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-angelfire-files.txt"],
  ["FreeProgz capture index", "Wayback capture index", "https://web.archive.org/web/20250000000000*/http://www.freeprogz.com/"],
  ["CoolKid CCT", "program page", "https://web.archive.org/web/20010428185554/http://coolkid.text2k.net/programs/cct/"],
  ["CoolKid SP how-to", "how-to page", "https://web.archive.org/web/20010514020453/http://coolkid.text2k.net/programs/sp/howto.html"],
  ["RiceJerry links", "link directory", "https://web.archive.org/web/20010223212351/http://www.8op.com:80/ricejerry/links.html"],
  ["Methodus2000 NetBus page", "historical remote-control patch page", "https://web.archive.org/web/20010111011900/http://www.methodus2000.com:80/methodustoolz/netbus.htm"],
  ["Methodus Toolz wildcard", "Wayback wildcard", "https://web.archive.org/web/*/http://www.methodus2000.com/methodustoolz/*"],
  ["Methodus2000 base wildcard", "Wayback wildcard", "https://web.archive.org/web/*/http://methodus2000.com/"],
  ["Digital5k AOL progz article", "scene history article", "https://adjkjc.github.io/www.digital5k.com/aol-progz-a-digital-throw-back-to-aol-1995/index.html"],
  ["AOL client and AIM version directory", "AOL/AIM client download directory", "https://am.net/lib/TOOLS/AOL/"],
  ["Click-Online AOL 4/5 progz", "AOL 4/5 prog list", "https://web.archive.org/web/20021015202014/http://click-online2000.com/aol45progz.htm"],
  ["Click-Online root", "old prog/resource site", "https://web.archive.org/web/20021120062315/http://click-online2000.com/"],
  ["ColtPro root", "old prog/resource site", "https://web.archive.org/web/20010923065731/http://www.coltpro.net/"],
  ["LensHell GitHub README", "GitHub source README", "https://raw.githubusercontent.com/lekhanh1234/lenshell/refs/heads/main/README.md"],
  ["Prig3k capture index", "Wayback capture index", "https://web.archive.org/web/20260000000000*/http://www.prig3k.com/"],
  ["Prig3k downloads category", "download category", "https://web.archive.org/web/20011109212659/http://www.prig3k.com/cgi-bin/free/dclinks.cgi?action=view_category&category=Downloads"],
  ["Dope2k index", "old prog/resource site", "https://web.archive.org/web/20020601131248/http://www.8op.com/dope2k/index2.html"],
  ["Hadez progs", "prog list", "https://web.archive.org/web/20020611082332/http://dnx-online.net:80/~hadez/progs.html"],
  ["DazuhProductionZ capture index", "Wayback capture index", "https://web.archive.org/web/*/http://www.angelfire.com/fl4/DazuhProductionZ/*"],
  ["AOElite capture index", "Wayback capture index", "https://web.archive.org/web/*/http://www.aoelite.com/*"],
  ["DeadAIM about", "AIM enhancement page", "https://web.archive.org/web/20031206092015/http://www.jdennis.net/DeadAIM/about.php"],
  ["AIMFilez files", "AIM files", "https://web.archive.org/web/20040405183602/http://aimfilez.com/?id=files1"],
  ["Format SN", "AOL utility download lead", "https://web.archive.org/web/20020601203124/http://www.8op.com/ironbloodownz/dopeeffects/FormatSN.zip"],
  ["DNX ACP AIM 4.4", "AIM client download lead", "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/AIM44.zip"],
  ["DNX ACP AOL Germany 3.0", "AOL client download lead", "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/AOL30german.exe"],
  ["DNX ACP Master AOL 5.0", "AOL utility download lead", "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/masteraol5.zip"],
  ["DNX ACP AIM Creation", "AIM utility download lead", "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/aimcreat.zip"],
  ["DNX ACP AIM Pluss", "AIM utility download lead", "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/aimpluss.zip"],
  ["DNX ACP Aimster", "AIM utility download lead", "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/aimster.zip"],
  ["DNX ACP AC AIM Password Cracker", "hazardous/account-context download lead", "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/acaimpasswordcracker.zip"],
  ["DNX ACP AOL File Downloader 5.0", "AOL utility download lead", "https://web.archive.org/web/20020411053028/http://www.dnx-online.net/~acp/downloads/aolfiledownloader50.zip"],
  ["ColtPro missing ChatOCX2.ocx", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/ChatOCX2.ocx"],
  ["ColtPro missing chatscan3.ocx", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/chatscan%C2%B3.ocx"],
  ["ColtPro missing COMDLG32.DLL", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/COMDLG32.DLL"],
  ["ColtPro missing COMDLG32.OCX", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/COMDLG32.OCX"],
  ["ColtPro missing msinet.ocx", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/msinet.ocx"],
  ["ColtPro missing MSVBVM60.DLL", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/MSVBVM60.DLL"],
  ["ColtPro missing mswinsck.ocx", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/mswinsck.ocx"],
  ["ColtPro missing playcd2.ocx", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/playcd2.ocx"],
  ["ColtPro missing RICHED32.DLL", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/RICHED32.DLL"],
  ["ColtPro missing VB5CHAT2.ocx", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/VB5CHAT2.ocx"],
  ["ColtPro missing VB40032.DLL", "DLL/OCX support file", "https://web.archive.org/web/20011023163855/http://www.coltpro.net/files3/missings/VB40032.DLL"],
];

function linkKey(url) {
  return clean(url).replace(/\/+$/, "").toLowerCase();
}

function curatedSourceKind(source) {
  const url = clean(source?.url || "");
  if (/github\.com\/ssstonebraker\/aolunderground-proggies/i.test(url)) return "reference GitHub mirror";
  return source?.kind || "";
}

function curatedSourceNotes(source) {
  const url = clean(source?.url || "");
  if (/github\.com\/ssstonebraker\/aolunderground-proggies/i.test(url)) {
    return "Reference mirror used to seed local file paths and catalog metadata. Original authorship and historical download provenance are taken from readable archive text and old-web sources when available.";
  }
  return source?.notes || "";
}

function buildMasterLinks() {
  const links = new Map();
  const add = ({ url, label, kind, source, context }) => {
    const cleanedUrl = clean(url);
    if (!cleanedUrl) return;
    const key = linkKey(cleanedUrl);
    const existing = links.get(key) || {
      url: cleanedUrl,
      label: clean(label) || cleanedUrl,
      kinds: new Set(),
      sources: new Set(),
      contexts: new Set(),
    };
    if (kind) existing.kinds.add(clean(kind));
    if (source) existing.sources.add(clean(source));
    if (context) existing.contexts.add(clean(context));
    links.set(key, existing);
  };

  for (const [label, kind, url] of userSuppliedLinks) {
    add({ url, label, kind, source: "user supplied links", context: label });
  }
  for (const source of catalog.research?.sourceCollections || []) {
    add({ url: source.url, label: source.name, kind: curatedSourceKind(source), source: "curated source collections", context: curatedSourceNotes(source) });
    add({ url: source.wayback, label: `${source.name} Wayback`, kind: "Wayback wildcard", source: "curated source collections", context: source.name });
  }
  for (const page of webResources.pages || []) {
    add({ url: page.url, label: page.name, kind: page.kind || "crawled source page", source: "crawled source pages", context: page.title || page.name });
    for (const item of page.links || []) {
      add({ url: item.url, label: item.text, kind: item.type || "crawled link", source: page.name, context: `page: ${page.name}` });
      add({ url: item.originalUrl, label: item.text, kind: "original URL from crawled link", source: page.name, context: `page: ${page.name}` });
    }
  }
  for (const item of urlIndex.repoText || []) {
    add({ url: item.url, label: item.url, kind: "repository text URL", source: item.sourcePath || "repository text", context: item.line ? `line ${item.line}` : item.source });
  }
  for (const item of urlIndex.global || []) {
    add({ url: item.url, label: item.url, kind: "embedded archive URL", source: item.programName || item.programId || "archive text", context: item.foundIn || item.source });
  }
  for (const item of Object.values(urlIndex.perProgram || {})) {
    for (const found of item.urls || []) {
      add({ url: found.url, label: found.url, kind: "embedded archive URL", source: item.programName || item.programId, context: found.foundIn || found.source });
    }
  }
  for (const item of externalDownloads.downloads || []) {
    add({ url: item.originalUrl, label: item.name, kind: "external original download", source: item.sourceList, context: item.status });
    add({ url: item.downloadUrl, label: `${item.name} resolved fetch URL`, kind: "external resolved fetch URL", source: item.sourceList, context: item.status });
    add({ url: item.waybackUrl, label: `${item.name} Wayback`, kind: "external Wayback download", source: item.sourceList, context: item.status });
  }
  for (const record of externalArchiveText.records || []) {
    for (const url of record.urls || []) {
      add({
        url,
        label: url,
        kind: "embedded external archive-text URL",
        source: record.name || record.localPath || "external archive text",
        context: record.localPath || record.sourceList || "",
      });
    }
  }
  for (const candidate of missingCandidates.candidates || []) {
    for (const mirror of candidate.mirrors || []) {
      add({ url: mirror.url, label: candidate.fileName || candidate.key, kind: "missing-candidate original mirror", source: mirror.source, context: mirror.status });
      add({ url: mirror.waybackUrl, label: `${candidate.fileName || candidate.key} Wayback`, kind: "missing-candidate Wayback mirror", source: mirror.source, context: mirror.status });
    }
  }
  for (const asset of webAssets.assets || []) {
    add({ url: asset.url, label: asset.text, kind: "web image URL", source: asset.pageName, context: asset.status });
    add({ url: asset.originalUrl, label: asset.text, kind: "web image original URL", source: asset.pageName, context: asset.status });
  }

  return [...links.values()].map((item) => ({
    ...item,
    kinds: [...item.kinds].sort(),
    sources: [...item.sources].sort(),
    contexts: [...item.contexts].sort(),
  })).sort((a, b) => {
    const aUser = a.sources.includes("user supplied links") ? 0 : 1;
    const bUser = b.sources.includes("user supplied links") ? 0 : 1;
    return aUser - bUser || urlHost(a.url).localeCompare(urlHost(b.url)) || a.url.localeCompare(b.url);
  });
}

function masterLinkTable(fromDoc, records) {
  return table(
    ["URL", "Kind", "Host", "Where found", "Context"],
    records.map((item) => [
      link(item.url, item.url),
      item.kinds.join("<br>"),
      urlHost(item.url),
      item.sources.slice(0, 6).join("<br>"),
      item.contexts.slice(0, 4).join("<br>"),
    ]),
  );
}

const masterLinks = buildMasterLinks();

rmSync(generatedDir, { recursive: true, force: true });
mkdirSync(generatedDir, { recursive: true });

const appDocPaths = new Map();
for (const program of programs) {
  const bucket = firstBucket(program);
  const fileName = `${String(program.index).padStart(4, "0")}-${slugify(displayName(program)).slice(0, 80)}.md`;
  appDocPaths.set(program.id, `${generatedRoot}/applications/pages/${bucket}/${fileName}`);
}

const tagMap = new Map();
for (const program of programs) {
  const embedded = urlIndex.perProgram?.[program.id]?.urls || [];
  for (const tag of appTags(program, embedded)) {
    const list = tagMap.get(tag) || [];
    list.push(program);
    tagMap.set(tag, list);
  }
}

for (const program of programs) {
  if (program.index === 1 || program.index % 100 === 0) progress(`application pages: ${program.index}/${programs.length}`);
  const doc = appDocPaths.get(program.id);
  const embedded = uniqueBy(urlIndex.perProgram?.[program.id]?.urls || [], (item) => item.url);
  const enrichment = enrichmentFor(program);
  const externalTextVersions = uniqueBy((enrichment.externalArchiveTextEvidence || []).flatMap((item) => item.versionMentions || []), (item) => item);
  const externalTextPurposes = uniqueBy((enrichment.externalArchiveTextEvidence || []).flatMap((item) => item.purposeSignals || []), (item) => item);
  const tags = appTags(program, embedded);
  const screenshots = program.screenshots || [];
  const metadataRows = [
    ["Archive ID", program.id],
    ["Catalog number", String(program.index)],
    ["Best known name", displayName(program)],
    ["Best name source", enrichment.bestNameSource || "catalog"],
    ["Catalog label", program.name],
    ["Archive filename", archiveFileName(program)],
    ["File size", fileSizeLabel(program)],
    ["Author", displayAuthor(program)],
    ["Catalog author", program.author || "unknown"],
    ["Manual author evidence", enrichment.manualAuthor || "unknown"],
    ["Archive-text author", enrichment.archiveTextAuthor || "unknown"],
    ["Inferred author", enrichment.inferredAuthor || "unknown"],
    ["Author conflict note", enrichment.authorConflict || "none"],
    ["Platform", program.platform || "unknown"],
    ["AOL/version bucket", displayVersion(program)],
    ["Catalog AOL/version bucket", versionLabel(program)],
    ["Inferred AOL version", enrichment.inferredAolVersion || "unknown"],
    ["Archive-text AOL/version mentions", enrichment.archiveAolVersions?.length ? enrichment.archiveAolVersions.join(", ") : "unknown"],
    [
      "External ZIP text version mentions",
      externalTextVersions.length ? externalTextVersions.join(", ") : "unknown",
    ],
    ["Prog type", programType(program)],
    ["Category", program.category || "uncategorized"],
    ["Manual purpose clues", enrichment.manualPurposeSignals?.length ? enrichment.manualPurposeSignals.join(", ") : "unknown"],
    ["Archive-text purpose clues", enrichment.archivePurposeSignals?.length ? enrichment.archivePurposeSignals.join(", ") : "unknown"],
    [
      "External ZIP text purpose clues",
      externalTextPurposes.length ? externalTextPurposes.join(", ") : "unknown",
    ],
    ["Archive text files reviewed", enrichment.archiveTextFiles?.length ? enrichment.archiveTextFiles.join("<br>") : "none"],
    ["Matched external ZIP text evidence", String(enrichment.externalArchiveTextEvidence?.length || 0)],
    ["Visual Basic", program.visualBasic || "unknown"],
    ["Compile type", program.compile || "unknown"],
    ["Duplicate count", String(program.duplicates || 0)],
    ["Archive password metadata", program.password ? "recorded in source catalog" : "not recorded"],
    ["Download status", program.download?.status || "unknown"],
    ["Local mirrored size", program.download?.sizeLabel || "unknown"],
    ["Matched web download links", String(enrichment.webDownloadLinks?.length || 0)],
    ["Matched mirror leads", String(enrichment.mirrorLinks?.length || 0)],
    ["Web research mentions", String(enrichment.webMentions?.length || 0)],
    ["Web image leads", String(enrichment.webImageLinks?.length || 0)],
  ];

  const sourceLinks = [
    program.download?.path
      ? `- Local mirrored archive: ${localLink(doc, program.download.path, program.download.path)}`
      : `- Local mirrored archive: ${program.download?.status || "not mirrored"}`,
    enrichment.webDownloadLinks?.length
      ? `- Old-web / Wayback download leads: ${enrichment.webDownloadLinks.length} link(s) listed below`
      : "- Old-web / Wayback download leads: not matched yet",
    enrichment.mirrorLinks?.length ? `- Matched mirror leads: ${enrichment.mirrorLinks.length} link(s) listed below` : "",
    program.file ? `- Catalog reference path: ${mdCode(program.file)}` : "- Catalog reference path: unknown",
    program.download?.originalUrl
      ? `- Reference repository mirror page: ${link(program.download.originalUrl, program.download.originalUrl)}`
      : "",
    program.download?.rawUrl ? `- Reference repository raw mirror: ${link(program.download.rawUrl, program.download.rawUrl)}` : "",
  ].filter(Boolean);

  const archiveTextBlock = enrichment.archiveTextFiles?.length
    ? [
        "### Archive Text Scan",
        "",
        "Readable archive text is used as provenance evidence for author, purpose, old URLs, and AOL-version clues. Binaries are not executed.",
        "",
        table(
          ["Text files reviewed", "Author clues", "Purpose clues", "AOL/version clues", "Notes"],
          [
            [
              enrichment.archiveTextFiles.join("<br>"),
              enrichment.archiveAuthorCandidates?.length
                ? enrichment.archiveAuthorCandidates.map((item) => `${item.name} (${item.sourceFile})`).join("<br>")
                : "none",
              enrichment.archivePurposeSignals?.length ? enrichment.archivePurposeSignals.join("<br>") : "none",
              enrichment.archiveAolVersions?.length ? enrichment.archiveAolVersions.join("<br>") : "none",
              enrichment.archiveTextNotes?.length ? enrichment.archiveTextNotes.join("<br>") : "",
            ],
          ],
        ),
      ].join("\n")
    : "### Archive Text Scan\n\nNo readable ReadMe/NFO/source text has been extracted for this entry yet.";

  const externalArchiveTextBlock = enrichment.externalArchiveTextEvidence?.length
    ? [
        "### Matched External ZIP Text Evidence",
        "",
        "Readable text from recovered external mirrors is listed separately from the local catalog archive scan. It is used as provenance and clue evidence, not as a guaranteed authorship claim.",
        "",
        table(
          ["Mirror/source", "Local file", "Text files", "Author clues", "Version clues", "Purpose clues", "Description clues", "URLs found inside"],
          enrichment.externalArchiveTextEvidence.map((item) => [
            item.sourceName || item.label || "external mirror",
            item.localPath ? localLink(doc, item.localPath, item.localPath) : "",
            item.textFiles?.slice(0, 6).join("<br>") || String(item.textFileCount || 0),
            item.preferredAuthor || item.authorCandidates?.map((author) => author.name).slice(0, 4).join("<br>") || "none",
            item.versionMentions?.slice(0, 6).join("<br>") || "none",
            item.purposeSignals?.slice(0, 6).join("<br>") || "none",
            item.descriptionCandidates?.map((description) => description.text).slice(0, 3).join("<br>") || "",
            item.urls?.map((url) => link(url, url)).slice(0, 4).join("<br>") || "",
          ]),
        ),
      ].join("\n")
    : "### Matched External ZIP Text Evidence\n\nNo recovered external ZIP text is matched to this entry yet.";

  const screenshotBlock = screenshots.length
    ? [
        "## Screenshots",
        "",
        ...screenshots.map((shot, index) => {
          const localPath = shot.localUrl || shot.rawUrl;
          const imageUrl = shot.localUrl ? relLink(doc, shot.localUrl) : shot.rawUrl;
          const sourceUrl = shot.sourceUrl || shot.remoteRawUrl || shot.rawUrl;
          return [
            `### Screenshot ${index + 1}`,
            "",
            `![${md(program.name)} screenshot ${index + 1}](${imageUrl})`,
            "",
            `- Local/reference path: ${shot.localUrl ? localLink(doc, localPath, shot.localUrl) : link(localPath, localPath)}`,
            sourceUrl ? `- Source: ${link(sourceUrl, sourceUrl)}` : "",
          ]
            .filter(Boolean)
            .join("\n");
        }),
      ].join("\n")
    : [
        "## Screenshots",
        "",
        "No program screenshot is currently mirrored for this catalog entry. Check the source and web-resource pages for related site images.",
      ].join("\n");

  const urlBlock = embedded.length
    ? [
        "## Embedded Or Original URLs",
        "",
        "These URLs were found in safely readable archive text. They are recorded as provenance clues, not as endorsements.",
        "",
        table(
          ["URL", "Found in", "Source"],
          embedded.map((item) => [link(item.url, item.url), item.foundIn || "archive text", item.source || "archive text"]),
        ),
      ].join("\n")
    : [
        "## Embedded Or Original URLs",
        "",
        "No readable original URLs were found inside the mirrored archive text during the current scan.",
      ].join("\n");

  const webMentionBlock = enrichment.webMentions?.length
    ? [
        "### Source Mentions",
        "",
        table(
          ["Source", "Evidence", "URL", "Notes"],
          enrichment.webMentions.map((item) => [
            item.sourceName || "web source",
            item.label || item.kind || "mention",
            link(item.url || item.originalUrl || item.sourceUrl, item.url || item.originalUrl || item.sourceUrl),
            [item.inferredAuthor ? `author: ${item.inferredAuthor}` : "", item.inferredAolVersion ? `AOL/version: ${item.inferredAolVersion}` : "", item.summary || ""]
              .filter(Boolean)
              .join("<br>"),
          ]),
        ),
      ].join("\n")
    : "### Source Mentions\n\nNo specific old-page program mention is matched to this entry yet.";

  const webDownloadBlock = enrichment.webDownloadLinks?.length
    ? [
        "### Matched Web Download Links",
        "",
        "These are old-page or recovered download URLs matched by filename/title. They are preserved as provenance and recovery leads.",
        "",
        table(
          ["Source", "Label", "URL", "Original URL"],
          enrichment.webDownloadLinks.map((item) => [
            item.sourceName || "web source",
            item.label || "download",
            link(item.url || item.originalUrl, item.url || item.originalUrl),
            item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
          ]),
        ),
      ].join("\n")
    : "### Matched Web Download Links\n\nNo additional old-page download links are matched to this entry yet.";

  const mirrorBlock = enrichment.mirrorLinks?.length
    ? [
        "### Mirror Leads",
        "",
        table(
          ["Source", "Label", "Original URL", "Wayback URL", "Local recovered file", "Status"],
          enrichment.mirrorLinks.map((item) => [
            item.sourceName || "mirror source",
            item.label || "mirror",
            item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
            item.waybackUrl ? link(item.waybackUrl, item.waybackUrl) : "",
            item.localPath ? localLink(doc, item.localPath, item.localPath) : "",
            item.status || "",
          ]),
        ),
      ].join("\n")
    : "### Mirror Leads\n\nNo external mirror leads are matched to this entry yet.";

  const webImageBlock = enrichment.webImageLinks?.length
    ? [
        "### Web Image Leads",
        "",
        table(
          ["Source", "Label", "Image URL", "Original URL"],
          enrichment.webImageLinks.map((item) => [
            item.sourceName || "web source",
            item.label || "image",
            link(item.url || item.originalUrl, item.url || item.originalUrl),
            item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
          ]),
        ),
      ].join("\n")
    : "### Web Image Leads\n\nNo extra web-image leads are matched to this entry yet.";

  const webResearchBlock = [
    "## Web Research",
    "",
    "This section connects the catalog entry to old pages, crawled download URLs, mirror lists, and image leads. Matches are evidence, not guaranteed runtime compatibility claims.",
    "",
    archiveTextBlock,
    "",
    externalArchiveTextBlock,
    "",
    webMentionBlock,
    "",
    webDownloadBlock,
    "",
    mirrorBlock,
    "",
    webImageBlock,
  ].join("\n");

  writeDoc(
    doc,
    [
      `# ${displayName(program)}`,
      "",
      displayName(program) !== clean(program.name) ? `Catalog label: **${md(program.name)}**.` : "",
      "",
      appPurpose(program),
      "",
      `**Safety note:** ${safetyNote(program.category || "")}`,
      "",
      "## Metadata",
      "",
      table(["Field", "Value"], metadataRows),
      "",
      "## Tags",
      "",
      tags.map((tag) => localLink(doc, `#${tag}`, `${generatedRoot}/tags/${tag}.md`)).join(" "),
      "",
      "## Source And Files",
      "",
      sourceLinks.join("\n"),
      "",
      "## AOL Version Context",
      "",
      `The catalog places this entry in the **${md(versionLabel(program))}** bucket. That is an archive/source classification and should be treated as a best available clue, not a guaranteed compatibility statement.`,
      enrichment.archiveAolVersions?.length
        ? `Readable archive text also mentions: **${md(enrichment.archiveAolVersions.join(", "))}**.`
        : "",
      "",
      screenshotBlock,
      "",
      urlBlock,
      "",
      webResearchBlock,
      "",
      "## Related Indexes",
      "",
      `- Category: ${localLink(doc, program.category || "uncategorized", `${generatedRoot}/categories/${slugify(program.category)}.md`)}`,
      `- Version bucket: ${localLink(doc, versionLabel(program), `${generatedRoot}/versions/${versionSlug(program)}.md`)}`,
      `- Applications index: ${localLink(doc, "all applications", `${generatedRoot}/applications/all-applications.md`)}`,
      `- Download map: ${localLink(doc, "all program download links", `${generatedRoot}/applications/all-program-downloads.md`)}`,
    ].join("\n"),
  );
}

writeDoc(
  "docs/README.md",
  [
    "# AOL Progz Documentation",
    "",
    "This folder is the GitHub-readable documentation layer for the AOL Progz archive. It is generated from the catalog data, crawled source pages, local mirrored files, screenshot assets, and URL reports.",
    "",
    "## Start Here",
    "",
    "- [Generated documentation hub](generated/README.md)",
    "- [All applications](generated/applications/all-applications.md)",
    "- [Detailed all-progs inventory](generated/applications/all-programs-detailed.md)",
    "- [All program download links](generated/applications/all-program-downloads.md)",
    "- [Web research mentions](generated/applications/web-research-mentions.md)",
    "- [Enrichment report](generated/applications/enrichment-report.md)",
    "- [Master link index](generated/sources/all-links.md)",
    "- [Links you supplied](generated/sources/user-supplied-links.md)",
    "- [Categories](generated/categories/README.md)",
    "- [AOL version buckets](generated/versions/README.md)",
    "- [Tags](generated/tags/README.md)",
    "- [Source pages and old-school links](generated/sources/README.md)",
    "- [Screenshots and recovered web images](generated/screenshots/README.md)",
    "- [Statistics](generated/statistics.md)",
    "- [Glossary](generated/GLOSSARY.md)",
    "- [Plain GitHub archive layout](PLAIN-GITHUB-ARCHIVE.md)",
    "- [Safety notes](../ARCHIVE-SAFETY.md)",
    "",
    "The generated pages are meant for browsing on GitHub without needing the website UI.",
  ].join("\n"),
);

progress("top-level generated hub");
writeDoc(
  `${generatedRoot}/README.md`,
  [
    "# AOL Progz Generated Archive Guide",
    "",
    `Generated at ${catalog.summary?.generatedAt || new Date().toISOString()} from the local AOL Progz data files.`,
    "",
    "## What Is Indexed",
    "",
    table(
      ["Area", "Count"],
      [
        ["Main catalog applications", String(catalog.summary?.catalogRows || programs.length)],
        ["Mirrored main files", String(catalog.summary?.mirroredFiles || 0)],
        ["Mirrored main archive size", catalog.summary?.mirroredSizeLabel || "unknown"],
        ["Authors in catalog", String(catalog.summary?.authors || 0)],
        ["Inferred categories", String(catalog.summary?.categories || 0)],
        ["Applications with source screenshots", String(catalog.summary?.screenshotPrograms || 0)],
        ["Mirrored source screenshots", String(catalog.summary?.screenshotFiles || 0)],
        ["Programs with embedded URLs", String(urlIndex.programsWithUrls || 0)],
        ["Programs with improved best-known names", String(programEnrichment.programsWithImprovedNames || 0)],
        ["Programs with web download leads", String(programEnrichment.programsWithWebDownloadLinks || 0)],
        ["Programs with web research mentions", String(programEnrichment.programsWithWebMentions || 0)],
        ["Programs with mirror leads", String(programEnrichment.programsWithMirrorLinks || 0)],
        ["Programs with manual purpose clues", String(programEnrichment.programsWithManualPurposeSignals || 0)],
        ["Programs with archive-text authors", String(programEnrichment.programsWithArchiveTextAuthors || 0)],
        ["Programs with archive-text purpose clues", String(programEnrichment.programsWithArchivePurposeSignals || 0)],
        ["Programs with archive-text AOL/version clues", String(programEnrichment.programsWithArchiveAolVersionMentions || 0)],
        ["Programs with matched external ZIP text evidence", String(programEnrichment.programsWithExternalArchiveTextEvidence || 0)],
        ["Programs with author conflicts flagged", String(programEnrichment.programsWithAuthorConflicts || 0)],
        ["Crawled source pages", String(webResources.pageCount || webResources.pages?.length || 0)],
        ["Crawled unique links", String(webResources.linkCount || 0)],
        ["Crawled download links", String(webResources.downloadCount || 0)],
        ["Master deduped link index", String(masterLinks.length)],
        ["User supplied priority links", String(uniqueBy(userSuppliedLinks, (item) => linkKey(item[2])).length)],
        ["Recovered external files", String(externalDownloads.readyCount || 0)],
        ["External ZIPs with readable text", String(externalArchiveText.withTextFileCount || 0)],
        ["External ZIPs with author clues", String(externalArchiveText.withAuthorCount || 0)],
        ["External ZIPs with version clues", String(externalArchiveText.withVersionCount || 0)],
        ["External ZIPs with purpose clues", String(externalArchiveText.withPurposeCount || 0)],
        ["External mirror groups", String(externalDownloads.mirrorGroupCount || 0)],
        ["Recovered web images", String(webAssets.readyCount || 0)],
      ],
    ),
    "",
    "## Browse",
    "",
    "- [Applications](applications/README.md)",
    "- [Detailed all-progs inventory](applications/all-programs-detailed.md)",
    "- [All program download links](applications/all-program-downloads.md)",
    "- [Web research mentions](applications/web-research-mentions.md)",
    "- [Enrichment report](applications/enrichment-report.md)",
    "- [Categories](categories/README.md)",
    "- [AOL versions](versions/README.md)",
    "- [Tags](tags/README.md)",
    "- [Authors](authors/README.md)",
    "- [Sources and old links](sources/README.md)",
    "- [Master link index](sources/all-links.md)",
    "- [Screenshots](screenshots/README.md)",
    "- [Statistics](statistics.md)",
    "- [Glossary](GLOSSARY.md)",
    "- [Missing candidates and mirrors](sources/missing-candidates.md)",
  ].join("\n"),
);

progress("application indexes");
const byFirst = groupBy(programs, firstBucket);
const firstRows = [...byFirst.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([bucket, items]) => {
    const page = `${generatedRoot}/applications/${bucket}.md`;
    writeDoc(
      page,
      [`# Applications: ${bucket}`, "", appTable(page, items)].join("\n"),
    );
    return [bucket, String(items.length), localLink(`${generatedRoot}/applications/README.md`, "open", page)];
  });

writeDoc(
  `${generatedRoot}/applications/README.md`,
  [
    "# Applications",
    "",
    "Every main catalog entry has a generated detail page with metadata, category notes, source file links, AOL version bucket, tags, screenshots when available, and embedded/original URLs when recovered from archive text.",
    "",
    "## Alphabetical Buckets",
    "",
    table(["Bucket", "Count", "Page"], firstRows),
    "",
    "## Complete List",
    "",
    "- [Detailed all-progs inventory](all-programs-detailed.md)",
    "- [All program download links](all-program-downloads.md)",
    "- [Web research mentions](web-research-mentions.md)",
    "- [Enrichment report](enrichment-report.md)",
    "- [Compact all applications table](all-applications.md)",
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/applications/all-applications.md`,
  ["# All Applications", "", appTable(`${generatedRoot}/applications/all-applications.md`, programs)].join("\n"),
);

writeDoc(
  `${generatedRoot}/applications/all-programs-detailed.md`,
  [
    "# Detailed All-Progs Inventory",
    "",
    "This is the complete GitHub-readable inventory of the main catalog. It lists the best-known name, original catalog label, archive filename, size, inferred prog type, category, AOL/version bucket, author metadata, local mirrored file, old-web/Wayback lead count, reference repository mirror, embedded URLs found inside readable archive text, and screenshot count.",
    "",
    programInventoryTable(`${generatedRoot}/applications/all-programs-detailed.md`, programs),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/applications/all-program-downloads.md`,
  [
    "# All Program Download Links",
    "",
    "This page lists every main catalog entry with its local mirrored file when present, matched old-page download links, recovered mirror leads, and the reference repository mirror. Old-page links are provenance/recovery leads and may be dead, duplicated, or only available through Wayback.",
    "",
    programDownloadTable(`${generatedRoot}/applications/all-program-downloads.md`, programs),
  ].join("\n"),
);

const webMentionRows = [];
for (const program of programs) {
  const enrichment = enrichmentFor(program);
  for (const mention of enrichment.webMentions || []) {
    webMentionRows.push([
      localLink(`${generatedRoot}/applications/web-research-mentions.md`, displayName(program), appDocPaths.get(program.id)),
      program.name,
      mention.sourceName || "web source",
      mention.label || mention.kind || "mention",
      mention.url || mention.originalUrl ? link(mention.url || mention.originalUrl, mention.url || mention.originalUrl) : "",
      [mention.inferredAuthor ? `author: ${mention.inferredAuthor}` : "", mention.inferredAolVersion ? `AOL/version: ${mention.inferredAolVersion}` : "", mention.summary || ""]
        .filter(Boolean)
        .join("<br>"),
    ]);
  }
}

writeDoc(
  `${generatedRoot}/applications/web-research-mentions.md`,
  [
    "# Web Research Mentions",
    "",
    "Program-level mentions extracted from source pages such as AOLUnderground.com and other crawled resources. These are source evidence rows; they do not replace the original catalog labels unless the archive filename also supports the improved name.",
    "",
    table(["Program", "Catalog label", "Source", "Evidence", "URL", "Notes"], webMentionRows),
  ].join("\n"),
);

const enrichmentRows = programs
  .filter((program) => {
    const enrichment = enrichmentFor(program);
    return (
      clean(enrichment.bestName) !== clean(program.name) ||
      enrichment.manualAuthor ||
      enrichment.archiveTextAuthor ||
      enrichment.inferredAuthor ||
      enrichment.authorConflict ||
      enrichment.manualPurposeSignals?.length ||
      enrichment.archivePurposeSignals?.length ||
      enrichment.externalArchiveTextEvidence?.length ||
      enrichment.archiveAolVersions?.length ||
      enrichment.inferredAolVersion ||
      enrichment.webDownloadLinks?.length ||
      enrichment.webMentions?.length ||
      enrichment.mirrorLinks?.length
    );
  })
  .map((program) => {
    const enrichment = enrichmentFor(program);
    return [
      localLink(`${generatedRoot}/applications/enrichment-report.md`, displayName(program), appDocPaths.get(program.id)),
      program.name,
      enrichment.bestNameSource || "catalog",
      enrichment.manualAuthor || "",
      enrichment.archiveTextAuthor || "",
      enrichment.inferredAuthor || "",
      enrichment.authorConflict || "",
      enrichment.inferredAolVersion || "",
      enrichment.archiveAolVersions?.length ? enrichment.archiveAolVersions.join("<br>") : "",
      enrichment.manualPurposeSignals?.length ? enrichment.manualPurposeSignals.join("<br>") : "",
      enrichment.archivePurposeSignals?.length ? enrichment.archivePurposeSignals.join("<br>") : "",
      uniqueBy((enrichment.externalArchiveTextEvidence || []).flatMap((item) => item.purposeSignals || []), (item) => item)
        .slice(0, 8)
        .join("<br>"),
      fileSizeLabel(program),
      String(enrichment.webDownloadLinks?.length || 0),
      String(enrichment.webMentions?.length || 0),
      String(enrichment.mirrorLinks?.length || 0),
      String(enrichment.externalArchiveTextEvidence?.length || 0),
    ];
  });

writeDoc(
  `${generatedRoot}/applications/enrichment-report.md`,
  [
    "# Program Metadata Enrichment Report",
    "",
    `Generated from archive filenames, local file sizes, readable archive text, external ZIP text evidence, manual corrections, crawled source pages, old-page download links, and mirror lists. Improved names: **${programEnrichment.programsWithImprovedNames || 0}**. Archive-text authors: **${programEnrichment.programsWithArchiveTextAuthors || 0}**. Manual purpose clues: **${programEnrichment.programsWithManualPurposeSignals || 0}**. Archive-text purpose clues: **${programEnrichment.programsWithArchivePurposeSignals || 0}**. Matched external ZIP text evidence: **${programEnrichment.programsWithExternalArchiveTextEvidence || 0}**. Author conflicts flagged: **${programEnrichment.programsWithAuthorConflicts || 0}**. Programs with web downloads: **${programEnrichment.programsWithWebDownloadLinks || 0}**. Programs with source mentions: **${programEnrichment.programsWithWebMentions || 0}**. Programs with mirror leads: **${programEnrichment.programsWithMirrorLinks || 0}**.`,
    "",
    table(
      [
        "Best known name",
        "Catalog label",
        "Best-name source",
        "Manual author",
        "Archive-text author",
        "Inferred author",
        "Author conflict",
        "Inferred AOL/version",
        "Archive-text AOL/version",
        "Manual purpose",
        "Archive-text purpose",
        "External ZIP text purpose",
        "Size",
        "Web downloads",
        "Source mentions",
        "Mirror leads",
        "External ZIP evidence",
      ],
      enrichmentRows,
    ),
  ].join("\n"),
);

progress("category, version, tag, and author indexes");
const byCategory = groupBy(programs, (program) => program.category || "uncategorized");
const categoryRows = [...byCategory.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([category, items]) => {
    const page = `${generatedRoot}/categories/${slugify(category)}.md`;
    writeDoc(
      page,
      [
        `# ${titleCase(category)}`,
        "",
        categoryDescription(category),
        "",
        `**Count:** ${items.length}`,
        "",
        `**Safety note:** ${safetyNote(category)}`,
        "",
        appTable(page, items),
      ].join("\n"),
    );
    return [category, String(items.length), categoryDescription(category), localLink(`${generatedRoot}/categories/README.md`, "open", page)];
  });

writeDoc(
  `${generatedRoot}/categories/README.md`,
  [
    "# Categories",
    "",
    "Categories are inferred from catalog names, source paths, and archive vocabulary. They are useful for browsing but should not be read as perfect compatibility or behavior claims.",
    "",
    table(["Category", "Count", "Meaning", "Page"], categoryRows),
  ].join("\n"),
);

const byVersion = groupBy(programs, versionLabel);
const versionRows = [...byVersion.entries()]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([version, items]) => {
    const page = `${generatedRoot}/versions/${slugify(version)}.md`;
    writeDoc(
      page,
      [
        `# ${version}`,
        "",
        `These applications are grouped by the catalog/source version bucket **${version}**. This records where the archive placed them; it is not a guaranteed runtime compatibility statement.`,
        "",
        `**Count:** ${items.length}`,
        "",
        appTable(page, items),
      ].join("\n"),
    );
    return [version, String(items.length), localLink(`${generatedRoot}/versions/README.md`, "open", page)];
  });

writeDoc(
  `${generatedRoot}/versions/README.md`,
  [
    "# AOL Version Buckets",
    "",
    "The catalog uses AOL version buckets such as AOL 2.5, 3.0, 4.0, and later versions. These pages preserve that source classification so researchers can see which era a prog was associated with.",
    "",
    table(["Version bucket", "Count", "Page"], versionRows),
  ].join("\n"),
);

const tagRows = [...tagMap.entries()]
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  .map(([tag, items]) => {
    const page = `${generatedRoot}/tags/${tag}.md`;
    writeDoc(
      page,
      [`# Tag: ${tag}`, "", `**Count:** ${items.length}`, "", appTable(page, items)].join("\n"),
    );
    return [`#${tag}`, String(items.length), localLink(`${generatedRoot}/tags/README.md`, "open", page)];
  });

writeDoc(
  `${generatedRoot}/tags/README.md`,
  [
    "# Tags",
    "",
    "Tags are generated from platform, AOL version bucket, inferred category, Visual Basic metadata, file status, screenshot coverage, embedded URL coverage, and duplicate/password metadata.",
    "",
    table(["Tag", "Count", "Page"], tagRows),
  ].join("\n"),
);

const byAuthor = groupBy(
  programs.filter((program) => primaryAuthor(program)),
  (program) => primaryAuthor(program),
);
const authorRows = [...byAuthor.entries()]
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  .map(([author, items]) => {
    const page = `${generatedRoot}/authors/pages/${slugify(author).slice(0, 90)}.md`;
    writeDoc(
      page,
      [`# Author: ${author}`, "", `**Catalog entries:** ${items.length}`, "", appTable(page, items)].join("\n"),
    );
    return [author, String(items.length), localLink(`${generatedRoot}/authors/README.md`, "open", page)];
  });

writeDoc(
  `${generatedRoot}/authors/README.md`,
  [
    "# Authors",
    "",
    "Author pages use the best available evidence in this order: manual correction, readable archive text, filename inference, then the old catalog field. Many entries still have no reliable author metadata.",
    "",
    table(["Author", "Count", "Page"], authorRows),
  ].join("\n"),
);

progress("source reports");
const sourceCollections = catalog.research?.sourceCollections || [];
const sourceRows = sourceCollections.map((source) => [
  source.name,
  curatedSourceKind(source),
  link(source.url, source.url),
  source.wayback ? link("Wayback", source.wayback) : "",
  curatedSourceNotes(source),
]);

writeDoc(
  `${generatedRoot}/sources/README.md`,
  [
    "# Sources And Old-School Links",
    "",
    "This section records original sites, Wayback captures, GitHub mirrors, source pages, download links, and mirror groups. Duplicates are grouped by URL or filename where possible.",
    "",
    "## Curated Source Collections",
    "",
    table(["Name", "Kind", "URL", "Wayback", "Notes"], sourceRows),
    "",
    "## Link Reports",
    "",
    "- [Master all-links index](all-links.md)",
    "- [Links you supplied](user-supplied-links.md)",
    "- [Crawled source pages](source-pages.md)",
    "- [Download links](download-links.md)",
    "- [External download recovery status](external-downloads.md)",
    "- [External ZIP text evidence](external-archive-text.md)",
    "- [AOL/AIM client and runtime downloads](aol-aim-client-downloads.md)",
    "- [Resource and directory links](resource-links.md)",
    "- [LoLToolz AIM progs source report](loltoolz-aim-progs.md)",
    "- [Embedded archive URLs](embedded-archive-urls.md)",
    "- [External mirror groups](mirror-groups.md)",
    "- [Missing candidates and recovered mirrors](missing-candidates.md)",
    `- ${localLink(`${generatedRoot}/sources/README.md`, "Program web-research mentions", `${generatedRoot}/applications/web-research-mentions.md`)}`,
    `- ${localLink(`${generatedRoot}/sources/README.md`, "Methodus2000 source report", "docs/sources/methodus2000.md")}`,
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/sources/all-links.md`,
  [
    "# Master All-Links Index",
    "",
    `This page deduplicates every URL currently known to the archive: user-supplied links, curated sources, crawled source pages, crawled page links, extracted download links, embedded archive-text URLs, recovered external ZIP text URLs, external mirror URLs, missing-candidate mirrors, and recovered web-image URLs. Current unique URL count: **${masterLinks.length}**.`,
    "",
    masterLinkTable(`${generatedRoot}/sources/all-links.md`, masterLinks),
  ].join("\n"),
);

const suppliedSeen = new Set();
const suppliedRows = userSuppliedLinks
  .filter((item) => {
    const key = linkKey(item[2]);
    if (suppliedSeen.has(key)) return false;
    suppliedSeen.add(key);
    return true;
  })
  .map(([label, kind, url]) => {
    const master = masterLinks.find((item) => linkKey(item.url) === linkKey(url));
    return [
      label,
      kind,
      link(url, url),
      master ? "yes" : "listed",
      master?.sources.filter((source) => source !== "user supplied links").slice(0, 6).join("<br>") || "",
    ];
  });

writeDoc(
  `${generatedRoot}/sources/user-supplied-links.md`,
  [
    "# Links You Supplied",
    "",
    "These are the priority links from the request, deduplicated and preserved as first-class source links.",
    "",
    table(["Name", "Kind", "URL", "In master index", "Also found in"], suppliedRows),
  ].join("\n"),
);

const sourcePageRows = (webResources.pages || []).map((page) => [
  page.name,
  page.kind,
  page.ok ? "ok" : `not ok${page.status ? ` (${page.status})` : ""}`,
  page.title || "",
  String(page.linkCount || 0),
  String(page.downloadCount || 0),
  page.localPath ? localLink(`${generatedRoot}/sources/source-pages.md`, page.localPath, page.localPath) : "",
  link(page.url, page.url),
]);

writeDoc(
  `${generatedRoot}/sources/source-pages.md`,
  [
    "# Crawled Source Pages",
    "",
    table(["Name", "Kind", "Status", "Title", "Links", "Downloads", "Local copy", "URL"], sourcePageRows),
  ].join("\n"),
);

const allCrawledLinks = [];
for (const page of webResources.pages || []) {
  for (const item of page.links || []) {
    allCrawledLinks.push({ ...item, pageName: page.name, pageUrl: page.url });
  }
}

const dedupedLinks = uniqueBy(allCrawledLinks, (item) => item.url);
const downloadLinks = dedupedLinks.filter((item) => item.type === "download");
const resourceLinks = dedupedLinks.filter((item) => item.type !== "download");
const lolToolzAimPage = (webResources.pages || []).find((page) => page.name === "LoLToolz AIM progs");

writeDoc(
  `${generatedRoot}/sources/loltoolz-aim-progs.md`,
  [
    "# LoLToolz AIM Progs",
    "",
    "AIM program rows extracted from the user-supplied LoLToolz AIM Progs HTML snapshot. These entries are preserved as missing-candidate and old-web download leads unless a matching local catalog entry is found.",
    "Recovery status comes from the external-file mirroring pass. `ready` means a local archive file was recovered; `http-404` means the recorded Wayback replay URL did not serve the file during the latest attempt.",
    "",
    lolToolzAimPage?.localPath ? `Local preserved HTML: ${localLink(`${generatedRoot}/sources/loltoolz-aim-progs.md`, lolToolzAimPage.localPath, lolToolzAimPage.localPath)}` : "",
    "",
    table(
      ["Program", "Description", "Listed size", "Recovery status", "Recovered file", "Wayback URL", "Original URL"],
      (lolToolzAimPage?.links || [])
        .filter((item) => item.type === "download")
        .map((item) => {
          const recovery = recoveryForUrl(item.originalUrl || item.url);
          return [
            item.text || fileStem(item.originalUrl || item.url),
            item.description || "",
            item.listedSize || "",
            recovery?.status || "not attempted",
            recovery?.localPath ? localLink(`${generatedRoot}/sources/loltoolz-aim-progs.md`, recovery.localPath, recovery.localPath) : "not recovered",
            link(item.url, item.url),
            item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
          ];
        }),
    ),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/sources/download-links.md`,
  [
    "# Download Links",
    "",
    "Deduplicated download links discovered while crawling old source pages. These are provenance and recovery leads; some are dead, some are Wayback URLs, and some are already mirrored under `files/`.",
    "",
    table(
      ["Text", "Host", "Source page", "URL", "Original URL"],
      downloadLinks.map((item) => [
        item.text || fileStem(item.originalUrl || item.url),
        urlHost(item.originalUrl || item.url),
        item.pageName || "",
        link(item.url, item.url),
        item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
      ]),
    ),
  ].join("\n"),
);

const externalDownloadRows = (externalDownloads.downloads || []).map((item) => {
  const evidence = externalTextFor(item);
  return [
    item.name || fileStem(item.originalUrl || item.waybackUrl),
    item.discoveredText || "",
    item.sourceList || "",
    item.status || "unknown",
    formatBytes(item.size),
    item.localPath ? localLink(`${generatedRoot}/sources/external-downloads.md`, item.localPath, item.localPath) : "not recovered",
    item.dedupeNote || "",
    evidence?.textFileCount ? String(evidence.textFileCount) : "",
    evidence?.preferredAuthor || "",
    evidence?.versionMentions?.slice(0, 4).join("<br>") || "",
    evidence?.purposeSignals?.slice(0, 5).join("<br>") || "",
    item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
    item.downloadUrl && item.downloadUrl !== item.waybackUrl && item.downloadUrl !== item.originalUrl
      ? link(item.downloadUrl, item.downloadUrl)
      : "",
    item.waybackUrl ? link(item.waybackUrl, item.waybackUrl) : "",
  ];
});

writeDoc(
  `${generatedRoot}/sources/external-downloads.md`,
  [
    "# External Download Recovery Status",
    "",
    `This table records every external download that has been attempted by the recovery pass. Ready files are mirrored locally under \`files/external/\`. Current recovered files: **${externalDownloads.readyCount || 0}** of **${externalDownloads.downloadCount || externalDownloadRows.length}** attempted downloads.`,
    "",
    table(
      [
        "File",
        "Label/context",
        "Source",
        "Status",
        "Size",
        "Local file",
        "Storage note",
        "Text files",
        "Author clues",
        "Version clues",
        "Purpose clues",
        "Original URL",
        "Resolved fetch URL",
        "Wayback/download URL",
      ],
      externalDownloadRows,
    ),
  ].join("\n"),
);

const externalArchiveTextRows = (externalArchiveText.records || [])
  .filter((record) => record.scanned && record.textFileCount > 0)
  .map((record) => [
    record.name || fileStem(record.localPath),
    record.localPath ? localLink(`${generatedRoot}/sources/external-archive-text.md`, record.localPath, record.localPath) : "",
    record.sourceList || "",
    String(record.textFileCount || 0),
    record.textFiles?.slice(0, 6).join("<br>") || "",
    record.preferredAuthor || "",
    record.versionMentions?.slice(0, 8).join("<br>") || "",
    record.purposeSignals?.slice(0, 8).join("<br>") || "",
    record.descriptionCandidates?.map((item) => item.text).slice(0, 3).join("<br>") || "",
    record.urls?.map((url) => link(url, url)).slice(0, 5).join("<br>") || "",
  ]);

writeDoc(
  `${generatedRoot}/sources/external-archive-text.md`,
  [
    "# External ZIP Text Evidence",
    "",
    `Recovered external ZIPs are scanned for readmes, notes, HTML, source files, URL shortcuts, and other text-like entries. Current readable ZIPs: **${externalArchiveText.withTextFileCount || 0}** of **${externalArchiveText.scannedCount || 0}** scanned external ZIPs. This is provenance and description evidence only; binaries are not executed.`,
    "",
    table(
      [
        "File",
        "Local file",
        "Source",
        "Text files",
        "Text entries",
        "Author clues",
        "Version clues",
        "Purpose clues",
        "Description clues",
        "URLs found inside",
      ],
      externalArchiveTextRows,
    ),
  ].join("\n"),
);

const clientDownloadRows = (externalDownloads.downloads || [])
  .filter(isClientOrRuntimeDownload)
  .map((item) => {
    const evidence = externalTextFor(item);
    return [
      item.name || fileStem(item.originalUrl || item.waybackUrl),
      inferredClientVersion(item),
      item.discoveredText || "",
      item.sourceList || "",
      item.status || "unknown",
      formatBytes(item.size),
      item.localPath ? localLink(`${generatedRoot}/sources/aol-aim-client-downloads.md`, item.localPath, item.localPath) : "not recovered",
      item.dedupeNote || "",
      evidence?.versionMentions?.slice(0, 4).join("<br>") || "",
      evidence?.purposeSignals?.slice(0, 5).join("<br>") || "",
      item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
      item.downloadUrl && item.downloadUrl !== item.waybackUrl && item.downloadUrl !== item.originalUrl
        ? link(item.downloadUrl, item.downloadUrl)
        : "",
      item.waybackUrl ? link(item.waybackUrl, item.waybackUrl) : "",
    ];
  });

writeDoc(
  `${generatedRoot}/sources/aol-aim-client-downloads.md`,
  [
    "# AOL/AIM Client And Runtime Downloads",
    "",
    "Versioned AOL/AIM installers, AIM utilities, AOL utilities, and DLL/OCX runtime support files recovered or attempted from user-supplied source pages. These are tracked separately from the prog catalog so client installers and runtimes do not get mistaken for authored progs.",
    "",
    table(
      [
        "File",
        "Inferred version",
        "Label/context",
        "Source",
        "Status",
        "Size",
        "Local file",
        "Storage note",
        "Text version clues",
        "Text purpose clues",
        "Original URL",
        "Resolved fetch URL",
        "Wayback/download URL",
      ],
      clientDownloadRows,
    ),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/sources/resource-links.md`,
  [
    "# Resource And Directory Links",
    "",
    "Deduplicated non-download links from old source pages, including link directories, program pages, Wayback capture indexes, images, and related scene resources.",
    "",
    table(
      ["Type", "Text", "Host", "Source page", "URL", "Original URL"],
      resourceLinks.map((item) => [
        item.type || "resource",
        item.text || item.originalUrl || item.url,
        urlHost(item.originalUrl || item.url),
        item.pageName || "",
        link(item.url, item.url),
        item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
      ]),
    ),
  ].join("\n"),
);

const embeddedRows = uniqueBy(
  [
    ...(urlIndex.global || []),
    ...Object.values(urlIndex.perProgram || {}).flatMap((item) =>
      (item.urls || []).map((found) => ({
        ...found,
        programId: item.programId,
        programName: item.programName,
      })),
    ),
  ],
  (item) => `${item.url}|${item.programId || ""}|${item.foundIn || ""}`,
).map((item) => {
  const appPage = item.programId ? appDocPaths.get(item.programId) : "";
  return [
    link(item.url, item.url),
    item.programName ? localLink(`${generatedRoot}/sources/embedded-archive-urls.md`, item.programName, appPage) : "",
    item.foundIn || "archive text",
    item.source || "archive text",
  ];
});

writeDoc(
  `${generatedRoot}/sources/embedded-archive-urls.md`,
  [
    "# Embedded Archive URLs",
    "",
    "URLs found inside safely readable archive text are listed here as provenance clues. This includes old homepages, download hosts, scene domains, and author/source references. Duplicates are kept only when they point to a different program or different internal file.",
    "",
    table(["URL", "Program", "Found in", "Source"], embeddedRows),
  ].join("\n"),
);

const mirrorGroups = Array.isArray(externalDownloads.mirrorGroups)
  ? externalDownloads.mirrorGroups
  : Object.values(externalDownloads.mirrorGroups || {});

writeDoc(
  `${generatedRoot}/sources/mirror-groups.md`,
  [
    "# External Mirror Groups",
    "",
    "Mirror groups preserve multiple original download URLs for the same or similarly named recovered file without treating them as accidental duplicates.",
    "",
    table(
      ["File/key", "Mirrors", "Ready files", "Local files"],
      mirrorGroups.map((group) => [
        group.fileName || group.key || "unknown",
        String(group.mirrorCount || group.mirrors?.length || 0),
        String(group.readyCount || group.readyLocalFiles?.length || 0),
        (group.readyLocalFiles || []).map((file) => localLink(`${generatedRoot}/sources/mirror-groups.md`, file, file)).join("<br>"),
      ]),
    ),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/sources/missing-candidates.md`,
  [
    "# Missing Candidates And Recovered Mirrors",
    "",
    "These are filenames or program leads discovered from external old-web sources and compared against the main catalog. Ready counts mean at least one local mirror was recovered. Recovery statuses come from the external-file mirroring pass.",
    "",
    table(
      [
        "Key",
        "Category",
        "Mirrors",
        "Recovery statuses",
        "Ready",
        "Ready local files",
        "Text author clues",
        "Text version clues",
        "Text purpose clues",
        "URLs found inside",
      ],
      (missingCandidates.candidates || []).map((candidate) => [
        candidate.key || candidate.fileName || "unknown",
        candidate.category || "unknown",
        String(candidate.mirrorCount || candidate.mirrors?.length || 0),
        uniqueBy(candidate.mirrors || [], (mirror) => mirror.status || "candidate")
          .map((mirror) => mirror.status || "candidate")
          .join("<br>"),
        String(candidate.readyCount || candidate.readyLocalFiles?.length || 0),
        (candidate.readyLocalFiles || []).map((file) => localLink(`${generatedRoot}/sources/missing-candidates.md`, file, file)).join("<br>") ||
          "none",
        candidate.externalTextAuthors?.slice(0, 4).join("<br>") || "",
        candidate.externalTextVersions?.slice(0, 4).join("<br>") || "",
        candidate.externalTextPurposeSignals?.slice(0, 5).join("<br>") || "",
        (candidate.externalTextUrls || []).map((url) => link(url, url)).slice(0, 4).join("<br>") || "",
      ]),
    ),
  ].join("\n"),
);

const screenshotPrograms = programs.filter((program) => program.screenshotCount > 0);
const readyWebAssets = (webAssets.assets || []).filter((asset) => asset.status === "ready" && asset.localPath);
const webAssetRows = (webAssets.assets || []).map((asset) => [
  asset.text || fileStem(asset.originalUrl || asset.url),
  asset.status || "unknown",
  asset.localPath ? localLink(`${generatedRoot}/screenshots/web-images.md`, asset.localPath, asset.localPath) : "",
  asset.pageName || "",
  link(asset.url, asset.url),
  asset.originalUrl ? link(asset.originalUrl, asset.originalUrl) : "",
]);

writeDoc(
  `${generatedRoot}/screenshots/README.md`,
  [
    "# Screenshots And Recovered Web Images",
    "",
    `The main catalog currently has ${screenshotPrograms.length} application entries with mirrored source screenshots. The web-resource crawl has ${readyWebAssets.length} ready image assets from old pages.`,
    "",
    "## Application Screenshot Coverage",
    "",
    table(
      ["Application", "Version", "Category", "Screenshots", "Detail page"],
      screenshotPrograms.map((program) => [
        program.name,
        versionLabel(program),
        program.category,
        String(program.screenshotCount || 0),
        localLink(`${generatedRoot}/screenshots/README.md`, "open", appDocPaths.get(program.id)),
      ]),
    ),
    "",
    "## Ready Web Images",
    "",
    ...readyWebAssets.slice(0, 80).map((asset) => [
      `### ${clean(asset.text || fileStem(asset.localPath))}`,
      "",
      `![${md(asset.text || "web asset")}](${relLink(`${generatedRoot}/screenshots/README.md`, asset.localPath)})`,
      "",
      `- Local: ${localLink(`${generatedRoot}/screenshots/README.md`, asset.localPath, asset.localPath)}`,
      `- Source page: ${asset.pageName || "unknown"}`,
      `- URL: ${link(asset.url, asset.url)}`,
      "",
    ].join("\n")),
    "",
    "- [All web image attempts](web-images.md)",
  ].join("\n"),
);

progress("statistics and glossary");
writeDoc(
  `${generatedRoot}/screenshots/web-images.md`,
  [
    "# Web Image Attempts",
    "",
    table(["Text", "Status", "Local path", "Source page", "URL", "Original URL"], webAssetRows),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/statistics.md`,
  [
    "# Statistics",
    "",
    "## Catalog Summary",
    "",
    table(
      ["Metric", "Value"],
      Object.entries(catalog.summary || {}).map(([key, value]) => [key, String(value)]),
    ),
    "",
    "## By Category",
    "",
    table(["Name", "Count", "Local", "Screenshots", "Size"], statRows(catalog.stats?.byCategory)),
    "",
    "## By Platform",
    "",
    table(["Name", "Count"], (catalog.stats?.byPlatform || []).map((item) => [item.name, String(item.count)])),
    "",
    "## By AOL Version",
    "",
    table(["Name", "Count"], (catalog.stats?.byVersion || []).map((item) => [item.name, String(item.count)])),
    "",
    "## By Visual Basic Version",
    "",
    table(["Name", "Count"], (catalog.stats?.byVisualBasic || []).map((item) => [item.name, String(item.count)])),
    "",
    "## By Compile Type",
    "",
    table(["Name", "Count"], (catalog.stats?.byCompile || []).map((item) => [item.name, String(item.count)])),
    "",
    "## Download Status",
    "",
    table(["Name", "Count"], (catalog.stats?.byDownloadStatus || []).map((item) => [item.name, String(item.count)])),
    "",
    "## Research And Recovery",
    "",
    table(
      ["Metric", "Value"],
      [
        ["Crawled source pages", String(webResources.pageCount || webResources.pages?.length || 0)],
        ["Crawled links", String(webResources.linkCount || 0)],
        ["Crawled download links", String(webResources.downloadCount || 0)],
        ["Recovered external files", String(externalDownloads.readyCount || 0)],
        ["External ZIPs scanned for text", String(externalArchiveText.scannedCount || 0)],
        ["External ZIPs with readable text", String(externalArchiveText.withTextFileCount || 0)],
        ["External ZIPs with author clues", String(externalArchiveText.withAuthorCount || 0)],
        ["External ZIPs with version clues", String(externalArchiveText.withVersionCount || 0)],
        ["External ZIPs with purpose clues", String(externalArchiveText.withPurposeCount || 0)],
        ["Missing candidates", String(missingCandidates.candidateCount || missingCandidates.candidates?.length || 0)],
        ["Recovered missing candidates", String(missingCandidates.readyCandidateCount || 0)],
        ["Master deduped link index", String(masterLinks.length)],
      ],
    ),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/GLOSSARY.md`,
  [
    "# Glossary",
    "",
    "Terms are preserved as AOL/AIM scene vocabulary. Abuse-related terms are documented only to explain old archive labels.",
    "",
    table(
      ["Term", "Type", "Description"],
      (catalog.research?.glossary || []).map((item) => [item.term, item.type, item.description]),
    ),
  ].join("\n"),
);

console.log(`Generated GitHub docs for ${programs.length} applications in ${generatedRoot}`);
