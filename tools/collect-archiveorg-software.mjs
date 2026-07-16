import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const outJson = path.join(rootDir, "data", "archiveorg-software.json");
const outJs = path.join(rootDir, "data", "archiveorg-software.js");
const imageRoot = path.join(rootDir, "assets", "archiveorg");
const downloadImages = !/^(0|false|no)$/i.test(process.env.AOL_ARCHIVEORG_DOWNLOAD_IMAGES || "1");
const maxImageBytes = Number(process.env.AOL_ARCHIVEORG_MAX_IMAGE_MB || 2) * 1024 * 1024;
const maxImportBytes = Number(process.env.AOL_ARCHIVEORG_IMPORT_MAX_MB || 52) * 1024 * 1024;
const maxTotalImportBytes = Number(process.env.AOL_ARCHIVEORG_TOTAL_IMPORT_MB || 220) * 1024 * 1024;

const searchSpecs = [
  { name: "AOL title search", q: 'title:(AOL OR "America Online") AND mediatype:"software"', rows: 160 },
  { name: "AOL Gold title search", q: 'title:("AOL Gold" OR "America Online Gold") AND mediatype:"software"', rows: 60 },
  { name: "AOL Desktop Gold search", q: '"AOL Desktop Gold" AND mediatype:"software"', rows: 40 },
  { name: "AIM title search", q: 'title:("AOL Instant Messenger" OR "AIM Messenger") AND mediatype:"software"', rows: 120 },
  { name: "DeadAIM search", q: 'DeadAIM AND mediatype:"software"', rows: 30 },
  {
    name: "AOL/AIM Winamp skin search",
    q: 'title:("Winamp Skin: AOL" OR "Winamp Skin: The_AOL" OR "Winamp Skin: AOL Instant Messenger") AND mediatype:"software"',
    rows: 30,
  },
];

const manualIdentifiers = [
  "aol_setup_disk",
  "aol250g",
  "aol-40-br",
  "aim5.0",
  "aoldnld-1-5",
  "install-aol-desktop",
  "install-aol-desktop-gold_2020",
  "aol-desktop-beta-gold",
  "aolprogramdisc2.6",
  "aol-7.0-revision-4114.540-32-bit",
  "aol_4.0_mac_68k",
  "AOLGold7",
  "AR518",
  "aol7gold_de_cdrom",
  "deadaim",
  "doors98-dead-aim-4.1.1",
  "deadaim-4.5-fully-cracked",
  "winampskin_The_AOL_Music_Player",
  "winampskin_AOL_Instant_Messenger_Amp",
];

const importableIdentifiers = new Set([
  "20220529-151140",
  "AOLFORDOSANDWINDOWS",
  "aol_1.5_for_dos",
  "aol25",
  "aol-instant-messenger-2",
  "aol-20",
  "aol_2.0",
  "AOL_1995_00001115_WINDOWS_V25_For_Windows_and_Macintosh",
  "aol250g",
  "disc-image-aol-2.5i-german",
  "aol25_199506",
  "aol-16-bit-setup",
  "aol_setup_disk",
  "AmericaOnlineVersion30ForWindows1996",
  "aol30_1996-08",
  "aol-setup-32",
  "aol-v-3.0",
  "aol-30-german-floppy",
  "aol-ver-30",
  "aol_uk_3.0i_mac",
  "aim10",
  "aim_1.0.10_solaris",
  "setup-323",
  "aol_4.0_mac_68k",
  "aol-40-br",
  "aol-7.0-revision-4114.540-32-bit",
  "aim5.0",
  "aim-1.0.19-generic",
  "aol-instant-messenger-4.8.2540",
  "install-aim-5.5.3415",
  "aoldnld-1-5",
  "install-aol-desktop",
  "aolprogramdisc2.6",
  "deadaim",
  "doors98-dead-aim-4.1.1",
  "winampskin_The_AOL_Music_Player",
  "winampskin_AOL_Instant_Messenger_Amp",
]);

const linkOnlyIdentifiers = new Set([
  "AOLGold7",
  "AR518",
  "aol7gold_de_cdrom",
  "install-aol-desktop-gold_2020",
  "aol-desktop-beta-gold",
  "deadaim-4.5-fully-cracked",
]);

const blockedTitlePattern =
  /(hypercard|gunbuster|resident evil|aim for the|student version|fire kill|strip-teaser|voice changer|darklord|privacy|windows xp|restore cd|candy land|chutes|guide to the internet|creating your own|quicken|tarot|profile|web pages|magazine|covermount|hasbro|direcpc|breakfast blast)/i;

