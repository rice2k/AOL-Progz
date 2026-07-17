import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const outJson = path.join(rootDir, "data", "reference-source-code.json");
const outJs = path.join(rootDir, "data", "reference-source-code.js");
const owner = "ssstonebraker";
const repo = "aolunderground-proggies";
const branch = "main";
const sourceRoot = "programming/vb/aol/";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function extensionOf(filePath) {
  return path.posix.extname(filePath).toLowerCase();
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "unknown";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function rawUrl(filePath) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

function githubUrl(filePath) {
  return `https://github.com/${owner}/${repo}/blob/${branch}/${filePath.split("/").map(encodeURIComponent).join("/")}`;
}

function versionBucket(parts) {
  const bucket = parts[0] || "unsorted";
  if (bucket === "25-30") return "AOL 2.5-3.0";
  if (bucket === "40-50") return "AOL 4.0-5.0";
  if (bucket === "60-70") return "AOL 6.0-7.0";
  if (bucket === "80-90") return "AOL 8.0-9.0";
  return "unsorted";
}

function sourceKind(filePath, parts, extension) {
  const value = filePath.toLowerCase();
  if (extension === ".zip" || extension === ".rar") return "source archive";
  if (extension === ".chm" || extension === ".hlp" || extension === ".doc" || extension === ".rtf") return "tutorial/help file";
  if (extension === ".bas") return "Visual Basic module";
  if (extension === ".frm" || extension === ".frx" || extension === ".vbp" || extension === ".vbw" || extension === ".cls" || extension === ".ctl") {
    return "Visual Basic project file";
  }
  if (extension === ".ocx" || extension === ".dll" || extension === ".vbx" || extension === ".oca" || extension === ".lib" || extension === ".exp") {
    return "runtime/control file";
  }
  if (extension === ".txt" || extension === ".md" || extension === ".htm" || extension === ".html") return "text/readme file";
  if (/\bmodules\b/.test(value)) return "source module";
  if (/\btutorials\b/.test(value)) return "tutorial/help file";
  if (/\bcontrols\b|\bdlls\b/.test(value)) return "runtime/control file";
  return parts[1] || "source file";
}

function featureTags(filePath) {
  const value = filePath.toLowerCase();
  const tags = [];
  for (const [tag, pattern] of [
    ["AOL 7", /\baol7|aol 7/],
    ["AOL 6", /\baol6|aol 6/],
    ["chat scan/control", /chatscan|chat_scan|simplechatscan|scan/],
    ["fader", /fade|fader/],
    ["macro", /macro|scroll/],
    ["mass mailer/server", /mail|mmer|server/],
    ["room/chat", /room|chat/],
    ["screen-name utility", /screen.?name|sncollector|sncoolector|sn/],
    ["source/tutorial", /source|src|tutorial|help|module|bas/],
    ["all-in-one/prog suite", /aohell|fate|rampage|acid|paranoid|tool|prog/],
  ]) {
    if (pattern.test(value)) tags.push(tag);
  }
  return tags;
}

function importCandidate(item, extension) {
  if (item.size > 5 * 1024 * 1024) return false;
  return extension === ".zip" || extension === ".rar" || extension === ".chm" || extension === ".hlp" || extension === ".doc" || extension === ".rtf";
}

async function fetchTree() {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const response = await fetch(url, { headers: { "user-agent": "AOL-Progz-source-collector/1.0" } });
  if (!response.ok) throw new Error(`GitHub tree fetch failed: ${response.status}`);
  return response.json();
}

const tree = await fetchTree();
const files = (tree.tree || [])
  .filter((item) => item.type === "blob" && String(item.path || "").startsWith(sourceRoot))
  .map((item) => {
    const relative = item.path.slice(sourceRoot.length);
    const parts = relative.split("/");
    const extension = extensionOf(item.path);
    return {
      name: path.posix.basename(item.path),
      path: item.path,
      relativePath: relative,
      folder: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
      versionBucket: versionBucket(parts),
      section: parts[1] || parts[0] || "unsorted",
      kind: sourceKind(item.path, parts, extension),
      extension: extension || "none",
      size: item.size || 0,
      sizeLabel: formatBytes(item.size || 0),
      rawUrl: rawUrl(item.path),
      githubUrl: githubUrl(item.path),
      featureTags: featureTags(item.path),
      importCandidate: importCandidate(item, extension),
      importReason: importCandidate(item, extension) ? "small source/tutorial archive or help file" : "",
      referenceOnly: true,
      notes: "Reference mirror path; use embedded source text and old web pages for authorship evidence.",
    };
  })
  .sort((a, b) => a.versionBucket.localeCompare(b.versionBucket) || a.relativePath.localeCompare(b.relativePath));

const byVersion = {};
const byKind = {};
const byExtension = {};
for (const file of files) {
  byVersion[file.versionBucket] = (byVersion[file.versionBucket] || 0) + 1;
  byKind[file.kind] = (byKind[file.kind] || 0) + 1;
  byExtension[file.extension] = (byExtension[file.extension] || 0) + 1;
}

const data = {
  generatedAt: new Date().toISOString(),
  sourceName: "AOLUnderground reference source tree",
  sourceUrl: `https://github.com/${owner}/${repo}/tree/${branch}/${sourceRoot.replace(/\/$/, "")}`,
  sourceRoot,
  fileCount: files.length,
  importCandidateCount: files.filter((item) => item.importCandidate).length,
  totalBytes: files.reduce((sum, item) => sum + item.size, 0),
  totalSizeLabel: formatBytes(files.reduce((sum, item) => sum + item.size, 0)),
  byVersion,
  byKind,
  byExtension,
  files,
};

mkdirSync(path.dirname(outJson), { recursive: true });
writeFileSync(outJson, `${JSON.stringify(data, null, 2)}\n`, "utf8");
writeFileSync(outJs, `window.AOL_PROGZ_REFERENCE_SOURCE_CODE = ${JSON.stringify(data, null, 2)};\n`, "utf8");
console.log(`Reference source code files: ${data.fileCount}, import candidates: ${data.importCandidateCount}, ${data.totalSizeLabel}.`);
