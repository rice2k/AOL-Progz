import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const rootDir = path.resolve(import.meta.dirname, "..");
const generatedRoot = "docs/generated";
const generatedDir = path.join(rootDir, generatedRoot);

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
  return [...tags].sort();
}

function appPurpose(program) {
  const category = clean(program.category) || "uncategorized";
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
  return bits.join(" ");
}

function programType(program) {
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

function appTable(fromDoc, items) {
  return table(
    ["#", "Actual name", "Prog type", "Category", "Platform", "AOL/version bucket", "Author", "File", "Shots"],
    sortByName(items).map((program) => [
      String(program.index),
      localLink(fromDoc, program.name, appDocPaths.get(program.id)),
      programType(program),
      program.category || "uncategorized",
      program.platform || "unknown",
      versionLabel(program),
      program.author || "unknown",
      program.download?.path ? localLink(fromDoc, "local", program.download.path) : program.download?.status || "remote-only",
      String(program.screenshotCount || 0),
    ]),
  );
}

function programInventoryTable(fromDoc, items) {
  return table(
    [
      "#",
      "Actual name",
      "Archive filename",
      "Prog type",
      "Category",
      "AOL/version",
      "Author",
      "Local file",
      "Source URL",
      "Embedded URLs",
      "Screens",
    ],
    items.map((program) => {
      const embedded = uniqueBy(urlIndex.perProgram?.[program.id]?.urls || [], (item) => item.url);
      return [
        String(program.index),
        localLink(fromDoc, program.name, appDocPaths.get(program.id)),
        path.posix.basename(clean(program.file) || clean(program.download?.path) || ""),
        programType(program),
        program.category || "uncategorized",
        versionLabel(program),
        program.author || "unknown",
        program.download?.path ? localLink(fromDoc, program.download.path, program.download.path) : program.download?.status || "remote-only",
        program.download?.originalUrl ? link(program.download.originalUrl, program.download.originalUrl) : "",
        embedded.length ? embedded.map((item) => link(item.url, item.url)).join("<br>") : "",
        String(program.screenshotCount || 0),
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

const catalog = readCatalog();
const programs = catalog.programs || [];
const urlIndex = readJson("data/url-index.json", { perProgram: {} });
const webResources = readJson("data/web-resources.json", { pages: [], links: [] });
const webAssets = readJson("data/web-assets.json", { assets: [] });
const externalDownloads = readJson("data/external-downloads.json", { downloads: [], mirrorGroups: [] });
const missingCandidates = readJson("data/missing-candidates.json", { candidates: [] });

const userSuppliedLinks = [
  ["AOL Underground Proggies Archive", "GitHub archive", "https://github.com/ssstonebraker/aolunderground-proggies"],
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
  ["ProgzRescue archived URLs", "GitHub recovery lists", "https://github.com/raysuelzer/ProgzRescue/tree/main/archived-urls"],
  ["ProgzRescue Angelfire raw list", "raw URL list", "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-angelfire-files.txt"],
  ["FreeProgz capture index", "Wayback capture index", "https://web.archive.org/web/20250000000000*/http://www.freeprogz.com/"],
  ["CoolKid CCT", "program page", "https://web.archive.org/web/20010428185554/http://coolkid.text2k.net/programs/cct/"],
  ["CoolKid SP how-to", "how-to page", "https://web.archive.org/web/20010514020453/http://coolkid.text2k.net/programs/sp/howto.html"],
  ["RiceJerry links", "link directory", "https://web.archive.org/web/20010223212351/http://www.8op.com:80/ricejerry/links.html"],
  ["Methodus2000 NetBus page", "historical remote-control patch page", "https://web.archive.org/web/20010111011900/http://www.methodus2000.com:80/methodustoolz/netbus.htm"],
  ["Methodus Toolz wildcard", "Wayback wildcard", "https://web.archive.org/web/*/http://www.methodus2000.com/methodustoolz/*"],
  ["Methodus2000 base wildcard", "Wayback wildcard", "https://web.archive.org/web/*/http://methodus2000.com/"],
];

function linkKey(url) {
  return clean(url).replace(/\/+$/, "").toLowerCase();
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
    add({ url: source.url, label: source.name, kind: source.kind, source: "curated source collections", context: source.notes });
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
    add({ url: item.waybackUrl, label: `${item.name} Wayback`, kind: "external Wayback download", source: item.sourceList, context: item.status });
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
  const fileName = `${String(program.index).padStart(4, "0")}-${slugify(program.name).slice(0, 80)}.md`;
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
  const doc = appDocPaths.get(program.id);
  const embedded = uniqueBy(urlIndex.perProgram?.[program.id]?.urls || [], (item) => item.url);
  const tags = appTags(program, embedded);
  const screenshots = program.screenshots || [];
  const metadataRows = [
    ["Archive ID", program.id],
    ["Catalog number", String(program.index)],
    ["Name", program.name],
    ["Author", program.author || "unknown"],
    ["Platform", program.platform || "unknown"],
    ["AOL/version bucket", versionLabel(program)],
    ["Prog type", programType(program)],
    ["Category", program.category || "uncategorized"],
    ["Visual Basic", program.visualBasic || "unknown"],
    ["Compile type", program.compile || "unknown"],
    ["Duplicate count", String(program.duplicates || 0)],
    ["Archive password metadata", program.password ? "recorded in source catalog" : "not recorded"],
    ["Download status", program.download?.status || "unknown"],
    ["Local mirrored size", program.download?.sizeLabel || "unknown"],
  ];

  const sourceLinks = [
    program.download?.path
      ? `- Local mirrored archive: ${localLink(doc, program.download.path, program.download.path)}`
      : `- Local mirrored archive: ${program.download?.status || "not mirrored"}`,
    program.file ? `- Original source path: ${mdCode(program.file)}` : "- Original source path: unknown",
    program.download?.originalUrl
      ? `- Source repository URL: ${link(program.download.originalUrl, program.download.originalUrl)}`
      : "",
    program.download?.rawUrl ? `- Raw source URL: ${link(program.download.rawUrl, program.download.rawUrl)}` : "",
  ].filter(Boolean);

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

  writeDoc(
    doc,
    [
      `# ${clean(program.name) || "Unknown program"}`,
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
      "",
      screenshotBlock,
      "",
      urlBlock,
      "",
      "## Related Indexes",
      "",
      `- Category: ${localLink(doc, program.category || "uncategorized", `${generatedRoot}/categories/${slugify(program.category)}.md`)}`,
      `- Version bucket: ${localLink(doc, versionLabel(program), `${generatedRoot}/versions/${versionSlug(program)}.md`)}`,
      `- Applications index: ${localLink(doc, "all applications", `${generatedRoot}/applications/all-applications.md`)}`,
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
        ["Crawled source pages", String(webResources.pageCount || webResources.pages?.length || 0)],
        ["Crawled unique links", String(webResources.linkCount || 0)],
        ["Crawled download links", String(webResources.downloadCount || 0)],
        ["Master deduped link index", String(masterLinks.length)],
        ["User supplied priority links", String(uniqueBy(userSuppliedLinks, (item) => linkKey(item[2])).length)],
        ["Recovered external files", String(externalDownloads.readyCount || 0)],
        ["External mirror groups", String(externalDownloads.mirrorGroupCount || 0)],
        ["Recovered web images", String(webAssets.readyCount || 0)],
      ],
    ),
    "",
    "## Browse",
    "",
    "- [Applications](applications/README.md)",
    "- [Detailed all-progs inventory](applications/all-programs-detailed.md)",
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
    "This is the complete GitHub-readable inventory of the main catalog. It lists the actual catalog name, archive filename, inferred prog type, category, AOL/version bucket, author metadata, local mirrored file, original source URL, embedded URLs found inside readable archive text, and screenshot count.",
    "",
    programInventoryTable(`${generatedRoot}/applications/all-programs-detailed.md`, programs),
  ].join("\n"),
);

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
  programs.filter((program) => clean(program.author)),
  (program) => program.author,
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
    "Author names are preserved exactly as the source catalog recorded them when present. Many entries have no reliable author metadata.",
    "",
    table(["Author", "Count", "Page"], authorRows),
  ].join("\n"),
);

const sourceCollections = catalog.research?.sourceCollections || [];
const sourceRows = sourceCollections.map((source) => [
  source.name,
  source.kind,
  link(source.url, source.url),
  source.wayback ? link("Wayback", source.wayback) : "",
  source.notes,
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
    "- [Resource and directory links](resource-links.md)",
    "- [Embedded archive URLs](embedded-archive-urls.md)",
    "- [External mirror groups](mirror-groups.md)",
    "- [Missing candidates and recovered mirrors](missing-candidates.md)",
    `- ${localLink(`${generatedRoot}/sources/README.md`, "Methodus2000 source report", "docs/sources/methodus2000.md")}`,
  ].join("\n"),
);

writeDoc(
  `${generatedRoot}/sources/all-links.md`,
  [
    "# Master All-Links Index",
    "",
    `This page deduplicates every URL currently known to the archive: user-supplied links, curated sources, crawled source pages, crawled page links, extracted download links, embedded archive-text URLs, external mirror URLs, missing-candidate mirrors, and recovered web-image URLs. Current unique URL count: **${masterLinks.length}**.`,
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
  link(page.url, page.url),
]);

writeDoc(
  `${generatedRoot}/sources/source-pages.md`,
  [
    "# Crawled Source Pages",
    "",
    table(["Name", "Kind", "Status", "Title", "Links", "Downloads", "URL"], sourcePageRows),
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
    "These are filenames or program leads discovered from external old-web sources and compared against the main catalog. Ready counts mean at least one local mirror was recovered.",
    "",
    table(
      ["Key", "Category", "Mirrors", "Ready", "Ready local files"],
      (missingCandidates.candidates || []).map((candidate) => [
        candidate.key || candidate.fileName || "unknown",
        candidate.category || "unknown",
        String(candidate.mirrorCount || candidate.mirrors?.length || 0),
        String(candidate.readyCount || candidate.readyLocalFiles?.length || 0),
        (candidate.readyLocalFiles || []).map((file) => localLink(`${generatedRoot}/sources/missing-candidates.md`, file, file)).join("<br>"),
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
