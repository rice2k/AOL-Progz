import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const catalogPath = path.join(rootDir, "data", "catalog.js");
const outJson = path.join(rootDir, "data", "archive-text-metadata.json");
const outJs = path.join(rootDir, "data", "archive-text-metadata.js");
const scanLimit = Number(process.env.AOL_ARCHIVE_TEXT_LIMIT || 0);
const timeoutMs = Number(process.env.AOL_ARCHIVE_TEXT_TIMEOUT_MS || 7000);
const maxEntries = Number(process.env.AOL_ARCHIVE_TEXT_MAX_ENTRIES || 36);
const maxBuffer = 1024 * 1024 * 3;

function readCatalog() {
  const text = readFileSync(catalogPath, "utf8")
    .replace(/^window\.AOL_PROGZ_DATA\s*=\s*/, "")
    .replace(/;\s*$/, "");
  return JSON.parse(text);
}

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
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
  if (/\.(exe|dll|ocx|vbx|bin|com|scr|pif|bat|cmd|msi|cab|wav|mp3|mid|bmp|gif|jpe?g|png|ico)$/i.test(lower)) {
    return false;
  }
  if (/(readme|site|url|link|home|web|author|about|install|license|credits?|contact|info|nfo|diz)/.test(lower)) {
    return true;
  }
  return /\.(txt|text|nfo|diz|url|ini|cfg|log|md|htm|html|bas|frm|vbp|cls|ctl|pag|asp)$/i.test(lower);
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
    .replace(/^['"`\s]*s\s*:\s*/i, "")
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
  if (/\b(?:unknown|none|n\/a|readme|downloaded|download|install|setup|license|thanks|please|visit|click|program|proggie|aol|authorize|webpage|web\s*page|homepage|if|was|were|about)\b/i.test(text)) {
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
    .map((line) => clean(line))
    .filter(Boolean)
    .slice(0, 500);

  for (const line of lines) {
    let match = line.match(/^(?:from|authors?|creators?)\s*:?\s*(.{2,80})$/i);
    if (match) addAuthorCandidate(candidates, match[1], sourceFile, match[0].split(":")[0].toLowerCase());

    match = line.match(/^(?:created|coded|programmed|written|made|compiled|designed)\s+by\s*:?\s*(.{2,80})$/i);
    if (match) addAuthorCandidate(candidates, match[1], sourceFile, "byline");

    match = line.match(/^(?:code|prog|program|tool|toolz|proggy)\s+by\s*:?\s*(.{2,80})$/i);
    if (match) addAuthorCandidate(candidates, match[1], sourceFile, "program by");
  }

  return candidates;
}

function extractAolVersions(text) {
  const versions = new Set();
  const source = String(text || "");
  for (const match of source.matchAll(/\bAOL\s*(?:version\s*)?(?:v(?:er(?:sion)?)?\.?\s*)?(\d+(?:\.\d+)?)(?:\s*(?:-|\/|,|and)\s*(\d+(?:\.\d+)?))?/gi)) {
    versions.add(`AOL ${match[1]}`);
    if (match[2]) versions.add(`AOL ${match[2]}`);
  }
  for (const match of source.matchAll(/\bAmerica\s+Online\s*(\d+(?:\.\d+)?)/gi)) {
    versions.add(`AOL ${match[1]}`);
  }
  return [...versions].slice(0, 10);
}

const purposePatterns = [
  ["All-in-one prog suite", /\b(aohell|hell|toolz|tools|suite|multi[-\s]?tool|all[-\s]?in[-\s]?one|proggy|progz)\b/i],
  ["Fader / text styler", /\b(fader|fade|phader|rainbow|color(?:ed)?\s+text|font|text\s+effect)\b/i],
  ["Idler / AFK bot", /\b(idler|idle|afk|away|auto[-\s]?reply|autoreply|keep\s+online)\b/i],
  ["Room buster", /\b(room[-\s]?buster|room[-\s]?bust|bust\s+room|full\s+room)\b/i],
  ["Punter / booter", /\b(punter|punt|booter|boot|nuke|disconnect|knock\s+off(?:line)?)\b/i],
  ["C-Com / command list", /\b(c[-\s]?com|ccom|commands?|command\s+list|canned\s+commands?)\b/i],
  ["Scroller / macro", /\b(scroller|scroll|macro|ascii|banner|repeat(?:ed)?\s+text)\b/i],
  ["Linker / chat linker", /\b(linker|chat\s+link|link\s+tool|url\s+tool)\b/i],
  ["Mass mailer / server", /\b(mmer|mass[-\s]?mail|mailer|mail[-\s]?bomb|server|file\s+server|email\s+server)\b/i],
  ["Account / TOS utility", /\b(phisher|phish|fish|password|pass(?:word)?\s+crack|cracker|crack|termer|term(?:er)?|tos|account)\b/i],
  ["Screen-name utility", /\b(screen[-\s]?name|sn\s*(?:checker|maker|scanner|tool)|name\s+checker)\b/i],
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

function buildNotes(text, sourceFile, authorCandidates, versions, purposeSignals) {
  const notes = [];
  if (authorCandidates.length) {
    notes.push(`${sourceFile} includes archive-text author clue(s): ${authorCandidates.map((item) => item.name).join(", ")}.`);
  }
  if (versions.length) notes.push(`${sourceFile} mentions ${versions.join(", ")}.`);
  if (purposeSignals.length) notes.push(`${sourceFile} has vocabulary for ${purposeSignals.slice(0, 5).join(", ")}.`);
  if (/api\s+spy\s+by\s+oogle/i.test(text)) {
    notes.push(`${sourceFile} references API Spy by Oogle as supporting tooling; that is not treated as the program author by itself.`);
  }
  if (/\bdownloaded\s+from\b/i.test(text)) {
    notes.push(`${sourceFile} includes a mirror/download-source note.`);
  }
  return notes;
}

function choosePreferredAuthor(candidates) {
  if (!candidates.length) return "";
  const priority = ["author", "creator", "from", "byline", "program by"];
  return [...candidates].sort((a, b) => {
    const aScore = priority.indexOf(a.pattern);
    const bScore = priority.indexOf(b.pattern);
    return (aScore === -1 ? 99 : aScore) - (bScore === -1 ? 99 : bScore);
  })[0].name;
}

function scanArchive(program) {
  const localRelative = program.download?.path || "";
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
  const aolVersionMentions = new Set();
  const notes = [];
  const textFiles = [];

  for (const entry of entries) {
    const text = extractArchiveEntry(localPath, entry);
    if (!text.trim()) continue;
    textFiles.push(entry);
    const authors = extractAuthorCandidates(text, entry);
    for (const candidate of authors) addAuthorCandidate(authorCandidates, candidate.name, candidate.sourceFile, candidate.pattern);
    const versions = extractAolVersions(text);
    for (const version of versions) aolVersionMentions.add(version);
    const signals = extractPurposeSignals(text);
    for (const signal of signals) purposeSignals.add(signal);
    for (const note of buildNotes(text, entry, authors, versions, signals)) {
      if (!notes.includes(note)) notes.push(note);
    }
  }

  return {
    scanned: true,
    localPath: localRelative,
    localSize: statSync(localPath).size,
    textFileCount: textFiles.length,
    textFiles: textFiles.slice(0, 20),
    authorCandidates,
    preferredAuthor: choosePreferredAuthor(authorCandidates),
    purposeSignals: [...purposeSignals].slice(0, 20),
    aolVersionMentions: [...aolVersionMentions].slice(0, 12),
    notes: notes.slice(0, 16),
  };
}

function main() {
  const catalog = readCatalog();
  const programs = catalog.programs || [];
  const perProgram = {};
  let scannedThisRun = 0;

  for (const program of programs) {
    if (scanLimit && scannedThisRun >= scanLimit) break;
    const scanned = scanArchive(program);
    if (scanned.scanned) scannedThisRun += 1;
    perProgram[program.id] = {
      programId: program.id,
      programName: program.name,
      ...scanned,
    };
  }

  const records = Object.values(perProgram);
  const data = {
    generatedAt: new Date().toISOString(),
    programCount: programs.length,
    scannedPrograms: records.filter((item) => item.scanned).length,
    programsWithTextFiles: records.filter((item) => item.textFileCount > 0).length,
    programsWithAuthorCandidates: records.filter((item) => item.authorCandidates?.length).length,
    programsWithPurposeSignals: records.filter((item) => item.purposeSignals?.length).length,
    programsWithAolVersionMentions: records.filter((item) => item.aolVersionMentions?.length).length,
    perProgram,
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(outJs, `window.AOL_PROGZ_ARCHIVE_TEXT_METADATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(
    `Scanned ${data.scannedPrograms} archives: ${data.programsWithTextFiles} with readable text, ${data.programsWithAuthorCandidates} with author clues, ${data.programsWithPurposeSignals} with purpose clues.`,
  );
}

main();