function clean(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return (
    clean(value)
      .normalize("NFKD")
      .replace(/[^\w\s.-]/g, "")
      .replace(/[_\s.]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 120) || "archiveorg"
  );
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
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function archiveFileUrl(identifier, name) {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${name.split("/").map(encodeURIComponent).join("/")}`;
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "AOL-Progz-archiveorg-collector/1.0" },
  });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

async function searchArchive(spec) {
  const url = new URL("https://archive.org/advancedsearch.php");
  url.searchParams.set("q", spec.q);
  for (const field of ["identifier", "title", "creator", "date", "description", "downloads", "item_size", "collection"]) {
    url.searchParams.append("fl[]", field);
  }
  url.searchParams.set("rows", String(spec.rows));
  url.searchParams.set("page", "1");
  url.searchParams.append("sort[]", "date asc");
  url.searchParams.set("output", "json");
  const data = await getJson(url);
  return (data.response?.docs || []).map((doc) => ({ ...doc, searchSource: spec.name }));
}

function isRelevantDoc(doc) {
  const haystack = `${doc.identifier || ""} ${doc.title || ""}`.toLowerCase();
  if (manualIdentifiers.includes(doc.identifier)) return true;
  if (!/(aol|america online|instant messenger|deadaim|winamp skin)/i.test(haystack)) return false;
  if (blockedTitlePattern.test(haystack)) return false;
  return true;
}

function classifyItem(identifier, title) {
  const value = `${identifier} ${title}`.toLowerCase();
  if (/deadaim/.test(value)) return "DeadAIM / AIM enhancer";
  if (/winampskin|winamp skin|music player/.test(value)) return "Winamp skin";
  if (/desktop gold/.test(value)) return "AOL Desktop Gold";
  if (/\bgold\b/.test(value)) return "AOL Gold CD";
  if (/instant messenger|\baim\b/.test(value)) return "AIM client";
  if (/explorer/.test(value)) return "AOL browser/utility";
  return "AOL client/version";
}

function inferVersion(identifier, title, files) {
  const value = `${title} ${identifier} ${files.map((file) => file.name).join(" ")}`;
  const gold = value.match(/\b(?:AOL|America Online)\s+Gold(?:\s+Version)?\s*(\d+(?:\.\d+)?)/i);
  if (gold) return `AOL Gold ${gold[1]}`;
  const desktop = value.match(/\bAOL\s+Desktop\s+Gold(?:\s+(?:beta\s+)?version)?\s*(\d+(?:\.\d+){0,3})?/i);
  if (desktop) return desktop[1] ? `AOL Desktop Gold ${desktop[1]}` : "AOL Desktop Gold";
  const aim = value.match(/\b(?:AOL\s+Instant\s+Messenger|AIM|aim)\s*(?:Messenger)?\s*(\d+(?:[._]\d+){0,3})/i);
  if (aim) return `AIM ${aim[1].replaceAll("_", ".")}`;
  const aol = value.match(/\b(?:AOL|America Online|Version|v)\s*(?:Windows\s*)?(?:Version\s*)?(\d+(?:[._]\d+){0,3})/i);
  if (aol) return `AOL ${normalizeCompactVersion(aol[1].replaceAll("_", "."))}`;
  const compact = value.match(/\baol[_-]?(\d)(?:[._-]?(\d))?(?:[._-]?(\d+))?/i);
  if (compact) return `AOL ${[compact[1], compact[2], compact[3]].filter(Boolean).join(".")}`;
  return "";
}

function normalizeCompactVersion(version) {
  if (/^[1-9]0$/.test(version)) return `${version[0]}.0`;
  return version;
}

function isDownloadFile(file) {
  const name = file.name || "";
  const format = file.format || "";
  if (/_meta\.|_files\.xml|_archive\.torrent|_itemimage|_thumb|metadata|_scandata/i.test(name)) return false;
  if (/\.(exe|zip|rar|7z|img|ima|iso|hqx|sit|wsz|tar\.gz|tgz|bin|cue)$/i.test(name)) return true;
  return /Windows Executable|ZIP|RAR|7z|ISO Image|GZIP/i.test(format);
}

function isImageFile(file) {
  const name = file.name || "";
  const size = Number(file.size || 0);
  if (!size || size > maxImageBytes) return false;
  if (!/(screenshot|cover|about|buddy|tabbed|alias|logmanager|cloning|00_|aol7|aol40|img_|__ia_thumb)/i.test(name)) return false;
  return /\.(png|jpe?g|gif|bmp|webp)$/i.test(name) || /JPEG|PNG|GIF/i.test(file.format || "");
}

function imageRank(file) {
  const name = String(file.name || "").toLowerCase();
  if (/screenshot|about|buddy|tabbed|alias|logmanager|cloning/.test(name)) return 0;
  if (/00_|cover|aol7|aol40|img_/.test(name)) return 1;
  if (/__ia_thumb|_thumb/.test(name)) return 2;
  return 5;
}

function fileKind(file) {
  const name = file.name || "";
  const format = file.format || "";
  if (/\.(exe)$/i.test(name) || /Windows Executable/i.test(format)) return "installer/executable";
  if (/\.(zip|rar|7z|sit|hqx|tar\.gz|tgz)$/i.test(name)) return "archive/package";
  if (/\.(iso|img|ima|bin|cue)$/i.test(name) || /ISO Image|Cue Sheet/i.test(format)) return "disk image";
  if (/\.wsz$/i.test(name)) return "Winamp skin";
  if (isImageFile(file)) return "preview image";
  return format || "file";
}

function shouldImportFile(identifier, file, itemFiles) {
  if (!importableIdentifiers.has(identifier) || linkOnlyIdentifiers.has(identifier)) return false;
  if (!isDownloadFile(file)) return false;
  const name = file.name || "";
  const size = Number(file.size || 0);
  if (!size || size > maxImportBytes) return false;
  if (/_jp2\.zip|_logs\.zip|flux data|_hocr|_chocr|_text|_images\.zip/i.test(name)) return false;
  if (/\.cue$/i.test(name)) {
    return itemFiles.some((other) => /\.(bin|iso)$/i.test(other.name || "") && Number(other.size || 0) <= maxImportBytes);
  }
  if (/crack|cracked/i.test(`${identifier} ${name}`)) return false;
  return true;
}

async function downloadImage(identifier, file) {
  const extension = path.posix.extname(file.name || "") || ".jpg";
  const relative = `assets/archiveorg/${slugify(identifier)}/${slugify(path.posix.basename(file.name || "preview", extension))}${extension.toLowerCase()}`;
  const target = path.join(rootDir, relative);
  if (existsSync(target) && statSync(target).size > 0) return relative;
  const url = archiveFileUrl(identifier, file.name);
  mkdirSync(path.dirname(target), { recursive: true });
  const response = await fetch(url, {
    headers: { "user-agent": "AOL-Progz-archiveorg-collector/1.0" },
  });
  if (!response.ok) return "";
  const contentLength = Number(response.headers.get("content-length") || file.size || 0);
  if (contentLength > maxImageBytes) return "";
  const out = createWriteStream(target);
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxImageBytes) {
      out.destroy();
      return "";
    }
    out.write(chunk);
  }
  await new Promise((resolve) => out.end(resolve));
  return relative;
}

async function collectItem(doc) {
  const metadata = await getJson(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
  const meta = metadata.metadata || {};
  const files = (metadata.files || []).map((file) => ({
    name: file.name || "",
    format: file.format || "",
    size: Number(file.size || 0),
    sizeLabel: formatBytes(file.size),
    sha1: file.sha1 || "",
    md5: file.md5 || "",
    kind: fileKind(file),
    downloadUrl: archiveFileUrl(doc.identifier, file.name || ""),
    importCandidate: false,
  }));
  const category = classifyItem(doc.identifier, meta.title || doc.title || "");
  const images = [];
  for (const file of files.filter(isImageFile).sort((a, b) => imageRank(a) - imageRank(b) || a.size - b.size).slice(0, 3)) {
    const image = {
      name: file.name,
      size: file.size,
      sizeLabel: file.sizeLabel,
      url: file.downloadUrl,
      localPath: "",
    };
    if (downloadImages) image.localPath = await downloadImage(doc.identifier, file);
    images.push(image);
  }

  return {
    identifier: doc.identifier,
    title: clean(meta.title || doc.title || doc.identifier),
    creator: Array.isArray(meta.creator) ? meta.creator.join("; ") : clean(meta.creator || doc.creator || ""),
    date: clean(meta.date || doc.date || ""),
    description: clean(Array.isArray(meta.description) ? meta.description.join(" ") : meta.description || doc.description || ""),
    subjects: [meta.subject].flat().filter(Boolean).map(clean),
    collections: [meta.collection || doc.collection].flat().filter(Boolean).map(clean),
    itemSize: Number(meta.item_size || doc.item_size || files.reduce((sum, file) => sum + Number(file.size || 0), 0)),
    itemSizeLabel: formatBytes(meta.item_size || doc.item_size || files.reduce((sum, file) => sum + Number(file.size || 0), 0)),
    itemUrl: `https://archive.org/details/${doc.identifier}`,
    metadataUrl: `https://archive.org/metadata/${doc.identifier}`,
    category,
    version: inferVersion(doc.identifier, meta.title || doc.title || "", files),
    sourceSearch: doc.searchSource || "manual identifier",
    storageNote: linkOnlyIdentifiers.has(doc.identifier)
      ? "Tracked as source/download link only because the main media is oversized, modern, or crack-labeled."
      : "Small selected files can be imported into GitHub; large CD images remain linked at Archive.org.",
    files,
    images,
  };
}

