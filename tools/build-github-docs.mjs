import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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

function writeJson(relativePath, value) {
  const fullPath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function csvEscape(value) {
  const text = clean(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvTable(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

function writeCsv(relativePath, headers, rows) {
  const fullPath = path.join(rootDir, relativePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${csvTable(headers, rows)}\n`, "utf8");
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
  const review = reviewProfile(program);
  if (review.score >= 4) tags.add("needs-manual-review");
  if (review.score >= 8) tags.add("review-high-priority");
  else if (review.score >= 4) tags.add("review-medium-priority");
  else if (review.score > 0) tags.add("review-low-priority");
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

function directorySize(relativePath, options = {}) {
  const base = path.join(rootDir, relativePath);
  if (!existsSync(base)) return 0;
  const exclude = new Set(options.exclude || []);
  let total = 0;
  const stack = [base];
  while (stack.length) {
    const current = stack.pop();
    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (exclude.has(entry.name)) continue;
        stack.push(path.join(current, entry.name));
      }
    } else {
      total += stat.size;
    }
  }
  return total;
}

function archiveFileName(program) {
  return clean(enrichmentFor(program).archiveFilename) || path.posix.basename(clean(program.file) || clean(program.download?.path) || "");
}

function confidenceLabel(program, field) {
  const enrichment = enrichmentFor(program);
  if (field === "author") {
    if (clean(enrichment.manualAuthor)) return "manual source correction";
    if (clean(enrichment.archiveTextAuthor)) return "readme/archive text";
    if (clean(enrichment.inferredAuthor)) return "filename/source inferred";
    if (clean(program.author)) return "catalog only";
    return "unknown";
  }
  if (field === "category") {
    if (enrichment.manualPurposeSignals?.length) return "curated source clue";
    if (enrichment.archivePurposeSignals?.length) return "readme/archive text";
    if ((enrichment.externalArchiveTextEvidence || []).some((item) => item.purposeSignals?.length)) return "external ZIP text";
    if (clean(program.category) && program.category !== "uncategorized") return "catalog/path inferred";
    return "needs review";
  }
  if (field === "version") {
    if (enrichment.archiveAolVersions?.length) return "readme/archive text";
    if (clean(enrichment.inferredAolVersion)) return "filename/source inferred";
    if (clean(program.versions)) return "catalog bucket";
    return "unknown";
  }
  if (field === "source") {
    if (program.download?.status === "ready" && (enrichment.webDownloadLinks?.length || enrichment.mirrorLinks?.some((item) => item.status === "ready"))) {
      return "local + old-web lead";
    }
    if (program.download?.status === "ready") return "local catalog mirror";
    if (enrichment.mirrorLinks?.some((item) => item.status === "ready")) return "external mirror";
    if (enrichment.webDownloadLinks?.length) return "old-web lead";
    return "catalog metadata only";
  }
  return "unknown";
}

function manualReviewReasons(program) {
  return reviewProfile(program).reasons;
}

function reviewProfile(program) {
  const enrichment = enrichmentFor(program);
  const evidence = {
    oldWeb: enrichment.webDownloadLinks?.length || 0,
    mirrors: enrichment.mirrorLinks?.length || 0,
    webMentions: enrichment.webMentions?.length || 0,
    webImages: enrichment.webImageLinks?.length || 0,
    archiveText: enrichment.archiveTextFiles?.length || 0,
    externalText: enrichment.externalArchiveTextEvidence?.length || 0,
    screenshots: program.screenshotCount || 0,
  };
  const reasons = [];
  let score = 0;

  if (enrichment.authorConflict) {
    reasons.push("author conflict");
    score += 6;
  }
  if (!program.download?.path || program.download?.status !== "ready") {
    reasons.push("main local file missing");
    score += 5;
  }
  if (!clean(program.category) || program.category === "uncategorized") {
    reasons.push("category uncertain");
    score += 4;
  }
  if (programType(program) === "Unknown / needs review") {
    reasons.push("type uncertain");
    score += 3;
  }
  if (!primaryAuthor(program)) {
    reasons.push("author unknown");
    score += evidence.oldWeb || evidence.mirrors || evidence.archiveText || evidence.externalText ? 3 : 1;
  }
  if (!evidence.oldWeb && !evidence.mirrors) {
    reasons.push("no old-web download or mirror lead");
    score += 2;
  }
  if (evidence.externalText) {
    reasons.push("matched external ZIP text to verify");
    score += 2;
  }
  if (!evidence.archiveText && !evidence.externalText && program.download?.status === "ready") {
    reasons.push("no readable text evidence");
    score += 1;
  }
  if (!evidence.screenshots && evidence.webImages) {
    reasons.push("web image lead needs screenshot match");
    score += 2;
  }
  if (/account|tos|punter|room buster|mass mailer/i.test(program.category || "")) {
    reasons.push("sensitive historical category");
    score += 3;
  }

  const level = score >= 8 ? "high" : score >= 4 ? "medium" : score > 0 ? "low" : "none";
  return { score, level, reasons, evidence };
}

function nextResearchAction(program, review = reviewProfile(program)) {
  const reasons = new Set(review.reasons);
  if (reasons.has("author conflict")) return "Compare catalog author, archive text, and old-page mentions before changing attribution.";
  if (reasons.has("main local file missing")) return "Check old-web mirrors and recovery pages for a recoverable local copy.";
  if (reasons.has("category uncertain") || reasons.has("type uncertain")) return "Scan readable text and old source-page labels to assign category/type.";
  if (reasons.has("matched external ZIP text to verify")) return "Open the external ZIP text evidence page and promote reliable author/version/purpose clues.";
  if (reasons.has("web image lead needs screenshot match")) return "Match the web image lead to the correct program page or screenshot entry.";
  if (reasons.has("no old-web download or mirror lead")) return "Search source link directories and Wayback for an original download URL.";
  if (reasons.has("author unknown")) return "Search readmes, NFOs, source comments, and old-page text for an author clue.";
  return "Review metadata when more source evidence is found.";
}

function runtimeDownloadKind(item) {
  const value = `${item.sourceList || ""} ${item.discoveredText || ""} ${item.name || ""} ${item.originalUrl || ""}`.toLowerCase();
  const file = String(item.name || item.originalUrl || "").toLowerCase();
  if (/archive\.org/.test(value) && /winamp skin/.test(value)) return "Winamp skin";
  if (/\.(dll|ocx|vbx)(?:$|[?#])/.test(file) || /\b(msvbvm|comdlg|riched|chatocx|chatscan|msinet|mswinsck|vb5chat|vb40032|vb40016)\b/.test(value)) {
    return "DLL/OCX runtime";
  }
  if (/\bdeadaim\b|jdennis\.net\/deadaim/.test(value)) return "DeadAIM / AIM enhancer";
  if (/\b(aimplus|aim\s*pluss|aimster|aimcreat|aim\s*creation)\b/.test(value)) return "AIM utility or enhancer";
  if (/\b(format\s*sn|masteraol|aolfiledownloader|aol\s*file\s*downloader)\b/.test(value)) return "AOL utility";
  if (
    /archive\.org/.test(value) ||
    /\b(aim44|aim\d|aim\s+\d|aol30german|aolp\d|setupaol|aolsetup|aol\dsetup)\b/.test(value)
  ) {
    return "AOL/AIM client installer";
  }
  return "other";
}

function isRuntimeDownload(item) {
  return runtimeDownloadKind(item) === "DLL/OCX runtime";
}

function isDeadAimOrAimEnhancer(item) {
  const kind = runtimeDownloadKind(item);
  return kind === "DeadAIM / AIM enhancer" || kind === "AIM utility or enhancer";
}

function isWinampSkinDownload(item) {
  return runtimeDownloadKind(item) === "Winamp skin";
}

function isAolUtilityDownload(item) {
  const kind = runtimeDownloadKind(item);
  return kind === "AOL utility" || kind === "AOL/AIM client installer";
}

function isDeadOrFalseLead(item) {
  return /^(http-404|html-replay|invalid-archive|empty-file|out-of-scope|too-large|failed)$/i.test(item.status || "");
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
      "Author confidence",
      "Local file",
      "Old-web/download leads",
      "Reference mirror",
      "Embedded URLs",
      "Screens",
      "Review priority",
      "Needs review",
    ],
    items.map((program) => {
      const embedded = uniqueBy(urlIndex.perProgram?.[program.id]?.urls || [], (item) => item.url);
      const review = reviewProfile(program);
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
        confidenceLabel(program, "author"),
        program.download?.path ? localLink(fromDoc, program.download.path, program.download.path) : program.download?.status || "remote-only",
        oldWebDownloadCount(program),
        joinedReferenceMirrorLinks(program),
        embedded.length ? embedded.map((item) => link(item.url, item.url)).join("<br>") : "",
        String(program.screenshotCount || 0),
        `${review.level} (${review.score})`,
        review.reasons.join("<br>"),
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
  if (/archive\.org|aol client and aim version directory|user-supplied dnx acp|user-supplied coltpro|user-supplied aol utility|aim versions|missing files/.test(source)) {
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
const archiveOrgSoftware = readJson("data/archiveorg-software.json", { items: [] });
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
  ["Oogle Rampage script tutorials", "Rampage Toolz scripting/source lead", "https://web.archive.org/web/20001205033300/http://www.oogle.net/o_tutorial.htm"],
  ["Rampage Toolz 1.1 Source", "Oogle source page", "https://web.archive.org/web/20010119175900/http://www.oogle.net/rt1source/"],
  ["Rampage Toolz 1.1 source ZIP", "Wayback source-code download lead", "https://web.archive.org/web/20000619003422/http://www.oogle.net/rt1source/rt1_src.zip"],
  ["Rampage Toolz 2 source code", "Wayback download lead", "https://web.archive.org/web/20130805181931/http://www.oogle.com/download/rampagetools2source.zip"],
  ["Rampage Toolz 2 setup", "Wayback download lead", "https://web.archive.org/web/20010613064806/http://www.oogle.net/rampage/setuprt22.exe"],
  ["Rampage Script SDK", "Wayback download lead", "https://web.archive.org/web/20001205033300/http://www.oogle.net/downloads/rscript.zip"],
  ["Rampage Script Tutorial #1", "Wayback tutorial DOC lead", "https://web.archive.org/web/20001205033300/http://www.oogle.net/downloads/script_tutorial1.doc"],
  ["Rampage Script Tutorial #2", "Wayback tutorial DOC lead", "https://web.archive.org/web/20001205033300/http://www.oogle.net/downloads/script_tutorial2.doc"],
  ["Rampage Script Tutorial #3", "Wayback tutorial DOC lead", "https://web.archive.org/web/20001205033300/http://www.oogle.net/downloads/script_tutorial3.doc"],
  ["Rampage Toolz elite skin", "Wayback skin ZIP lead", "https://web.archive.org/web/20000604165228id_/http://www.oogle.net/rampage/skin_elite.zip"],
  ["Rampage Toolz insane skin", "Wayback skin ZIP lead", "https://web.archive.org/web/20000531142607id_/http://www.oogle.net/rampage/skin_insane.zip"],
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
  ["Archive.org AOL creator software search", "Archive.org software search", "https://archive.org/search?query=creator%3A%22AOL%22&page=3&and%5B%5D=mediatype%3A%22software%22"],
  ["Archive.org AOL software search", "Archive.org software search", "https://archive.org/search?query=aol&page=2&and%5B%5D=mediatype%3A%22software%22"],
  ["Archive.org AIM AOL software search", "Archive.org software search", "https://archive.org/search?query=AIM+aol&page=2&and%5B%5D=mediatype%3A%22software%22"],
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

function isNoisySourceUrl(url) {
  const cleanedUrl = clean(url);
  if (!cleanedUrl) return false;
  try {
    const parsed = new URL(cleanedUrl);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathName = parsed.pathname.toLowerCase();
    if (host === "github.com") {
      return (
        /^\/(?:login|signup|contact|topics|marketplace|features|pricing|explore)(?:\/|$)/.test(pathName) ||
        /\/(?:actions|issues|pulls|projects|security|pulse|branches|tags|discussions|commits|stargazers|forks|watchers|network|graphs|settings|notifications)(?:\/|$)/.test(
          pathName,
        )
      );
    }
    return /\/wp-(?:json|admin|login)|\/feed\/?$|\/comments\/feed\/?$/.test(pathName);
  } catch {
    return false;
  }
}

function buildMasterLinks() {
  const links = new Map();
  const add = ({ url, label, kind, source, context }) => {
    const cleanedUrl = clean(url);
    if (!cleanedUrl) return;
    if (isNoisySourceUrl(cleanedUrl)) return;
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
  for (const item of archiveOrgSoftware.items || []) {
    add({ url: item.itemUrl, label: item.title, kind: "Archive.org software item", source: "Archive.org AOL/AIM software", context: item.category || item.version || "" });
    add({ url: item.metadataUrl, label: `${item.title} metadata`, kind: "Archive.org metadata API", source: "Archive.org AOL/AIM software", context: item.identifier || "" });
    for (const file of item.files || []) {
      if (file.downloadUrl) {
        add({
          url: file.downloadUrl,
          label: file.name,
          kind: file.importCandidate ? "Archive.org import candidate" : "Archive.org file",
          source: item.title,
          context: [item.category, item.version, file.sizeLabel].filter(Boolean).join("; "),
        });
      }
    }
    for (const image of item.images || []) {
      add({ url: image.url, label: image.name, kind: "Archive.org preview image", source: item.title, context: image.sizeLabel || "" });
    }
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

function programExportRecord(program) {
  const embedded = uniqueBy(urlIndex.perProgram?.[program.id]?.urls || [], (item) => item.url);
  const enrichment = enrichmentFor(program);
  const review = reviewProfile(program);
  return {
    index: program.index,
    id: program.id,
    bestName: displayName(program),
    catalogLabel: clean(program.name),
    archiveFilename: archiveFileName(program),
    fileSize: fileSizeLabel(program),
    progType: programType(program),
    category: clean(program.category) || "uncategorized",
    platform: clean(program.platform) || "unknown",
    aolVersion: displayVersion(program),
    author: displayAuthor(program),
    authorConfidence: confidenceLabel(program, "author"),
    categoryConfidence: confidenceLabel(program, "category"),
    versionConfidence: confidenceLabel(program, "version"),
    sourceConfidence: confidenceLabel(program, "source"),
    localFile: program.download?.path || "",
    referenceUrl: program.download?.originalUrl || "",
    rawSourceUrl: program.download?.rawUrl || "",
    oldWebDownloadLinks: enrichment.webDownloadLinks?.length || 0,
    mirrorLeads: enrichment.mirrorLinks?.length || 0,
    webResearchMentions: enrichment.webMentions?.length || 0,
    screenshots: program.screenshotCount || 0,
    embeddedUrls: embedded.length,
    reviewPriority: review.level,
    reviewScore: review.score,
    manualReviewFlags: review.reasons.join("; "),
    nextResearchAction: nextResearchAction(program, review),
    tags: appTags(program, embedded).join("; "),
    detailPage: appDocPaths.get(program.id) || "",
  };
}

function recoveredFileRecords() {
  const rows = [];
  for (const program of programs) {
    if (!program.download?.path) continue;
    rows.push({
      kind: "main catalog file",
      name: displayName(program),
      status: program.download.status || "ready",
      size: program.download.sizeLabel || fileSizeLabel(program),
      bytes: program.download.size || "",
      sha1: "",
      localPath: program.download.path,
      source: program.file || "",
      originalUrl: program.download.originalUrl || "",
      waybackUrl: "",
      detailPage: appDocPaths.get(program.id) || "",
    });
  }
  for (const item of externalDownloads.downloads || []) {
    if (item.status !== "ready" || !item.localPath) continue;
    rows.push({
      kind: runtimeDownloadKind(item) === "other" ? "external recovered file" : runtimeDownloadKind(item),
      name: item.name || fileStem(item.originalUrl || item.waybackUrl),
      status: item.status || "ready",
      size: formatBytes(item.size),
      bytes: item.size || "",
      sha1: item.sha1 || "",
      localPath: item.localPath,
      source: item.sourceList || "",
      originalUrl: item.originalUrl || "",
      waybackUrl: item.waybackUrl || item.downloadUrl || "",
      detailPage: "",
    });
  }
  for (const asset of webAssets.assets || []) {
    if (asset.status !== "ready" || !asset.localPath) continue;
    rows.push({
      kind: "recovered web image",
      name: asset.text || fileStem(asset.localPath),
      status: asset.status || "ready",
      size: formatBytes(asset.size),
      bytes: asset.size || "",
      sha1: "",
      localPath: asset.localPath,
      source: asset.pageName || "",
      originalUrl: asset.originalUrl || asset.url || "",
      waybackUrl: asset.url || "",
      detailPage: "",
    });
  }
  for (const item of archiveOrgSoftware.items || []) {
    for (const image of item.images || []) {
      if (!image.localPath) continue;
      rows.push({
        kind: "Archive.org preview image",
        name: `${item.title}: ${image.name}`,
        status: "ready",
        size: image.sizeLabel || formatBytes(image.size),
        bytes: image.size || "",
        sha1: "",
        localPath: image.localPath,
        source: item.itemUrl || "",
        originalUrl: image.url || "",
        waybackUrl: image.url || "",
        detailPage: "",
      });
    }
  }
  return uniqueBy(rows, (item) => `${item.kind}|${item.localPath}|${item.originalUrl}`).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

function originalDownloadRecords() {
  const rows = [];
  const add = (record) => {
    const url = clean(record.url || record.originalUrl || record.waybackUrl);
    if (!url) return;
    rows.push({ ...record, url });
  };
  for (const program of programs) {
    const detailPage = appDocPaths.get(program.id) || "";
    const enrichment = enrichmentFor(program);
    add({
      name: displayName(program),
      kind: "reference repository page",
      status: program.download?.status || "",
      source: program.file || "",
      url: program.download?.originalUrl,
      localPath: program.download?.path || "",
      detailPage,
    });
    add({
      name: displayName(program),
      kind: "reference repository raw file",
      status: program.download?.status || "",
      source: program.file || "",
      url: program.download?.rawUrl,
      localPath: program.download?.path || "",
      detailPage,
    });
    for (const item of enrichment.webDownloadLinks || []) {
      add({
        name: displayName(program),
        kind: "old-web program download lead",
        status: "lead",
        source: item.sourceName || "",
        url: item.originalUrl || item.url,
        localPath: "",
        detailPage,
      });
      add({
        name: displayName(program),
        kind: "Wayback program download lead",
        status: "lead",
        source: item.sourceName || "",
        url: item.url,
        localPath: "",
        detailPage,
      });
    }
    for (const item of enrichment.mirrorLinks || []) {
      add({
        name: displayName(program),
        kind: "external mirror original URL",
        status: item.status || "lead",
        source: item.sourceName || "",
        url: item.originalUrl,
        localPath: item.localPath || "",
        detailPage,
      });
      add({
        name: displayName(program),
        kind: "external mirror Wayback URL",
        status: item.status || "lead",
        source: item.sourceName || "",
        url: item.waybackUrl,
        localPath: item.localPath || "",
        detailPage,
      });
    }
  }
  for (const item of externalDownloads.downloads || []) {
    add({
      name: item.name || fileStem(item.originalUrl || item.waybackUrl),
      kind: "external recovery original URL",
      status: item.status || "",
      source: item.sourceList || "",
      url: item.originalUrl,
      localPath: item.localPath || "",
      detailPage: "",
    });
    add({
      name: item.name || fileStem(item.originalUrl || item.waybackUrl),
      kind: "external recovery Wayback URL",
      status: item.status || "",
      source: item.sourceList || "",
      url: item.waybackUrl || item.downloadUrl,
      localPath: item.localPath || "",
      detailPage: "",
    });
  }
  for (const item of archiveOrgSoftware.items || []) {
    add({
      name: item.title || item.identifier,
      kind: "Archive.org item page",
      status: item.storageNote || "",
      source: "Archive.org AOL/AIM software",
      url: item.itemUrl,
      localPath: "",
      detailPage: `${generatedRoot}/sources/archiveorg-aol-aim-software.md`,
    });
    for (const file of item.files || []) {
      add({
        name: file.name || item.title || item.identifier,
        kind: file.importCandidate ? "Archive.org import candidate" : "Archive.org file URL",
        status: file.importCandidate ? "candidate" : "linked",
        source: item.title || item.identifier,
        url: file.downloadUrl,
        localPath: "",
        detailPage: `${generatedRoot}/sources/archiveorg-aol-aim-software.md`,
      });
    }
  }
  for (const candidate of missingCandidates.candidates || []) {
    for (const mirror of candidate.mirrors || []) {
      add({
        name: candidate.fileName || candidate.key || "missing candidate",
        kind: "missing-candidate original URL",
        status: mirror.status || "",
        source: mirror.source || "",
        url: mirror.url,
        localPath: (candidate.readyLocalFiles || [])[0] || "",
        detailPage: "",
      });
      add({
        name: candidate.fileName || candidate.key || "missing candidate",
        kind: "missing-candidate Wayback URL",
        status: mirror.status || "",
        source: mirror.source || "",
        url: mirror.waybackUrl,
        localPath: (candidate.readyLocalFiles || [])[0] || "",
        detailPage: "",
      });
    }
  }
  return uniqueBy(rows, (item) => canonicalUrl(item.url)).sort((a, b) => urlHost(a.url).localeCompare(urlHost(b.url)) || a.url.localeCompare(b.url));
}

function sourceNameKey(value) {
  return clean(value).replace(/^Web page:\s*/i, "").toLowerCase();
}

function sourceSiteRows() {
  const externalBySource = new Map();
  for (const item of externalDownloads.downloads || []) {
    const key = sourceNameKey(item.sourceList || "");
    const record = externalBySource.get(key) || { attempts: 0, ready: 0 };
    record.attempts += 1;
    if (item.status === "ready") record.ready += 1;
    externalBySource.set(key, record);
  }
  const assetsBySource = new Map();
  for (const asset of webAssets.assets || []) {
    const key = sourceNameKey(asset.pageName || "");
    const record = assetsBySource.get(key) || { images: 0, ready: 0 };
    record.images += 1;
    if (asset.status === "ready") record.ready += 1;
    assetsBySource.set(key, record);
  }
  return (webResources.pages || [])
    .map((page) => {
      const key = sourceNameKey(page.name);
      const external = externalBySource.get(key) || { attempts: 0, ready: 0 };
      const assets = assetsBySource.get(key) || { images: 0, ready: 0 };
      return {
        name: page.name,
        kind: page.kind || "",
        status: page.ok ? "ok" : `not ok${page.status ? ` (${page.status})` : ""}`,
        host: urlHost(page.url),
        links: page.linkCount || 0,
        downloads: page.downloadCount || 0,
        externalAttempts: external.attempts,
        recoveredDownloads: external.ready,
        imageAttempts: assets.images,
        recoveredImages: assets.ready,
        localPath: page.localPath || "",
        url: page.url,
      };
    })
    .sort((a, b) => b.downloads - a.downloads || b.externalAttempts - a.externalAttempts || a.name.localeCompare(b.name));
}

function sourceFamily(pageOrRow) {
  const value = `${pageOrRow.name || ""} ${pageOrRow.kind || ""} ${pageOrRow.url || ""}`.toLowerCase();
  if (/lenshell/.test(value)) return "LensHellArchive";
  if (/freeprogz|phat/.test(value)) return "FreeProgz";
  if (/oogle|rampage/.test(value)) return "Oogle / Rampage";
  if (/methodus/.test(value)) return "Methodus2000";
  if (/progstation/.test(value)) return "ProgStation";
  if (/aimthings/.test(value)) return "AIMThings";
  if (/loltoolz|ricejerry/.test(value)) return "RiceJerry / LoLToolz";
  if (/click-online/.test(value)) return "Click-Online";
  if (/aimfilez|aim files/.test(value)) return "AIMFilez";
  if (/archive\.org|internet archive/.test(value)) return "Internet Archive";
  if (/aol-progz\.com/.test(value)) return "AOL-Progz.com";
  if (/justinakapaste|digital5k|plozee/.test(value)) return "Modern context/archive articles";
  if (/progzrescue|github/.test(value)) return "GitHub / ProgzRescue";
  if (/am\.net/.test(value)) return "AM.NET AOL tools";
  return "Other old-web sources";
}

function sourceFamilySummaryRows(rows) {
  const grouped = groupBy(rows, sourceFamily);
  return [...grouped.entries()]
    .map(([family, items]) => {
      const topPages = [...items]
        .sort((a, b) => b.downloads - a.downloads || b.links - a.links || a.name.localeCompare(b.name))
        .slice(0, 8)
        .map((item) => `${item.name} (${item.downloads} downloads)`)
        .join("<br>");
      return [
        family,
        String(items.length),
        String(items.reduce((sum, item) => sum + Number(item.links || 0), 0)),
        String(items.reduce((sum, item) => sum + Number(item.downloads || 0), 0)),
        String(items.reduce((sum, item) => sum + Number(item.externalAttempts || 0), 0)),
        String(items.reduce((sum, item) => sum + Number(item.recoveredDownloads || 0), 0)),
        String(items.reduce((sum, item) => sum + Number(item.imageAttempts || 0), 0)),
        String(items.reduce((sum, item) => sum + Number(item.recoveredImages || 0), 0)),
        topPages,
      ];
    })
    .sort((a, b) => Number(b[3]) - Number(a[3]) || Number(b[2]) - Number(a[2]) || a[0].localeCompare(b[0]));
}

function sourceFamilyDetailRows(rows) {
  return rows
    .map((item) => [
      sourceFamily(item),
      item.name,
      item.kind,
      item.status,
      item.host,
      String(item.links),
      String(item.downloads),
      String(item.externalAttempts),
      String(item.recoveredDownloads),
      String(item.recoveredImages),
      item.localPath ? localLink(`${generatedRoot}/sources/source-deep-dives.md`, item.localPath, item.localPath) : "",
      link(item.url, item.url),
    ])
    .sort((a, b) => a[0].localeCompare(b[0]) || Number(b[6]) - Number(a[6]) || a[1].localeCompare(b[1]));
}

function lensHellCategoryRows() {
  return (webResources.pages || [])
    .filter((page) => /lenshell/i.test(`${page.name} ${page.url}`) && (page.downloadCount || 0) > 0)
    .map((page) => {
      const downloads = (page.links || []).filter((item) => item.type === "download");
      const ready = downloads.filter((item) => recoveryForUrl(item.originalUrl || item.url)?.status === "ready");
      return [
        page.name,
        page.kind || "",
        String(page.downloadCount || downloads.length),
        String(ready.length),
        downloads
          .slice(0, 10)
          .map((item) => {
            const status = recoveryForUrl(item.originalUrl || item.url)?.status || "lead";
            return `${item.text || fileStem(item.originalUrl || item.url)} (${status})`;
          })
          .join("<br>"),
        page.localPath ? localLink(`${generatedRoot}/sources/lenshell-categories.md`, page.localPath, page.localPath) : "",
        link(page.url, page.url),
      ];
    })
    .sort((a, b) => Number(b[2]) - Number(a[2]) || a[0].localeCompare(b[0]));
}

function archiveOrgItemRows(fromDoc) {
  return (archiveOrgSoftware.items || []).map((item) => {
    const importFiles = (item.files || []).filter((file) => file.importCandidate);
    const oversized = (item.files || []).filter((file) => Number(file.size || 0) >= 50 * 1024 * 1024);
    const images = item.images || [];
    return [
      item.title || item.identifier,
      item.category || "",
      item.version || "",
      item.date || "",
      item.creator || "",
      item.itemSizeLabel || formatBytes(item.itemSize),
      String(importFiles.length),
      String(oversized.length),
      String(images.length),
      item.storageNote || "",
      item.itemUrl ? link(item.itemUrl, item.itemUrl) : "",
      item.metadataUrl ? link("metadata", item.metadataUrl) : "",
    ];
  });
}

function archiveOrgVersionSummaryRows() {
  const grouped = groupBy(archiveOrgSoftware.items || [], (item) => item.version || "unknown");
  const versionRank = (label) => {
    const text = String(label || "");
    if (/unknown/i.test(text)) return 9999;
    const match = text.match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : 9000;
  };
  return [...grouped.entries()]
    .map(([version, items]) => {
      const categories = uniqueBy(items.map((item) => item.category || "uncategorized"), (item) => item).sort();
      const importFiles = items.flatMap((item) => (item.files || []).filter((file) => file.importCandidate));
      const oversized = items.flatMap((item) => (item.files || []).filter((file) => Number(file.size || 0) >= 50 * 1024 * 1024));
      const years = uniqueBy(
        items
          .map((item) => String(item.date || "").match(/\d{4}/)?.[0])
          .filter(Boolean),
        (item) => item,
      ).sort();
      const samples = items
        .slice(0, 5)
        .map((item) => (item.itemUrl ? link(item.title || item.identifier, item.itemUrl) : item.title || item.identifier))
        .join("<br>");
      return [
        version,
        categories.join("<br>"),
        String(items.length),
        String(importFiles.length),
        String(oversized.length),
        years.length ? `${years[0]}${years.length > 1 ? `-${years[years.length - 1]}` : ""}` : "unknown",
        samples,
      ];
    })
    .sort((a, b) => versionRank(a[0]) - versionRank(b[0]) || a[0].localeCompare(b[0]));
}

function archiveOrgImportRows(fromDoc) {
  const externalByArchiveUrl = new Map(
    (externalDownloads.downloads || [])
      .filter((item) => item.archiveOrgIdentifier || /archive\.org/i.test(`${item.sourceList || ""} ${item.originalUrl || ""}`))
      .map((item) => [canonicalUrl(item.originalUrl), item]),
  );
  return (archiveOrgSoftware.items || [])
    .flatMap((item) =>
      (item.files || [])
        .filter((file) => file.importCandidate)
        .map((file) => {
          const recovered = externalByArchiveUrl.get(canonicalUrl(file.downloadUrl)) || {};
          return [
            item.title || item.identifier,
            item.category || "",
            item.version || "",
            file.name || "",
            file.kind || "",
            file.sizeLabel || formatBytes(file.size),
            recovered.status || "candidate",
            recovered.sha1 || file.sha1 || "",
            recovered.localPath ? localLink(fromDoc, recovered.localPath, recovered.localPath) : "not recovered",
            file.downloadUrl ? link(file.downloadUrl, file.downloadUrl) : "",
          ];
        }),
    )
    .sort((a, b) => a[0].localeCompare(b[0]) || a[3].localeCompare(b[3]));
}

function archiveOrgLinkedFileRows() {
  return (archiveOrgSoftware.items || [])
    .flatMap((item) =>
      (item.files || [])
        .filter((file) => !file.importCandidate && Number(file.size || 0) >= 50 * 1024 * 1024)
        .map((file) => [
          item.title || item.identifier,
          item.category || "",
          item.version || "",
          file.name || "",
          file.kind || "",
          file.sizeLabel || formatBytes(file.size),
          item.storageNote || "",
          file.downloadUrl ? link(file.downloadUrl, file.downloadUrl) : "",
        ]),
    )
    .sort((a, b) => Number((b[5].match(/\d+/) || [0])[0]) - Number((a[5].match(/\d+/) || [0])[0]) || a[0].localeCompare(b[0]));
}

function archiveOrgImageRows(fromDoc) {
  return (archiveOrgSoftware.items || [])
    .flatMap((item) =>
      (item.images || []).map((image) => [
        item.title || item.identifier,
        item.category || "",
        item.version || "",
        image.name || "",
        image.sizeLabel || formatBytes(image.size),
        image.localPath ? localLink(fromDoc, image.localPath, image.localPath) : "",
        image.url ? link(image.url, image.url) : "",
      ]),
    )
    .sort((a, b) => a[0].localeCompare(b[0]) || a[3].localeCompare(b[3]));
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
  const review = reviewProfile(program);
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
    ["Author confidence", confidenceLabel(program, "author")],
    ["Category confidence", confidenceLabel(program, "category")],
    ["AOL/version confidence", confidenceLabel(program, "version")],
    ["Source confidence", confidenceLabel(program, "source")],
    ["Review priority", `${review.level} (${review.score})`],
    ["Manual review flags", review.reasons.length ? review.reasons.join(", ") : "none"],
    ["Next research action", nextResearchAction(program, review)],
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
    "- [Master progs table](generated/applications/all-progs-master.md)",
    "- [Detailed all-progs inventory](generated/applications/all-programs-detailed.md)",
    "- [All program download links](generated/applications/all-program-downloads.md)",
    "- [Web research mentions](generated/applications/web-research-mentions.md)",
    "- [Enrichment report](generated/applications/enrichment-report.md)",
    "- [Metadata confidence report](generated/applications/metadata-confidence.md)",
    "- [Author conflicts](generated/applications/author-conflicts.md)",
    "- [Needs manual review](generated/applications/needs-manual-review.md)",
    "- [Research priority queue](generated/applications/research-priority.md)",
    "- [Coverage gaps](generated/applications/coverage-gaps.md)",
    "- [Timeline](generated/applications/timeline.md)",
    "- [Master link index](generated/sources/all-links.md)",
    "- [Links you supplied](generated/sources/user-supplied-links.md)",
    "- [Original download URLs](generated/sources/original-download-urls.md)",
    "- [Recovered files](generated/sources/recovered-files.md)",
    "- [Top source sites](generated/sources/top-source-sites.md)",
    "- [Source deep dives](generated/sources/source-deep-dives.md)",
    "- [LensHell category report](generated/sources/lenshell-categories.md)",
    "- [Recovered missing candidates](generated/sources/missing-ready.md)",
    "- [Runtime files](generated/sources/runtime-files.md)",
    "- [Archive.org AOL/AIM software](generated/sources/archiveorg-aol-aim-software.md)",
    "- [DeadAIM and AIM enhancers](generated/sources/deadaim-aim-enhancers.md)",
    "- [AOL utilities](generated/sources/aol-utilities.md)",
    "- [Winamp skins and media extras](generated/sources/winamp-skins.md)",
    "- [Categories](generated/categories/README.md)",
    "- [Prog type index](generated/categories/type-index.md)",
    "- [AOL version buckets](generated/versions/README.md)",
    "- [Tags](generated/tags/README.md)",
    "- [Source pages and old-school links](generated/sources/README.md)",
    "- [Plain data exports](generated/exports/README.md)",
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
        ["Programs needing manual review", String(programs.filter((program) => reviewProfile(program).score >= 4).length)],
        ["High-priority review entries", String(programs.filter((program) => reviewProfile(program).score >= 8).length)],
        ["Medium-priority review entries", String(programs.filter((program) => reviewProfile(program).score >= 4 && reviewProfile(program).score < 8).length)],
        ["Crawled source pages", String(webResources.pageCount || webResources.pages?.length || 0)],
        ["Crawled unique links", String(webResources.linkCount || 0)],
        ["Crawled download links", String(webResources.downloadCount || 0)],
        ["Master deduped link index", String(masterLinks.length)],
        ["Deduped original/download URLs", String(originalDownloadRecords().length)],
        ["User supplied priority links", String(uniqueBy(userSuppliedLinks, (item) => linkKey(item[2])).length)],
        ["Recovered external files", String(externalDownloads.readyCount || 0)],
        ["Recovered local file records", String(recoveredFileRecords().length)],
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
    "- [Master progs table](applications/all-progs-master.md)",
    "- [Detailed all-progs inventory](applications/all-programs-detailed.md)",
    "- [All program download links](applications/all-program-downloads.md)",
    "- [Web research mentions](applications/web-research-mentions.md)",
    "- [Enrichment report](applications/enrichment-report.md)",
    "- [Metadata confidence report](applications/metadata-confidence.md)",
    "- [Author conflicts](applications/author-conflicts.md)",
    "- [Needs manual review](applications/needs-manual-review.md)",
    "- [Research priority queue](applications/research-priority.md)",
    "- [Coverage gaps](applications/coverage-gaps.md)",
    "- [Timeline](applications/timeline.md)",
    "- [Categories](categories/README.md)",
    "- [Prog type index](categories/type-index.md)",
    "- [AOL versions](versions/README.md)",
    "- [Tags](tags/README.md)",
    "- [Authors](authors/README.md)",
    "- [Sources and old links](sources/README.md)",
    "- [Master link index](sources/all-links.md)",
    "- [Original download URLs](sources/original-download-urls.md)",
    "- [Recovered files](sources/recovered-files.md)",
    "- [Top source sites](sources/top-source-sites.md)",
    "- [Source deep dives](sources/source-deep-dives.md)",
    "- [LensHell category report](sources/lenshell-categories.md)",
    "- [Recovered missing candidates](sources/missing-ready.md)",
    "- [Runtime files](sources/runtime-files.md)",
    "- [Archive.org AOL/AIM software](sources/archiveorg-aol-aim-software.md)",
    "- [DeadAIM and AIM enhancers](sources/deadaim-aim-enhancers.md)",
    "- [AOL utilities](sources/aol-utilities.md)",
    "- [Winamp skins and media extras](sources/winamp-skins.md)",
    "- [Plain CSV/JSON exports](exports/README.md)",
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
    "- [Master progs table](all-progs-master.md)",
    "- [Detailed all-progs inventory](all-programs-detailed.md)",
    "- [All program download links](all-program-downloads.md)",
    "- [Web research mentions](web-research-mentions.md)",
    "- [Enrichment report](enrichment-report.md)",
    "- [Metadata confidence report](metadata-confidence.md)",
    "- [Author conflicts](author-conflicts.md)",
    "- [Needs manual review](needs-manual-review.md)",
    "- [Research priority queue](research-priority.md)",
    "- [Coverage gaps](coverage-gaps.md)",
    "- [Timeline](timeline.md)",
    "- [Compact all applications table](all-applications.md)",
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/applications/all-applications.md`,
  ["# All Applications", "", appTable(`${generatedRoot}/applications/all-applications.md`, programs)].join("\n"),
);

writeDoc(
  `${generatedRoot}/applications/all-progs-master.md`,
  [
    "# Master Progs Table",
    "",
    "This is the main researcher-facing progs list. It keeps the actual best-known name, original catalog label, category, prog type, AOL/AIM version clues, author, evidence confidence, local file, old web leads, original/reference URL fields, embedded URLs, and screenshot count in one table.",
    "",
    programInventoryTable(`${generatedRoot}/applications/all-progs-master.md`, programs),
  ].join("\n"),
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

const confidenceRows = programs.map((program) => {
  const review = reviewProfile(program);
  return [
    localLink(`${generatedRoot}/applications/metadata-confidence.md`, displayName(program), appDocPaths.get(program.id)),
    program.name,
    confidenceLabel(program, "author"),
    confidenceLabel(program, "category"),
    confidenceLabel(program, "version"),
    confidenceLabel(program, "source"),
    `${review.level} (${review.score})`,
    review.reasons.join("<br>") || "none",
  ];
});

const confidenceSummaryRows = [];
for (const field of ["author", "category", "version", "source"]) {
  const grouped = groupBy(programs, (program) => confidenceLabel(program, field));
  for (const [label, items] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    confidenceSummaryRows.push([field, label, String(items.length)]);
  }
}

writeDoc(
  `${generatedRoot}/applications/metadata-confidence.md`,
  [
    "# Metadata Confidence Report",
    "",
    "This page makes uncertainty visible. Confidence labels explain whether author, category, AOL/version, and source information came from manual correction, readable archive text, filename/source inference, old-web leads, local mirrors, or catalog-only metadata.",
    "",
    "## Summary",
    "",
    table(["Field", "Confidence", "Count"], confidenceSummaryRows),
    "",
    "## Per Program",
    "",
    table(["Program", "Catalog label", "Author", "Category", "AOL/version", "Source", "Review priority", "Review flags"], confidenceRows),
  ].join("\n"),
);

const manualReviewRows = programs
  .map((program) => ({ program, review: reviewProfile(program) }))
  .filter((item) => item.review.score >= 4)
  .sort((a, b) => b.review.score - a.review.score || displayName(a.program).localeCompare(displayName(b.program)))
  .map(({ program, review }) => [
    localLink(`${generatedRoot}/applications/needs-manual-review.md`, displayName(program), appDocPaths.get(program.id)),
    program.name,
    `${review.level} (${review.score})`,
    programType(program),
    program.category || "uncategorized",
    displayVersion(program),
    displayAuthor(program),
    review.reasons.join("<br>"),
    nextResearchAction(program, review),
  ]);

writeDoc(
  `${generatedRoot}/applications/needs-manual-review.md`,
  [
    "# Needs Manual Review",
    "",
    "Medium and high priority entries that need human review because important metadata is weak, conflicting, sensitive, missing, or has recoverable source evidence waiting to be promoted.",
    "",
    table(["Program", "Catalog label", "Priority", "Prog type", "Category", "AOL/version", "Author", "Review flags", "Next action"], manualReviewRows),
  ].join("\n"),
);

const researchPriorityRows = programs
  .map((program) => ({ program, review: reviewProfile(program) }))
  .filter((item) => item.review.score > 0)
  .sort((a, b) => b.review.score - a.review.score || displayName(a.program).localeCompare(displayName(b.program)))
  .map(({ program, review }) => {
    const enrichment = enrichmentFor(program);
    return [
      localLink(`${generatedRoot}/applications/research-priority.md`, displayName(program), appDocPaths.get(program.id)),
      `${review.level} (${review.score})`,
      review.reasons.join("<br>"),
      nextResearchAction(program, review),
      String(enrichment.webDownloadLinks?.length || 0),
      String(enrichment.mirrorLinks?.length || 0),
      String(enrichment.externalArchiveTextEvidence?.length || 0),
      String(program.screenshotCount || 0),
    ];
  });

writeDoc(
  `${generatedRoot}/applications/research-priority.md`,
  [
    "# Research Priority Queue",
    "",
    "A sorted queue for metadata cleanup. High and medium entries should be reviewed before broad low-priority coverage gaps.",
    "",
    table(["Program", "Priority", "Why", "Next action", "Old-web links", "Mirror leads", "External text", "Screens"], researchPriorityRows),
  ].join("\n"),
);

const coverageGapRows = [
  ["Unknown author", String(programs.filter((program) => !primaryAuthor(program)).length), "Look for readme/NFO/source comments and old-page author strings."],
  ["Uncategorized", String(programs.filter((program) => !clean(program.category) || program.category === "uncategorized").length), "Use source-page category labels and archive text to classify."],
  ["Unknown prog type", String(programs.filter((program) => programType(program) === "Unknown / needs review").length), "Infer a more specific function from filename, category, source page, and text clues."],
  ["No screenshot", String(programs.filter((program) => !(program.screenshotCount || 0)).length), "Search source pages and recovered image assets for UI screenshots."],
  ["No old-web download or mirror lead", String(programs.filter((program) => !reviewProfile(program).evidence.oldWeb && !reviewProfile(program).evidence.mirrors).length), "Search link directories and Wayback capture indexes for original download URLs."],
  ["No readable text evidence", String(programs.filter((program) => !reviewProfile(program).evidence.archiveText && !reviewProfile(program).evidence.externalText).length), "Scan archives for readmes, text files, HTML, source comments, and URL shortcuts."],
  ["Author conflicts", String(programs.filter((program) => enrichmentFor(program).authorConflict).length), "Resolve only when old-page and archive-text evidence agree."],
  ["External ZIP text matched", String(programs.filter((program) => reviewProfile(program).evidence.externalText).length), "Promote reliable external mirror clues into program metadata."],
];

writeDoc(
  `${generatedRoot}/applications/coverage-gaps.md`,
  [
    "# Coverage Gaps",
    "",
    "This page separates broad archive coverage gaps from the manual-review priority queue. A gap does not always mean the entry is wrong; it means more evidence would make the record stronger.",
    "",
    table(["Gap", "Count", "How to improve"], coverageGapRows),
  ].join("\n"),
);

const sourceCaptureRows = Object.entries(
  (webResources.pages || []).reduce((acc, page) => {
    const match = clean(page.url).match(/web\.archive\.org\/web\/(\d{4})/i);
    const year = match?.[1] || "live/unknown";
    const record = acc[year] || { pages: 0, downloads: 0, links: 0 };
    record.pages += 1;
    record.downloads += page.downloadCount || 0;
    record.links += page.linkCount || 0;
    acc[year] = record;
    return acc;
  }, {}),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([year, record]) => [year, String(record.pages), String(record.links), String(record.downloads)]);

writeDoc(
  `${generatedRoot}/applications/timeline.md`,
  [
    "# AOL/AIM Prog Era Timeline",
    "",
    "This timeline gives the GitHub archive historical context for AOL, AIM, ICQ, MSN Messenger, old source sites, and later rescue work. It is context for browsing, not a compatibility guarantee for any single file.",
    "",
    table(
      ["Year", "Event", "Context", "Source"],
      (catalog.research?.timeline || []).map((item) => [
        item.year,
        item.title,
        item.description,
        item.source ? link(item.source, item.source) : "",
      ]),
    ),
    "",
    "## Source Capture Years",
    "",
    "This table summarizes the Wayback capture years represented by crawled source pages.",
    "",
    table(["Capture year", "Pages", "Links", "Download links"], sourceCaptureRows),
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

const authorConflictRows = programs
  .filter((program) => enrichmentFor(program).authorConflict)
  .map((program) => {
    const enrichment = enrichmentFor(program);
    return [
      localLink(`${generatedRoot}/applications/author-conflicts.md`, displayName(program), appDocPaths.get(program.id)),
      program.name,
      displayAuthor(program),
      program.author || "",
      enrichment.manualAuthor || "",
      enrichment.archiveTextAuthor || "",
      enrichment.inferredAuthor || "",
      enrichment.authorConflict || "",
    ];
  });

writeDoc(
  `${generatedRoot}/applications/author-conflicts.md`,
  [
    "# Author Conflicts",
    "",
    "These entries have conflicting author clues between catalog metadata, manual notes, filename inference, or readable archive text. The conflict is preserved rather than silently choosing a final attribution.",
    "",
    table(
      ["Program", "Catalog label", "Displayed author", "Catalog author", "Manual author", "Archive-text author", "Inferred author", "Conflict note"],
      authorConflictRows,
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

const byType = groupBy(programs, programType);
const typeRows = [...byType.entries()]
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  .map(([type, items]) => {
    const page = `${generatedRoot}/categories/types/${slugify(type).slice(0, 90)}.md`;
    writeDoc(
      page,
      [
        `# Prog Type: ${type}`,
        "",
        "Prog type is inferred from names, archive paths, categories, and readable text clues. It is intentionally separate from the broader catalog category.",
        "",
        `**Count:** ${items.length}`,
        "",
        appTable(page, items),
      ].join("\n"),
    );
    return [type, String(items.length), localLink(`${generatedRoot}/categories/type-index.md`, "open", page)];
  });

writeDoc(
  `${generatedRoot}/categories/type-index.md`,
  [
    "# Prog Type Index",
    "",
    "This index groups programs by more specific inferred function: all-in-one suites, room busters, punters/booters, faders, idlers, C-Coms, scrollers/macros, linkers, mailers, account/TOS utilities, screen-name tools, source/developer files, media/file utilities, and chat/IM utilities.",
    "",
    table(["Prog type", "Count", "Page"], typeRows),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/categories/README.md`,
  [
    "# Categories",
    "",
    "Categories are inferred from catalog names, source paths, and archive vocabulary. They are useful for browsing but should not be read as perfect compatibility or behavior claims.",
    "",
    table(["Category", "Count", "Meaning", "Page"], categoryRows),
    "",
    "## More Specific Type Index",
    "",
    "- [Browse by inferred prog type](type-index.md)",
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
    "- [Top source sites](top-source-sites.md)",
    "- [Source deep dives](source-deep-dives.md)",
    "- [LensHell category report](lenshell-categories.md)",
    "- [Historical source context](historical-context.md)",
    "- [Download links](download-links.md)",
    "- [Original download URLs](original-download-urls.md)",
    "- [Recovered files](recovered-files.md)",
    "- [External download recovery status](external-downloads.md)",
    "- [External ZIP text evidence](external-archive-text.md)",
    "- [Archive.org AOL/AIM software](archiveorg-aol-aim-software.md)",
    "- [AOL/AIM client and runtime downloads](aol-aim-client-downloads.md)",
    "- [DLL/OCX runtime files](runtime-files.md)",
    "- [DeadAIM and AIM enhancers](deadaim-aim-enhancers.md)",
    "- [AOL utilities](aol-utilities.md)",
    "- [Winamp skins and media extras](winamp-skins.md)",
    "- [Resource and directory links](resource-links.md)",
    "- [LoLToolz AIM progs source report](loltoolz-aim-progs.md)",
    "- [Embedded archive URLs](embedded-archive-urls.md)",
    "- [External mirror groups](mirror-groups.md)",
    "- [Missing candidates and recovered mirrors](missing-candidates.md)",
    "- [Recovered missing candidates](missing-ready.md)",
    "- [Dead or not recovered leads](dead-or-not-recovered-leads.md)",
    "- [Old-school links by program](program-source-leads.md)",
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

const archiveOrgReadyDownloads = (externalDownloads.downloads || []).filter((item) =>
  /archive\.org/i.test(`${item.sourceList || ""} ${item.originalUrl || ""}`),
);
const sourceStatsRows = [
  ...sourceSiteRows(),
  {
    name: "Internet Archive AOL/AIM software",
    kind: "software metadata/download source",
    status: archiveOrgSoftware.itemCount ? "ok" : "not collected",
    host: "archive.org",
    links: (archiveOrgSoftware.items || []).reduce((sum, item) => sum + (item.files?.length || 0) + (item.images?.length || 0) + 2, 0),
    downloads: (archiveOrgSoftware.items || []).reduce((sum, item) => sum + (item.files?.length || 0), 0),
    externalAttempts: archiveOrgReadyDownloads.length,
    recoveredDownloads: archiveOrgReadyDownloads.filter((item) => item.status === "ready").length,
    imageAttempts: archiveOrgSoftware.imageCount || 0,
    recoveredImages: archiveOrgSoftware.localImageCount || 0,
    localPath: "docs/generated/sources/archiveorg-aol-aim-software.md",
    url: "https://archive.org/search?query=aol&and%5B%5D=mediatype%3A%22software%22",
  },
];
writeDoc(
  `${generatedRoot}/sources/top-source-sites.md`,
  [
    "# Top Source Sites",
    "",
    "Source pages ranked by discovered links, download leads, external recovery attempts, recovered downloads, image attempts, and recovered images. This helps show which old-school pages are producing the most useful evidence.",
    "",
    table(
      ["Source/page", "Kind", "Status", "Host", "Links", "Downloads", "External attempts", "Recovered downloads", "Image attempts", "Recovered images", "Local copy", "URL"],
      sourceStatsRows.map((item) => [
        item.name,
        item.kind,
        item.status,
        item.host,
        String(item.links),
        String(item.downloads),
        String(item.externalAttempts),
        String(item.recoveredDownloads),
        String(item.imageAttempts),
        String(item.recoveredImages),
        item.localPath ? localLink(`${generatedRoot}/sources/top-source-sites.md`, item.localPath, item.localPath) : "",
        link(item.url, item.url),
      ]),
    ),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/sources/source-deep-dives.md`,
  [
    "# Source Deep Dives",
    "",
    "Old-school sources grouped into research families. Use this page to decide where to dig next for screenshots, original URLs, authors, categories, and missing-file leads.",
    "",
    "## Family Summary",
    "",
    table(
      ["Family", "Pages", "Links", "Downloads", "External attempts", "Recovered downloads", "Image attempts", "Recovered images", "Top pages"],
      sourceFamilySummaryRows(sourceStatsRows),
    ),
    "",
    "## Page Details",
    "",
    table(
      ["Family", "Source/page", "Kind", "Status", "Host", "Links", "Downloads", "External attempts", "Recovered downloads", "Recovered images", "Local copy", "URL"],
      sourceFamilyDetailRows(sourceStatsRows),
    ),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/sources/lenshell-categories.md`,
  [
    "# LensHell Category Report",
    "",
    "LensHellArchive is one of the strongest category sources in the crawl. This report keeps its category pages visible so punters, room busters, C-Coms, faders, idlers, mailers/servers, termers, X'ers, AIM tools, runtime files, and Visual Basic files can be checked against the main catalog.",
    "",
    table(["LensHell page", "Kind", "Download leads", "Recovered files", "Sample downloads/status", "Local copy", "URL"], lensHellCategoryRows()),
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/sources/archiveorg-aol-aim-software.md`,
  [
    "# Archive.org AOL/AIM Software",
    "",
    "AOL, AOL Gold, AOL Desktop Gold, AIM, DeadAIM, and AOL/AIM-themed Winamp-skin items collected from Internet Archive search and metadata APIs. Small selected files are imported through the external-download manifest; large CD images stay as source links with sizes so GitHub does not become a giant ISO mirror.",
    "",
    `**Items tracked:** ${archiveOrgSoftware.itemCount || archiveOrgSoftware.items?.length || 0}`,
    "",
    `**Import candidates:** ${archiveOrgSoftware.importCandidateCount || 0} (${archiveOrgSoftware.importCandidateSizeLabel || formatBytes(archiveOrgSoftware.importCandidateBytes) || "unknown"})`,
    "",
    `**Preview images mirrored:** ${archiveOrgSoftware.localImageCount || 0} of ${archiveOrgSoftware.imageCount || 0}`,
    "",
    "## Version Summary",
    "",
    table(
      ["Version", "Categories", "Items", "Import files", "Large link-only files", "Years", "Sample items"],
      archiveOrgVersionSummaryRows(),
    ),
    "",
    "## AOL/AIM Version Items",
    "",
    table(
      ["Item", "Category", "Version", "Date", "Creator", "Item size", "Import files", "Oversized files", "Preview images", "Storage note", "Archive.org", "Metadata"],
      archiveOrgItemRows(`${generatedRoot}/sources/archiveorg-aol-aim-software.md`),
    ),
    "",
    "## Imported Or Importable Files",
    "",
    table(
      ["Item", "Category", "Version", "File", "Kind", "Size", "Recovery status", "SHA1", "Local file", "Archive.org download URL"],
      archiveOrgImportRows(`${generatedRoot}/sources/archiveorg-aol-aim-software.md`),
    ),
    "",
    "## Large Link-Only Files",
    "",
    table(["Item", "Category", "Version", "File", "Kind", "Size", "Reason", "Archive.org download URL"], archiveOrgLinkedFileRows()),
    "",
    "## Preview Images And Screenshots",
    "",
    table(
      ["Item", "Category", "Version", "Image", "Size", "Local image", "Archive.org image URL"],
      archiveOrgImageRows(`${generatedRoot}/sources/archiveorg-aol-aim-software.md`),
    ),
  ].join("\n"),
);

const historicalSourceRows = [
  [
    "FreeProgz",
    "Wayback AOL prog hub",
    "Early-2000s AOL/AIM prog portal with sections, links, and downloads. Useful for vocabulary, categories, old download paths, and link-directory leads.",
    "https://web.archive.org/web/20010516214202/http://www.freeprogz.com/",
  ],
  [
    "Oogle / Rampage",
    "AIM and tool author/source lead",
    "Oogle pages and the Rampage Toolz material are useful for correcting authorship, preserving Rampage Toolz source/tutorial leads, and separating Oogle-made tools from unrelated catalog entries.",
    "https://web.archive.org/web/20001205033300/http://www.oogle.net/o_tutorial.htm",
  ],
  [
    "LensHellArchive",
    "categorized prog archive",
    "One of the strongest category sources: antis, busters, C-Coms, crackers, faders, idlers, mailers/servers, punters, termers, X'ers, AIM tools, runtime files, and descriptions.",
    "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/Index.html",
  ],
  [
    "RiceJerry / LoLToolz",
    "old link directory and prog pages",
    "Useful for old scene links, AIM prog listings, direct download names, and leads that can be checked against the local archive.",
    "https://web.archive.org/web/20010223212351/http://www.8op.com:80/ricejerry/links.html",
  ],
  [
    "Methodus2000",
    "prog pages and screenshots",
    "Important for Methodus Toolz pages, screenshots, versions, and related download/source references.",
    "https://web.archive.org/web/20010111011900/http://www.methodus2000.com:80/methodustoolz/netbus.htm",
  ],
  [
    "ProgzRescue",
    "Wayback recovery URL lists",
    "Large recovered URL lists that feed mirror grouping, missing-candidate detection, and external-file recovery.",
    "https://github.com/raysuelzer/ProgzRescue",
  ],
  [
    "Internet Archive AOL/AIM software",
    "versioned client/download source",
    "AOL, AOL Gold, AOL Desktop Gold, AIM, DeadAIM, and Winamp-skin software records with file sizes, source URLs, preview images, and local import candidates.",
    "https://archive.org/search?query=aol&and%5B%5D=mediatype%3A%22software%22",
  ],
  [
    "AM.NET AOL tools directory",
    "client/runtime directory",
    "AOL/AIM installers, utilities, and support files are tracked separately so client installers and runtimes do not get mixed into authored prog pages.",
    "https://am.net/lib/TOOLS/AOL/",
  ],
  [
    "DeadAIM / jdennis.net",
    "AIM enhancement lead",
    "DeadAIM is tracked as an AIM enhancer rather than a classic AOL punter/prog category.",
    "https://web.archive.org/web/20031206092015/http://www.jdennis.net/DeadAIM/about.php",
  ],
  [
    "AIMFilez",
    "AIM files and missing runtimes",
    "AIM-focused file pages and missing DLL/OCX support files help fill client and runtime gaps.",
    "https://web.archive.org/web/20040405183602/http://aimfilez.com/?id=files1",
  ],
  [
    "ColtPro",
    "runtime/support files",
    "ColtPro missing-files pages preserve common Visual Basic runtime dependencies used by many old Windows progs.",
    "https://web.archive.org/web/20010923065731/http://www.coltpro.net/",
  ],
];

writeDoc(
  `${generatedRoot}/sources/historical-context.md`,
  [
    "# Historical Source Context",
    "",
    "These notes explain why major old-school links are in the archive and what kind of evidence they are useful for: screenshots, original download URLs, author clues, categories, AOL/AIM versions, runtime dependencies, or missing-program leads.",
    "",
    table(["Source", "Role", "Why it matters", "URL"], historicalSourceRows.map((row) => [row[0], row[1], row[2], link(row[3], row[3])])),
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

const originalDownloads = originalDownloadRecords();
writeDoc(
  `${generatedRoot}/sources/original-download-urls.md`,
  [
    "# Original Download URLs",
    "",
    `Deduplicated original and Wayback download URLs collected from catalog references, old source pages, external recovery lists, missing-candidate mirrors, and matched per-program evidence. Current unique URL count: **${originalDownloads.length}**.`,
    "",
    table(
      ["Name", "Kind", "Status", "Host", "Source", "Local file", "Program page", "URL"],
      originalDownloads.map((item) => [
        item.name || fileStem(item.url),
        item.kind || "",
        item.status || "",
        urlHost(item.url),
        item.source || "",
        item.localPath ? localLink(`${generatedRoot}/sources/original-download-urls.md`, item.localPath, item.localPath) : "",
        item.detailPage ? localLink(`${generatedRoot}/sources/original-download-urls.md`, "open", item.detailPage) : "",
        link(item.url, item.url),
      ]),
    ),
  ].join("\n"),
);

const recoveredFiles = recoveredFileRecords();
writeDoc(
  `${generatedRoot}/sources/recovered-files.md`,
  [
    "# Recovered Files",
    "",
    `All local files currently represented in the GitHub archive: main catalog archives, recovered external downloads, recovered AOL/AIM utilities, DLL/OCX runtime files, and mirrored web images. Current local record count: **${recoveredFiles.length}**.`,
    "",
    table(
      ["Kind", "Name", "Status", "Size", "SHA1", "Local file", "Source", "Original URL", "Wayback/download URL", "Program page"],
      recoveredFiles.map((item) => [
        item.kind,
        item.name,
        item.status,
        item.size,
        item.sha1,
        item.localPath ? localLink(`${generatedRoot}/sources/recovered-files.md`, item.localPath, item.localPath) : "",
        item.source,
        item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
        item.waybackUrl ? link(item.waybackUrl, item.waybackUrl) : "",
        item.detailPage ? localLink(`${generatedRoot}/sources/recovered-files.md`, "open", item.detailPage) : "",
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

function externalDownloadTable(fromDoc, items) {
  return table(
    [
      "File",
      "Kind",
      "Inferred version",
      "Label/context",
      "Source",
      "Status",
      "Size",
      "SHA1",
      "Local file",
      "Original URL",
      "Wayback/download URL",
    ],
    items.map((item) => [
      item.name || fileStem(item.originalUrl || item.waybackUrl),
      runtimeDownloadKind(item),
      inferredClientVersion(item),
      item.discoveredText || "",
      item.sourceList || "",
      item.status || "unknown",
      formatBytes(item.size),
      item.sha1 || "",
      item.localPath ? localLink(fromDoc, item.localPath, item.localPath) : "not recovered",
      item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
      item.waybackUrl || item.downloadUrl ? link(item.waybackUrl || item.downloadUrl, item.waybackUrl || item.downloadUrl) : "",
    ]),
  );
}

const runtimeDownloads = (externalDownloads.downloads || []).filter(isRuntimeDownload);
writeDoc(
  `${generatedRoot}/sources/runtime-files.md`,
  [
    "# DLL/OCX Runtime Files",
    "",
    "Recovered or attempted Visual Basic and Windows support files such as DLL, OCX, and VB runtime dependencies. These are tracked as support files, not authored progs.",
    "",
    externalDownloadTable(`${generatedRoot}/sources/runtime-files.md`, runtimeDownloads),
  ].join("\n"),
);

const aimEnhancerDownloads = (externalDownloads.downloads || []).filter(isDeadAimOrAimEnhancer);
writeDoc(
  `${generatedRoot}/sources/deadaim-aim-enhancers.md`,
  [
    "# DeadAIM And AIM Enhancers",
    "",
    "AIM-specific utilities and enhancers, including DeadAIM-related leads where recovered or attempted. These are separated from AOL-era punters/progs so AIM client add-ons can be researched cleanly.",
    "",
    externalDownloadTable(`${generatedRoot}/sources/deadaim-aim-enhancers.md`, aimEnhancerDownloads),
  ].join("\n"),
);

const aolUtilityDownloads = (externalDownloads.downloads || []).filter(isAolUtilityDownload);
writeDoc(
  `${generatedRoot}/sources/aol-utilities.md`,
  [
    "# AOL Utilities And Client Installers",
    "",
    "AOL client installers and AOL-specific utilities such as Format SN, Master AOL, AOL file downloaders, and related versioned files. These are tracked separately from individual authored progs.",
    "",
    externalDownloadTable(`${generatedRoot}/sources/aol-utilities.md`, aolUtilityDownloads),
  ].join("\n"),
);

const winampSkinDownloads = (externalDownloads.downloads || []).filter(isWinampSkinDownload);
writeDoc(
  `${generatedRoot}/sources/winamp-skins.md`,
  [
    "# Winamp Skins And Media Extras",
    "",
    "AOL/AIM-adjacent Winamp skins and media extras found during Archive.org and old-web recovery. These are kept apart from progs because they are companion customization files rather than AOL client tools.",
    "",
    externalDownloadTable(`${generatedRoot}/sources/winamp-skins.md`, winampSkinDownloads),
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

const readyMissingRows = (missingCandidates.candidates || [])
  .filter((candidate) => (candidate.readyCount || candidate.readyLocalFiles?.length || 0) > 0)
  .sort((a, b) => (b.readyCount || b.readyLocalFiles?.length || 0) - (a.readyCount || a.readyLocalFiles?.length || 0))
  .map((candidate) => [
    candidate.key || candidate.fileName || "unknown",
    candidate.fileName || "",
    candidate.category || "unknown",
    String(candidate.mirrorCount || candidate.mirrors?.length || 0),
    String(candidate.readyCount || candidate.readyLocalFiles?.length || 0),
    (candidate.readyLocalFiles || []).map((file) => localLink(`${generatedRoot}/sources/missing-ready.md`, file, file)).join("<br>"),
    candidate.externalTextAuthors?.slice(0, 4).join("<br>") || "",
    candidate.externalTextVersions?.slice(0, 4).join("<br>") || "",
    candidate.externalTextPurposeSignals?.slice(0, 5).join("<br>") || "",
    (candidate.externalTextUrls || []).map((url) => link(url, url)).slice(0, 4).join("<br>") || "",
  ]);

writeDoc(
  `${generatedRoot}/sources/missing-ready.md`,
  [
    "# Recovered Missing Candidates",
    "",
    "These are old-web candidate files that were not cleanly matched to a main catalog entry but do have at least one recovered local mirror.",
    "",
    table(
      ["Key", "Filename", "Category", "Mirrors", "Ready files", "Ready local files", "Text author clues", "Text version clues", "Text purpose clues", "URLs found inside"],
      readyMissingRows,
    ),
  ].join("\n"),
);

const deadLeadRows = (externalDownloads.downloads || [])
  .filter(isDeadOrFalseLead)
  .sort((a, b) => (a.status || "").localeCompare(b.status || "") || (a.name || "").localeCompare(b.name || ""))
  .map((item) => [
    item.name || fileStem(item.originalUrl || item.waybackUrl),
    item.status || "unknown",
    item.sourceList || "",
    item.discoveredText || "",
    item.dedupeNote || "",
    item.originalUrl ? link(item.originalUrl, item.originalUrl) : "",
    item.waybackUrl || item.downloadUrl ? link(item.waybackUrl || item.downloadUrl, item.waybackUrl || item.downloadUrl) : "",
  ]);

writeDoc(
  `${generatedRoot}/sources/dead-or-not-recovered-leads.md`,
  [
    "# Dead Or Not Recovered Leads",
    "",
    "These attempted external download leads did not produce a usable local file during the latest recovery run. Statuses such as `http-404`, `html-replay`, `invalid-archive`, and `out-of-scope` are kept so the same dead leads are not repeatedly mistaken for recovered files.",
    "",
    table(["File", "Status", "Source", "Label/context", "Note", "Original URL", "Wayback/download URL"], deadLeadRows),
  ].join("\n"),
);

const programSourceLeadRows = programs
  .map((program) => {
    const enrichment = enrichmentFor(program);
    const embedded = uniqueBy(urlIndex.perProgram?.[program.id]?.urls || [], (item) => item.url);
    return {
      program,
      enrichment,
      embedded,
      count:
        (enrichment.webDownloadLinks?.length || 0) +
        (enrichment.mirrorLinks?.length || 0) +
        (enrichment.webMentions?.length || 0) +
        embedded.length,
    };
  })
  .filter((item) => item.count > 0)
  .map(({ program, enrichment, embedded }) => [
    localLink(`${generatedRoot}/sources/program-source-leads.md`, displayName(program), appDocPaths.get(program.id)),
    program.name,
    enrichment.webMentions?.map((item) => item.sourceName || item.label).slice(0, 6).join("<br>") || "",
    enrichment.webDownloadLinks?.map((item) => item.sourceName || item.label).slice(0, 6).join("<br>") || "",
    enrichment.mirrorLinks?.map((item) => `${item.status || "lead"}: ${item.sourceName || item.label || "mirror"}`).slice(0, 6).join("<br>") || "",
    embedded.map((item) => link(item.url, item.url)).slice(0, 5).join("<br>") || "",
  ]);

writeDoc(
  `${generatedRoot}/sources/program-source-leads.md`,
  [
    "# Old-School Links By Program",
    "",
    "Per-program map of source mentions, old download pages, mirror leads, and embedded URLs found inside readable archive text.",
    "",
    table(["Program", "Catalog label", "Source mentions", "Old-web download sources", "Mirror lead sources/status", "Embedded URLs"], programSourceLeadRows),
  ].join("\n"),
);

progress("plain exports");
const programExports = programs.map(programExportRecord);
const programExportHeaders = [
  "index",
  "id",
  "bestName",
  "catalogLabel",
  "archiveFilename",
  "fileSize",
  "progType",
  "category",
  "platform",
  "aolVersion",
  "author",
  "authorConfidence",
  "categoryConfidence",
  "versionConfidence",
  "sourceConfidence",
  "localFile",
  "referenceUrl",
  "rawSourceUrl",
  "oldWebDownloadLinks",
  "mirrorLeads",
  "webResearchMentions",
  "screenshots",
  "embeddedUrls",
  "reviewPriority",
  "reviewScore",
  "manualReviewFlags",
  "nextResearchAction",
  "tags",
  "detailPage",
];
writeJson(`${generatedRoot}/exports/catalog.json`, programExports);
writeCsv(
  `${generatedRoot}/exports/catalog.csv`,
  programExportHeaders,
  programExports.map((item) => programExportHeaders.map((field) => item[field])),
);

const recoveredExportHeaders = ["kind", "name", "status", "size", "bytes", "sha1", "localPath", "source", "originalUrl", "waybackUrl", "detailPage"];
writeJson(`${generatedRoot}/exports/recovered-files.json`, recoveredFiles);
writeCsv(
  `${generatedRoot}/exports/recovered-files.csv`,
  recoveredExportHeaders,
  recoveredFiles.map((item) => recoveredExportHeaders.map((field) => item[field])),
);

const originalUrlExportHeaders = ["name", "kind", "status", "source", "url", "localPath", "detailPage"];
writeJson(`${generatedRoot}/exports/original-download-urls.json`, originalDownloads);
writeCsv(
  `${generatedRoot}/exports/original-download-urls.csv`,
  originalUrlExportHeaders,
  originalDownloads.map((item) => originalUrlExportHeaders.map((field) => item[field])),
);

writeDoc(
  `${generatedRoot}/exports/README.md`,
  [
    "# Plain Data Exports",
    "",
    "Plain CSV and JSON files for sorting, filtering, importing into spreadsheets, or rebuilding a later website view.",
    "",
    table(
      ["Export", "Rows", "CSV", "JSON"],
      [
        [
          "Main catalog with confidence fields",
          String(programExports.length),
          localLink(`${generatedRoot}/exports/README.md`, "catalog.csv", `${generatedRoot}/exports/catalog.csv`),
          localLink(`${generatedRoot}/exports/README.md`, "catalog.json", `${generatedRoot}/exports/catalog.json`),
        ],
        [
          "Recovered local files",
          String(recoveredFiles.length),
          localLink(`${generatedRoot}/exports/README.md`, "recovered-files.csv", `${generatedRoot}/exports/recovered-files.csv`),
          localLink(`${generatedRoot}/exports/README.md`, "recovered-files.json", `${generatedRoot}/exports/recovered-files.json`),
        ],
        [
          "Deduped original/download URLs",
          String(originalDownloads.length),
          localLink(`${generatedRoot}/exports/README.md`, "original-download-urls.csv", `${generatedRoot}/exports/original-download-urls.csv`),
          localLink(`${generatedRoot}/exports/README.md`, "original-download-urls.json", `${generatedRoot}/exports/original-download-urls.json`),
        ],
      ],
    ),
  ].join("\n"),
);

const screenshotPrograms = programs.filter((program) => program.screenshotCount > 0);
const readyWebAssets = (webAssets.assets || []).filter((asset) => asset.status === "ready" && asset.localPath);
const webAssetRows = (webAssets.assets || []).map((asset) => [
  asset.localPath ? `![${md(asset.text || "web asset")}](${relLink(`${generatedRoot}/screenshots/web-images.md`, asset.localPath)})` : "",
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
const repoWorkingTreeSize = directorySize(".", { exclude: [".git"] });
const gitObjectStoreSize = directorySize(".git");
const filesDirectorySize = directorySize("files");
const assetsDirectorySize = directorySize("assets");
const docsDirectorySize = directorySize("docs");
const dataDirectorySize = directorySize("data");

writeDoc(
  `${generatedRoot}/screenshots/web-images.md`,
  [
    "# Web Image Attempts",
    "",
    "Ready local images include a small Markdown preview so the GitHub page is useful as a visual contact sheet.",
    "",
    table(["Preview", "Text", "Status", "Local path", "Source page", "URL", "Original URL"], webAssetRows),
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
        ["GitHub working-tree size", formatBytes(repoWorkingTreeSize)],
        ["Git object store size", formatBytes(gitObjectStoreSize)],
        ["files/ directory size", formatBytes(filesDirectorySize)],
        ["assets/ directory size", formatBytes(assetsDirectorySize)],
        ["docs/ directory size", formatBytes(docsDirectorySize)],
        ["data/ directory size", formatBytes(dataDirectorySize)],
        ["Crawled source pages", String(webResources.pageCount || webResources.pages?.length || 0)],
        ["Crawled links", String(webResources.linkCount || 0)],
        ["Crawled download links", String(webResources.downloadCount || 0)],
        ["Recovered external files", String(externalDownloads.readyCount || 0)],
        ["Local recovered file records", String(recoveredFiles.length)],
        ["External ZIPs scanned for text", String(externalArchiveText.scannedCount || 0)],
        ["External ZIPs with readable text", String(externalArchiveText.withTextFileCount || 0)],
        ["External ZIPs with author clues", String(externalArchiveText.withAuthorCount || 0)],
        ["External ZIPs with version clues", String(externalArchiveText.withVersionCount || 0)],
        ["External ZIPs with purpose clues", String(externalArchiveText.withPurposeCount || 0)],
        ["Missing candidates", String(missingCandidates.candidateCount || missingCandidates.candidates?.length || 0)],
        ["Recovered missing candidates", String(missingCandidates.readyCandidateCount || 0)],
        ["Master deduped link index", String(masterLinks.length)],
        ["Deduped original/download URLs", String(originalDownloads.length)],
        ["Programs needing manual review", String(manualReviewRows.length)],
        ["High-priority review entries", String(programs.filter((program) => reviewProfile(program).score >= 8).length)],
        ["Medium-priority review entries", String(programs.filter((program) => reviewProfile(program).score >= 4 && reviewProfile(program).score < 8).length)],
        ["Low-priority coverage-gap entries", String(programs.filter((program) => reviewProfile(program).score > 0 && reviewProfile(program).score < 4).length)],
        ["Runtime DLL/OCX leads", String(runtimeDownloads.length)],
        ["DeadAIM/AIM enhancer leads", String(aimEnhancerDownloads.length)],
        ["AOL utility/client leads", String(aolUtilityDownloads.length)],
        ["Winamp skin/media leads", String(winampSkinDownloads.length)],
        ["Archive.org AOL/AIM software items", String(archiveOrgSoftware.itemCount || archiveOrgSoftware.items?.length || 0)],
        ["Archive.org import candidates", String(archiveOrgSoftware.importCandidateCount || 0)],
        ["Archive.org import candidate size", archiveOrgSoftware.importCandidateSizeLabel || formatBytes(archiveOrgSoftware.importCandidateBytes)],
        ["Archive.org preview images", String(archiveOrgSoftware.imageCount || 0)],
        ["Archive.org local preview images", String(archiveOrgSoftware.localImageCount || 0)],
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
    "",
    "## Category Map",
    "",
    "Broad archive categories used by the generated catalog.",
    "",
    table(["Category", "Count", "Meaning"], categoryRows.map((row) => [row[0], row[1], row[2]])),
    "",
    "## Prog Type Map",
    "",
    "More specific inferred functions used for browsing and review.",
    "",
    table(["Prog type", "Count"], typeRows.map((row) => [row[0], row[1]])),
  ].join("\n"),
);

console.log(`Generated GitHub docs for ${programs.length} applications in ${generatedRoot}`);
