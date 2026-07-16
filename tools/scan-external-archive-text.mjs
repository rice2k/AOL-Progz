import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const downloadsPath = path.join(rootDir, "data", "external-downloads.json");
const outJson = path.join(rootDir, "data", "external-archive-text.json");
const outJs = path.join(rootDir, "data", "external-archive-text.js");
const scanLimit = Number(process.env.AOL_EXTERNAL_TEXT_LIMIT || 0);
const timeoutMs = Number(process.env.AOL_EXTERNAL_TEXT_TIMEOUT_MS || 9000);
const maxEntries = Number(process.env.AOL_EXTERNAL_TEXT_MAX_ENTRIES || 48);
const maxBuffer = 1024 * 1024 * 4;

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, "utf8"));
}

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
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

function slugKey(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[_\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
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

function listArchiveEntries(archivePath) {
  const result = spawnSync("tar", ["-tf", archivePath], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer,
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
  if (/\.(exe|dll|ocx|vbx|bin|com|scr|pif|msi|cab|wav|mp3|mid|bmp|gif|jpe?g|png|ico|ani|cur)$/i.test(lower)) {
    return false;
  }
  if (/(readme|read\s*me|site|url|link|home|web|author|about|install|license|credits?|contact|info|nfo|diz|version|history|changes?|faq)/i.test(lower)) {
    return true;
  }
  return /\.(txt|text|nfo|diz|url|ini|cfg|log|md|rtf|htm|html|bas|frm|vbp|cls|ctl|pag|asp|php|js|css)$/i.test(lower);
}

function extractArchiveEntry(archivePath, entry) {
  const result = spawnSync("tar", ["-xOf", archivePath, entry], {
    encoding: "buffer",
    timeout: timeoutMs,
    maxBuffer,
  });
  if (result.status !== 0 || result.error) return "";
  try {
    return new TextDecoder("windows-1252").decode(result.stdout || Buffer.alloc(0));
  } catch {
    return String(result.stdout || "");
  }
}

function cleanCandidateName(value) {
  let text = clean(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/^name\s*=\s*/i, "")
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/\([^)]*(?:http|www|email|e-mail)[^)]*\)/gi, " ")
    .replace(/\b(?:e-?mail|mail|homepage|website|site|url|contact)\b\s*:.*$/i, " ")
    .replace(/\b(?:http|https|ftp):\/\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(/[<>{}[\]|\\]+/g, " ")
    .replace(/^[-=:+*#~\s]+|[-=:+*#~.\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  text = text.replace(/\s+(?:presents?|production|productions|software|toolz?|progz?)$/i, "").trim();
  if (!text || text.length < 2 || text.length > 60) return "";
  if (/@/.test(text) || /\.(com|net|org|edu|html?|zip|exe)\b/i.test(text)) return "";
  if (/^(rar|zip|7z|ace|arj|lzh|exe|dll|ocx|vbx|archive|file)$/i.test(text)) return "";
  if (/[.!?].+\b[A-Z0-9]/.test(text)) return "";
  if (/\b(?:unknown|none|n\/a|readme|downloaded|download|install|setup|license|thanks|please|visit|click|program|proggie|aol|aim|authorize|webpage|web\s*page|homepage|if|was|were|about)\b/i.test(text)) {
    return "";
  }
  if (/^(?:default|true|false|null|nothing|warning|error|version|private|public|function|sub|object|value|property)$/i.test(text)) {
    return "";
  }
  if (/^(?:calling|pressing|returns?|sets?|used|using|copy|open|close|insert|delete|select|clicking)\b/i.test(text)) {
    return "";
  }
  if (/\b(?:addfilteritem|msgbox|err\.|attribute|vb_description|copyright|reserved|license agreement)\b/i.test(text)) {
    return "";
  }
  if (/^(by|from|author|creator|coded|written|made)$/i.test(text)) return "";
  return text;
}

function addAuthorCandidate(candidates, name, sourceFile, pattern) {
  const cleaned = cleanCandidateName(name);
  if (!cleaned) return;
  const key = slugKey(cleaned);
  if (!key || candidates.some((item) => slugKey(item.name) === key)) return;
  candidates.push({ name: cleaned, sourceFile, pattern });
}

function extractAuthorCandidates(text, sourceFile) {
  const candidates = [];
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((line) => clean(stripHtml(line)))
    .filter(Boolean)
    .slice(0, 650);

  for (const line of lines) {
    let match = line.match(/^(?:from|authors?|creators?|coder|owner)\s*:?\s*(.{2,80})$/i);
    if (match) addAuthorCandidate(candidates, match[1], sourceFile, match[0].split(":")[0].toLowerCase());

    match = line.match(/^(?:created|coded|programmed|written|made|compiled|designed)\s+by\s*:?\s*(.{2,80})$/i);
    if (match) addAuthorCandidate(candidates, match[1], sourceFile, "byline");

    match = line.match(/^(?:code|prog|program|tool|toolz|proggy|archive|zip)\s+by\s*:?\s*(.{2,80})$/i);
    if (match) addAuthorCandidate(candidates, match[1], sourceFile, "program by");

    match = line.match(/\bby\s+([a-z0-9][a-z0-9_ .'-]{2,50})$/i);
    if (match) addAuthorCandidate(candidates, match[1], sourceFile, "trailing by");
  }

  return candidates;
}

function extractAolAimVersions(text) {
  const versions = new Set();
  const source = String(text || "");
  for (const match of source.matchAll(/\bAOL\s*(?:version\s*)?(?:v(?:er(?:sion)?)?\.?\s*)?(\d+(?:\.\d+)?)(?:\s*(?:-|\/|,|and)\s*(\d+(?:\.\d+)?))?/gi)) {
    versions.add(`AOL ${match[1]}`);
    if (match[2]) versions.add(`AOL ${match[2]}`);
  }
  for (const match of source.matchAll(/\bAmerica\s+Online\s*(\d+(?:\.\d+)?)/gi)) {
    versions.add(`AOL ${match[1]}`);
  }
  for (const match of source.matchAll(/\bAIM\s*(?:version\s*)?(?:v(?:er(?:sion)?)?\.?\s*)?(\d+(?:\.\d+)?)(?:\s*(?:-|\/|,|and)\s*(\d+(?:\.\d+)?))?/gi)) {
    versions.add(`AIM ${match[1]}`);
    if (match[2]) versions.add(`AIM ${match[2]}`);
  }
  return [...versions].slice(0, 14);
}

const purposePatterns = [
  ["All-in-one prog suite", /\b(aohell|hell|toolz|tools|suite|multi[-\s]?tool|all[-\s]?in[-\s]?one|proggy|progz)\b/i],
  ["Fader / text styler", /\b(fader|fade|phader|rainbow|color(?:ed)?\s+text|font|text\s+effect|gradient)\b/i],
  ["Idler / AFK bot", /\b(idler|idle|afk|away|auto[-\s]?reply|autoreply|keep\s+online)\b/i],
  ["Room buster", /\b(room[-\s]?buster|room[-\s]?bust|bust\s+room|full\s+room)\b/i],
  ["Punter / booter", /\b(punter|punt|booter|boot|nuke|disconnect|knock\s+off(?:line)?)\b/i],
  ["C-Com / command list", /\b(c[-\s]?com|ccom|commands?|command\s+list|canned\s+commands?)\b/i],
  ["Scroller / macro", /\b(scroller|scroll|macro|ascii|banner|repeat(?:ed)?\s+text|flooder)\b/i],
  ["Linker / chat linker", /\b(linker|chat\s+link|link\s+tool|url\s+tool)\b/i],
  ["Mass mailer / server", /\b(mmer|mass[-\s]?mail|mailer|mail[-\s]?bomb|server|file\s+server|email\s+server)\b/i],
  ["Account / TOS utility", /\b(phisher|phish|fish|password|pass(?:word)?\s+crack|cracker|crack|termer|term(?:er)?|tos|account)\b/i],
  ["Screen-name utility", /\b(screen[-\s]?name|screenname|sn\s*(?:checker|maker|scanner|tool)|name\s+checker)\b/i],
  ["Source / developer file", /\b(source\s+code|visual\s+basic|\bvb\b|module|class|control|ocx|dll|api\s+spy|sdk|scripting)\b/i],
  ["Media / file utility", /\b(mp3|wav|sound|player|file\s+tool|download(?:er)?|image|picture)\b/i],
  ["AOL/AIM chat utility", /\b(chat|instant\s+message|\bim\b|aim|buddy|profile|room)\b/i],
];

function extractPurposeSignals(text) {
  const source = String(text || "");
  const found = [];
  for (const [label, pattern] of purposePatterns) {
    if (pattern.test(source)) found.push(label);
  }
  return found;
}

function extractUrls(text) {
  const seen = new Set();
  const urls = [];
  for (const match of String(text || "").matchAll(/\b(?:https?|ftp):\/\/[^\s<>"')\]]+|(?:^|[\s(])www\.[^\s<>"')\]]+/gi)) {
    let url = match[0].trim().replace(/^[\s(]+/, "").replace(/[.,;:!?]+$/g, "");
    if (/^www\./i.test(url)) url = `http://${url}`;
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes(".") || parsed.hostname.length < 4) continue;
    } catch {
      continue;
    }
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(url);
  }
  return urls.slice(0, 30);
}

function extractDescriptionCandidates(text, sourceFile) {
  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split(/\n/)
    .map((line) => stripHtml(line))
    .filter((line) => line.length >= 28 && line.length <= 220)
    .filter((line) => !/^[-=*_#~ ]+$/.test(line))
    .filter((line) => !/\b(?:serial|registration\s+code|password\s*:|pass\s*:|crack\s+instructions)\b/i.test(line))
    .slice(0, 800);

  const candidates = [];
  for (const line of lines) {
    if (
      /\b(?:this\s+(?:program|prog|tool|utility)|features?|version|works?\s+(?:with|on)|for\s+(?:aol|aim)|created\s+for|allows?\s+you|used\s+to|description)\b/i.test(
        line,
      )
    ) {
      const cleaned = clean(line).slice(0, 220);
      if (cleaned && !candidates.some((item) => item.text.toLowerCase() === cleaned.toLowerCase())) {
        candidates.push({ sourceFile, text: cleaned });
      }
    }
  }
  return candidates.slice(0, 8);
}

function choosePreferredAuthor(candidates) {
  if (!candidates.length) return "";
  const priority = ["author", "creator", "coder", "owner", "from", "byline", "program by", "trailing by"];
  return [...candidates].sort((a, b) => {
    const aScore = priority.indexOf(a.pattern);
    const bScore = priority.indexOf(b.pattern);
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  })[0].name;
}

function scanDownload(item) {
  const localRelative = item.localPath || "";
  const localPath = localRelative ? path.join(rootDir, localRelative) : "";
  if (!localPath || !existsSync(localPath)) {
    return { scanned: false, reason: "no-local-file", localPath: localRelative };
  }
  if (!/\.(zip|jar)$/i.test(localPath)) {
    return { scanned: false, reason: "unsupported-archive-type", localPath: localRelative };
  }

  const entries = listArchiveEntries(localPath).filter(isTextLikeEntry).slice(0, maxEntries);
  const authorCandidates = [];
  const purposeSignals = new Set();
  const versionMentions = new Set();
  const urls = new Set();
  const descriptionCandidates = [];
  const textFiles = [];

  for (const entry of entries) {
    const text = extractArchiveEntry(localPath, entry);
    if (!text.trim()) continue;
    textFiles.push(entry);
    const authors = extractAuthorCandidates(text, entry);
    for (const candidate of authors) addAuthorCandidate(authorCandidates, candidate.name, candidate.sourceFile, candidate.pattern);
    for (const version of extractAolAimVersions(text)) versionMentions.add(version);
    for (const signal of extractPurposeSignals(text)) purposeSignals.add(signal);
    for (const url of extractUrls(text)) urls.add(url);
    for (const description of extractDescriptionCandidates(text, entry)) {
      if (!descriptionCandidates.some((item) => item.text.toLowerCase() === description.text.toLowerCase())) {
        descriptionCandidates.push(description);
      }
    }
  }

  return {
    scanned: true,
    localPath: localRelative,
    localSize: statSync(localPath).size,
    localSizeLabel: formatBytes(statSync(localPath).size),
    textFileCount: textFiles.length,
    textFiles: textFiles.slice(0, 30),
    authorCandidates,
    preferredAuthor: choosePreferredAuthor(authorCandidates),
    purposeSignals: [...purposeSignals].slice(0, 20),
    versionMentions: [...versionMentions].slice(0, 16),
    urls: [...urls].slice(0, 30),
    descriptionCandidates: descriptionCandidates.slice(0, 8),
  };
}

function main() {
  const external = readJson(downloadsPath, { downloads: [] });
  const downloads = external.downloads || [];
  const byLocalPath = {};
  const records = [];
  let scannedThisRun = 0;

  for (const item of downloads) {
    if (item.status !== "ready" || !item.localPath) continue;
    if (scanLimit && scannedThisRun >= scanLimit) break;
    const scan = scanDownload(item);
    if (scan.scanned) scannedThisRun += 1;
    const record = {
      name: item.name || path.posix.basename(item.localPath),
      sourceList: item.sourceList || "",
      originalUrl: item.originalUrl || "",
      waybackUrl: item.waybackUrl || "",
      discoveredText: item.discoveredText || "",
      status: item.status || "",
      ...scan,
    };
    records.push(record);
    if (record.localPath) byLocalPath[record.localPath] = record;
  }

  const scanned = records.filter((item) => item.scanned);
  const data = {
    generatedAt: new Date().toISOString(),
    readyDownloadCount: downloads.filter((item) => item.status === "ready").length,
    recordCount: records.length,
    scannedCount: scanned.length,
    withTextFileCount: scanned.filter((item) => item.textFileCount > 0).length,
    withAuthorCount: scanned.filter((item) => item.preferredAuthor).length,
    withPurposeCount: scanned.filter((item) => item.purposeSignals?.length).length,
    withVersionCount: scanned.filter((item) => item.versionMentions?.length).length,
    withUrlCount: scanned.filter((item) => item.urls?.length).length,
    byLocalPath,
    records,
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(outJs, `window.AOL_PROGZ_EXTERNAL_ARCHIVE_TEXT = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(
    `External archive text: ${data.withTextFileCount}/${data.scannedCount} ZIPs had readable text; authors ${data.withAuthorCount}, purpose clues ${data.withPurposeCount}, version clues ${data.withVersionCount}.`,
  );
}

main();