function applyImportBudget(items) {
  let total = 0;
  let imported = 0;
  const flatFiles = [];
  for (const item of items) {
    for (const file of item.files) {
      if (shouldImportFile(item.identifier, file, item.files)) {
        flatFiles.push({ item, file });
      }
    }
  }
  flatFiles.sort((a, b) => {
    const aPreferred = preferredImportRank(a.item, a.file);
    const bPreferred = preferredImportRank(b.item, b.file);
    return aPreferred - bPreferred || a.file.size - b.file.size || a.item.title.localeCompare(b.item.title);
  });
  for (const entry of flatFiles) {
    if (total + entry.file.size > maxTotalImportBytes) {
      entry.file.importSkipReason = "total import budget";
      continue;
    }
    entry.file.importCandidate = true;
    total += entry.file.size;
    imported += 1;
  }
  return { imported, importedBytes: total };
}

function preferredImportRank(item, file) {
  const id = item.identifier;
  const name = file.name || "";
  if (/deadaim|winampskin/i.test(id)) return 0;
  if (/instant messenger|\baim\b/i.test(`${item.title} ${name}`)) return 1;
  if (/desktop gold|explorer/i.test(`${item.title} ${name}`)) return 2;
  if (/\.(exe|zip|img|ima|hqx|wsz)$/i.test(name)) return 3;
  if (/aol-7\.0|aol-40-br|setup-323/i.test(id)) return 4;
  if (/\.iso$/i.test(name)) return 5;
  return 8;
}

async function main() {
  const docs = new Map();
  for (const spec of searchSpecs) {
    for (const doc of await searchArchive(spec)) {
      if (isRelevantDoc(doc)) docs.set(doc.identifier, doc);
    }
  }
  for (const identifier of manualIdentifiers) {
    if (!docs.has(identifier)) docs.set(identifier, { identifier, title: identifier, searchSource: "manual identifier" });
  }

  const items = [];
  for (const doc of [...docs.values()].sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || a.identifier.localeCompare(b.identifier))) {
    try {
      items.push(await collectItem(doc));
      console.log(`Archive.org: ${items.at(-1).identifier} (${items.at(-1).category})`);
    } catch (error) {
      console.warn(`Archive.org failed: ${doc.identifier}: ${error.message}`);
    }
  }

  const importSummary = applyImportBudget(items);
  const importCandidates = items.flatMap((item) => item.files.filter((file) => file.importCandidate));
  const imageCount = items.reduce((sum, item) => sum + item.images.length, 0);
  const localImageCount = items.reduce((sum, item) => sum + item.images.filter((image) => image.localPath).length, 0);
  const byCategory = {};
  for (const item of items) byCategory[item.category] = (byCategory[item.category] || 0) + 1;

  const data = {
    generatedAt: new Date().toISOString(),
    source: "Internet Archive advancedsearch and metadata APIs",
    searchSpecs,
    itemCount: items.length,
    byCategory,
    importCandidateCount: importCandidates.length,
    importCandidateBytes: importSummary.importedBytes,
    importCandidateSizeLabel: formatBytes(importSummary.importedBytes),
    imageCount,
    localImageCount,
    items,
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(outJs, `window.AOL_PROGZ_ARCHIVEORG_SOFTWARE = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(
    `Archive.org software: ${data.itemCount} items, ${data.importCandidateCount} import candidates (${data.importCandidateSizeLabel}), ${data.localImageCount}/${data.imageCount} preview images.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
