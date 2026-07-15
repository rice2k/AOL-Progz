import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
  createWriteStream,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const sourceRepo = process.env.AOL_SOURCE_REPO || "D:/AOL-Progz-Source";
const copyFiles = process.env.AOL_COPY_FILES !== "0";
const copyBatchLimit = Number(process.env.AOL_COPY_BATCH || 0);
const copyTimeoutMs = Number(process.env.AOL_COPY_TIMEOUT_MS || 45000);
const maxGitHubFileBytes = Number(process.env.AOL_MAX_FILE_MB || 95) * 1024 * 1024;
const safeDirectory = sourceRepo.replaceAll("\\", "/");

const githubBase =
  "https://github.com/ssstonebraker/aolunderground-proggies/blob/main/";
const rawBase =
  "https://raw.githubusercontent.com/ssstonebraker/aolunderground-proggies/main/";
const skipManifestPath = path.join(rootDir, "data", "mirror-skips.json");

function git(args, options = {}) {
  return execFileSync(
    "git",
    ["-c", `safe.directory=${safeDirectory}`, "-C", sourceRepo, ...args],
    {
      encoding: options.encoding ?? "utf8",
      maxBuffer: options.maxBuffer ?? 1024 * 1024 * 120,
    },
  );
}

function stopProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // The process may already be gone.
    }
  } else {
    try {
      child.kill("SIGKILL");
    } catch {
      // The process may already be gone.
    }
  }
}

function encodeRepoPath(repoPath) {
  return repoPath.split("/").map(encodeURIComponent).join("/");
}

function compact(value) {
  const text = String(value ?? "").trim();
  return text && text.toLowerCase() !== "unknown" && text.toLowerCase() !== "none"
    ? text
    : "";
}

function titleCase(text) {
  return text
    .split(/\s+/)
    .map((word) => {
      if (/^(aol|aim|icq|msn|vb|oh|tos)$/i.test(word)) return word.toUpperCase();
      return word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function slugify(value) {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[_\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return slug || "item";
}

function normalizeKey(value) {
  return slugify(value).replace(/-(zip|rar|7z|exe|sit|hqx)$/i, "");
}

function fileStem(repoPath) {
  return path.posix.basename(repoPath).replace(/\.[^.]+$/, "");
}

function versionFolder(versions) {
  const match = String(versions || "").match(/\b(?:aol\s*)?(\d+(?:\.\d+)?)\b/i);
  return match ? `aol-${match[1].replace(".", "-")}` : "mixed";
}

function inferCategory(row) {
  const haystack = `${row.name} ${row.file}`.toLowerCase();
  const checks = [
    ["punter", /\b(punt|punter|punta|boot|nuke|knock|disconnect|flood)\b/],
    ["room buster", /\b(room[-\s]?buster|room[-\s]?bust|buster|bust[-\s]?in|roombust|bust)\b/],
    ["mass mailer", /\b(mass[-\s]?mail|mmer|mailer|mailbomb|mail[-\s]?bomb|spam|spammer)\b/],
    ["scroller or macro", /\b(scroll|scroller|macro|ascii|chat[-\s]?send|chatsend)\b/],
    ["fader or text tool", /\b(fader|fade|scrambler|rainbow|color|font|x'?er|xer)\b/],
    ["idler or bot", /\b(idle|idler|afk|bot|auto[-\s]?reply|autoreply)\b/],
    ["screen name tool", /\b(screen[-\s]?name|sn[-\s]?tool|sn[-\s]?check|checker|scanner)\b/],
    ["account or TOS tool", /\b(tos|termer|oh|overhead|account|pass|password|pw|phish|fish|card)\b/],
    ["chat or IM tool", /\b(chat|im|instant[-\s]?message|message|msg|ccom|c-com|linker)\b/],
    ["development or source", /\b(source|module|bas|vb|ocx|dll|control|tutorial|decompile)\b/],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(haystack)) return label;
  }
  if (/\b(aohell|fate|havok|pepsi|magenta|toolz|tools|proggie|progz)\b/.test(haystack)) {
    return "all-in-one prog";
  }
  return "uncategorized";
}

function makeDownloadPath(row, index) {
  const extension = path.posix.extname(row.file).toLowerCase() || ".zip";
  const platform = slugify(row.platform || "archive");
  const version = versionFolder(row.versions);
  const baseName = slugify(row.name || fileStem(row.file));
  return `files/${platform}/${version}/${String(index + 1).padStart(4, "0")}-${baseName}${extension}`;
}

function parseIndex() {
  const text = git(["show", "origin/main:proggie-index.txt"]);
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const fields = header.split("\t").map((field) => field.toLowerCase());
  return lines
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("\t");
      const entry = Object.fromEntries(fields.map((field, idx) => [field, parts[idx] || ""]));
      const row = {
        id: `prog-${String(index + 1).padStart(4, "0")}-${slugify(entry.name)}`,
        name: compact(entry.name) || titleCase(fileStem(entry.file || `program-${index + 1}`)),
        author: compact(entry.author),
        platform: compact(entry.platform) || "AOL",
        versions: compact(entry.versions),
        visualBasic: compact(entry.vb),
        compile: compact(entry.compile),
        file: compact(entry.file),
        duplicates: Number.parseInt(entry.duplicates || "0", 10) || 0,
        password: compact(entry.password),
        category: "",
      };
      row.category = inferCategory(row);
      row.download = {
        path: makeDownloadPath(row, index),
        status: "pending",
        size: 0,
      };
      return row;
    });
}

function getTree() {
  return git(["ls-tree", "-r", "origin/main"], { maxBuffer: 1024 * 1024 * 80 })
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\S+)\s+([0-9a-f]{40})\t(.+)$/);
      if (!match) return null;
      return { mode: match[1], type: match[2], sha: match[3], path: match[4] };
    })
    .filter(Boolean);
}

function buildScreenshotMap(treePaths) {
  const imagePaths = treePaths.filter((entry) =>
    /\.(png|jpe?g|gif|webp|bmp)$/i.test(entry.path),
  );
  const screenshotMap = new Map();
  for (const entry of imagePaths) {
    const repoPath = entry.path;
    const lowered = repoPath.toLowerCase();
    if (!/(screen|screenshot|shot|about|main)/.test(lowered)) continue;

    const parts = repoPath.split("/");
    let key = "";
    const sortedIndex = parts.indexOf("proggies-sorted-deduped");
    if (
      sortedIndex >= 0 &&
      parts[sortedIndex + 2] &&
      parts[sortedIndex + 1] !== "proggies-by-version" &&
      parts[sortedIndex + 2] !== "proggies-by-version"
    ) {
      key = normalizeKey(parts[sortedIndex + 2]);
    } else if (lowered.includes("/screenshots/")) {
      key = normalizeKey(parts[parts.indexOf("screenshots") - 1] || parts.at(-2));
    }

    if (!key) continue;
    const list = screenshotMap.get(key) || [];
    if (list.length < 8) {
      const localUrl = mirrorScreenshot(repoPath);
      list.push({
        path: repoPath,
        rawUrl: localUrl || `${rawBase}${encodeRepoPath(repoPath)}`,
        remoteRawUrl: `${rawBase}${encodeRepoPath(repoPath)}`,
        localUrl,
        sourceUrl: `${githubBase}${encodeRepoPath(repoPath)}`,
      });
    }
    screenshotMap.set(key, list);
  }
  return screenshotMap;
}

function mirrorScreenshot(repoPath) {
  const extension = path.posix.extname(repoPath).toLowerCase() || ".png";
  const base = slugify(repoPath.replace(/\.[^.]+$/, "")).slice(0, 170);
  const localUrl = `assets/screenshots/${base}${extension}`;
  const target = path.join(rootDir, localUrl);
  if (existsSync(target) && statSync(target).size > 0) return localUrl;
  try {
    mkdirSync(path.dirname(target), { recursive: true });
    const buffer = execFileSync(
      "git",
      ["-c", `safe.directory=${safeDirectory}`, "-C", sourceRepo, "show", `origin/main:${repoPath}`],
      { encoding: "buffer", maxBuffer: 1024 * 1024 * 20, timeout: 45000 },
    );
    writeFileSync(target, buffer);
    return localUrl;
  } catch {
    return "";
  }
}

function decorateRows(rows, tree) {
  const pathMap = new Map(tree.map((entry) => [entry.path, entry]));
  const screenshotMap = buildScreenshotMap(tree);

  let matched = 0;
  let mirrored = 0;
  let missing = 0;

  for (const [index, row] of rows.entries()) {
    const treeEntry = pathMap.get(row.file);
    const sha = treeEntry?.sha;
    row.download.size = 0;
    row.download.sizeLabel = "";
    row.download.originalUrl = row.file ? `${githubBase}${encodeRepoPath(row.file)}` : "";
    row.download.rawUrl = row.file ? `${rawBase}${encodeRepoPath(row.file)}` : "";

    if (treeEntry) {
      matched += 1;
      row.download.sha = sha;
      row.download.status = "ready";
      mirrored += 1;
    } else {
      row.download.status = "missing-source-blob";
      row.download.path = "";
      missing += 1;
    }

    const stemKey = normalizeKey(fileStem(row.file));
    const nameKey = normalizeKey(row.name);
    row.screenshots = screenshotMap.get(stemKey) || screenshotMap.get(nameKey) || [];
    row.screenshotCount = row.screenshots.length;
    row.index = index + 1;
    row.search = [
      row.name,
      row.author,
      row.platform,
      row.versions,
      row.visualBasic,
      row.compile,
      row.category,
      row.file,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  return {
    matched,
    mirrored,
    missing,
  };
}

function loadSkipManifest() {
  if (!existsSync(skipManifestPath)) return {};
  try {
    return JSON.parse(readFileSync(skipManifestPath, "utf8"));
  } catch {
    return {};
  }
}

function applySkipManifest(rows, skipManifest) {
  for (const row of rows) {
    if (row.download.status !== "ready" || !row.download.path) continue;
    const target = path.join(rootDir, row.download.path);
    if (existsSync(target) && statSync(target).size > 0) continue;
    const skip = skipManifest[row.file];
    if (!skip) continue;
    row.download.status = skip.status || "copy-timeout";
    row.download.size = skip.size || 0;
    row.download.sizeLabel = row.download.size ? formatBytes(row.download.size) : "";
    row.download.error = skip.error || "";
    row.download.path = "";
  }
}

function hydrateExistingLocalFiles(rows) {
  for (const row of rows) {
    if (!row.download.path) continue;
    const target = path.join(rootDir, row.download.path);
    if (existsSync(target)) {
      const size = statSync(target).size;
      if (size > 0) {
        row.download.status = "ready";
        row.download.size = size;
        row.download.sizeLabel = formatBytes(size);
        continue;
      }
    }
    if (!copyFiles && row.download.status === "ready") {
      row.download.status = "remote-only";
      row.download.path = "";
    }
  }
}

function saveSkipManifest(rows, previousManifest) {
  const next = { ...previousManifest };
  for (const row of rows) {
    if (!["copy-timeout", "copy-failed", "too-large"].includes(row.download.status)) continue;
    next[row.file] = {
      status: row.download.status,
      size: row.download.size || 0,
      error: row.download.error || "",
      updatedAt: new Date().toISOString(),
    };
  }
  const ordered = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(path.dirname(skipManifestPath), { recursive: true });
  writeFileSync(skipManifestPath, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

async function copyReadyFiles(rows) {
  const groups = new Map();
  let pending = 0;
  let skippedExisting = 0;

  for (const row of rows) {
    if (row.download.status !== "ready" || !row.download.sha || !row.download.path) continue;
    const target = path.join(rootDir, row.download.path);
    if (existsSync(target)) {
      const size = statSync(target).size;
      if (size > 0) {
        row.download.size = size;
        row.download.sizeLabel = formatBytes(size);
        skippedExisting += 1;
        continue;
      }
    }
    if (copyBatchLimit && pending >= copyBatchLimit) {
      row.download.status = "queued";
      row.download.path = "";
      continue;
    }
    pending += 1;
    const list = groups.get(row.download.sha) || [];
    list.push({ row, target });
    groups.set(row.download.sha, list);
  }

  if (!groups.size) return { copied: 0, skippedExisting };

  return await new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      ["-c", `safe.directory=${safeDirectory}`, "-C", sourceRepo, "cat-file", "--batch"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let buffer = Buffer.alloc(0);
    let current = null;
    let copied = 0;
    let stderr = "";
    let failed = false;

    function fail(error) {
      if (failed) return;
      failed = true;
      stopProcessTree(child);
      reject(error);
    }

    function drain() {
      while (!failed) {
        if (!current) {
          const lineEnd = buffer.indexOf(10);
          if (lineEnd < 0) return;
          const header = buffer.subarray(0, lineEnd).toString("utf8");
          buffer = buffer.subarray(lineEnd + 1);
          const [sha, type, sizeText] = header.split(/\s+/);
          if (type !== "blob") {
            fail(new Error(`Expected blob for ${sha}, got ${header}`));
            return;
          }
          current = { sha, size: Number(sizeText) || 0 };
        }

        if (buffer.length < current.size + 1) return;
        const blob = buffer.subarray(0, current.size);
        buffer = buffer.subarray(current.size + 1);
      const targets = groups.get(current.sha) || [];
      for (const targetInfo of targets) {
        targetInfo.row.download.size = current.size;
        targetInfo.row.download.sizeLabel = formatBytes(current.size);
        if (current.size > maxGitHubFileBytes) {
          targetInfo.row.download.status = "too-large";
          targetInfo.row.download.path = "";
          continue;
        }
        mkdirSync(path.dirname(targetInfo.target), { recursive: true });
        if (existsSync(targetInfo.target) && statSync(targetInfo.target).size === current.size) {
          continue;
        }
        writeFileSync(targetInfo.target, blob);
        copied += 1;
      }
        current = null;
      }
    }

    child.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      drain();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (failed) return;
      if (code !== 0) {
        reject(new Error(stderr || `git cat-file exited with code ${code}`));
        return;
      }
      resolve({ copied, skippedExisting });
    });
    for (const sha of groups.keys()) {
      child.stdin.write(`${sha}\n`);
    }
    child.stdin.end();
  });
}

async function copyReadyFilesOneByOne(rows) {
  let copied = 0;
  let skippedExisting = 0;
  let attempted = 0;

  for (const row of rows) {
    if (row.download.status !== "ready" || !row.download.sha || !row.download.path) continue;
    const target = path.join(rootDir, row.download.path);
    if (existsSync(target)) {
      const size = statSync(target).size;
      if (size > 0) {
        row.download.size = size;
        row.download.sizeLabel = formatBytes(size);
        skippedExisting += 1;
        continue;
      }
    }
    if (copyBatchLimit && attempted >= copyBatchLimit) {
      row.download.status = "queued";
      row.download.path = "";
      continue;
    }
    attempted += 1;
    const result = await copyOneArchive(row, target);
    if (result === "copied") copied += 1;
  }

  return { copied, skippedExisting };
}

async function copyOneArchive(row, target) {
  mkdirSync(path.dirname(target), { recursive: true });
  const tempTarget = `${target}.tmp`;
  if (existsSync(tempTarget)) {
    try {
      unlinkSync(tempTarget);
    } catch {
      // Ignore stale temp cleanup failures; the write step will report a real error.
    }
  }

  return await new Promise((resolve) => {
    const child = spawn(
      "git",
      ["-c", `safe.directory=${safeDirectory}`, "-C", sourceRepo, "show", `origin/main:${row.file}`],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    const out = createWriteStream(tempTarget);
    let size = 0;
    let stderr = "";
    let timedOut = false;
    let tooLarge = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      stopProcessTree(child);
    }, copyTimeoutMs);

    function finish(status, code = 0) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      out.end(() => {
        if (existsSync(tempTarget)) {
          try {
            if (status === "copied") {
              renameSync(tempTarget, target);
            } else {
              unlinkSync(tempTarget);
            }
          } catch {
            status = "copy-failed";
          }
        }

        row.download.size = size;
        row.download.sizeLabel = size ? formatBytes(size) : "";

        if (status === "copied") {
          resolve("copied");
          return;
        }

        if (tooLarge) {
          row.download.status = "too-large";
        } else if (timedOut) {
          row.download.status = "copy-timeout";
        } else {
          row.download.status = "copy-failed";
          row.download.error = stderr || `git show exited with code ${code}`;
        }
        row.download.path = "";
        resolve(status);
      });
    }

    out.on("error", (error) => {
      stderr += error.message;
      stopProcessTree(child);
      finish("copy-failed");
    });

    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxGitHubFileBytes) {
        tooLarge = true;
        stopProcessTree(child);
        return;
      }
      out.write(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", () => finish("copy-failed"));
    child.on("close", (code) => {
      if (tooLarge) {
        finish("too-large", code);
      } else if (timedOut) {
        finish("copy-timeout", code);
      } else if (code === 0) {
        finish("copied", code);
      } else {
        finish("copy-failed", code);
      }
    });
  });
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "AOL-Progz-archive-builder/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "AOL-Progz-archive-builder/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJustinData() {
  try {
    const categories = await fetchJson(
      "https://justinakapaste.com/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count",
    );
    const wanted = new Set([
      "aol-aim-progs",
      "aol-aim-prog-read-mes",
      "aol-screenshots",
      "aol-macros",
      "aol-aim-exploits",
      "aol-spam",
      "aol-tos-bumps",
      "prog-videos",
      "idlers",
      "punters",
      "scrollers",
      "spammers",
      "xers",
      "yahoo-progs",
      "prodigy-progs",
      "visual-basic",
    ]);
    const selectedCategories = categories
      .filter((category) => wanted.has(category.slug))
      .sort((a, b) => b.count - a.count)
      .map((category) => ({
        id: category.id,
        name: stripHtml(category.name),
        slug: category.slug,
        count: category.count,
        url: `https://justinakapaste.com/category/${category.slug}/`,
      }));

    const topCategoryIds = selectedCategories.slice(0, 7).map((category) => category.id);
    const postGroups = [];
    for (const categoryId of topCategoryIds) {
      const posts = await fetchJson(
        `https://justinakapaste.com/wp-json/wp/v2/posts?categories=${categoryId}&per_page=6&_fields=link,title,date,excerpt`,
      );
      const category = selectedCategories.find((item) => item.id === categoryId);
      postGroups.push({
        category: category?.name || "Posts",
        posts: posts.map((post) => ({
          title: stripHtml(post.title?.rendered),
          date: post.date?.slice(0, 10),
          excerpt: stripHtml(post.excerpt?.rendered).slice(0, 220),
          url: post.link,
        })),
      });
    }
    return { categories: selectedCategories, postGroups };
  } catch (error) {
    return {
      categories: [],
      postGroups: [],
      error: `JustinAKAPaste fetch failed: ${error.message}`,
    };
  }
}

async function getAolUndergroundShots() {
  try {
    const html = await fetchText("https://aolunderground.com/proggies/");
    const matches = [...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)];
    const shots = [];
    for (const match of matches) {
      let src = match[1];
      if (!src || src.startsWith("data:")) continue;
      if (src.startsWith("//")) src = `https:${src}`;
      if (src.startsWith("/")) src = `https://aolunderground.com${src}`;
      if (!/^https?:\/\//i.test(src)) src = new URL(src, "https://aolunderground.com/proggies/").href;
      if (!shots.some((shot) => shot.url === src)) {
        shots.push({
          url: src,
          source: "AOLUnderground.com ProGGieS",
        });
      }
      if (shots.length >= 24) break;
    }
    return shots;
  } catch {
    return [];
  }
}

function buildStaticResearch() {
  return {
    sourceCollections: [
      {
        name: "AOL Underground Proggies Archive",
        kind: "GitHub archive",
        url: "https://github.com/ssstonebraker/aolunderground-proggies",
        wayback:
          "https://web.archive.org/web/*/https://github.com/ssstonebraker/aolunderground-proggies",
        notes:
          "Primary catalog source for this site. It documents thousands of AOL/AIM archives, HTML analysis pages, author attribution, screenshots, duplicate detection, and AOL version tagging.",
      },
      {
        name: "AOLUnderground.com ProGGieS",
        kind: "scene index",
        url: "https://aolunderground.com/proggies/",
        wayback: "https://web.archive.org/web/*/https://aolunderground.com/proggies/",
        notes:
          "A companion index with passwords, missing-prog calls, screenshots, and sections for AIM tools, all-in-one progs, macro studios, punters, scrollers, and more.",
      },
      {
        name: "JustinAKAPaste",
        kind: "large web archive",
        url: "https://justinakapaste.com/",
        wayback: "https://web.archive.org/web/*/https://justinakapaste.com/",
        notes:
          "A major AOL/AIM history archive with progs, screenshots, readmes, macros, videos, people pages, exploit writeups, Yahoo and Prodigy sections, and Visual Basic material.",
      },
      {
        name: "Legacy AOL Underground",
        kind: "GitHub mirror/fork",
        url: "https://github.com/DamianSuess/Legacy-AOL-Underground",
        wayback:
          "https://web.archive.org/web/*/https://github.com/DamianSuess/Legacy-AOL-Underground",
        notes:
          "A related legacy mirror/fork of the AOL Underground archive that helps preserve repository history and discoverability.",
      },
      {
        name: "HyPeR's AOL Progs",
        kind: "old-school web list",
        url: "https://hyperspage.com/progs/aol-progs",
        wayback: "https://web.archive.org/web/*/https://hyperspage.com/progs/aol-progs",
        notes:
          "Classic rated downloads list for older AOL versions, including names such as Lethal Fragment, Annihilation, Methodus Toolz, Adidas Toolz, AOEvil, Chat Spam, Digital Ice, and others.",
      },
      {
        name: "Plozee history article",
        kind: "context article",
        url: "https://plozee.com/aol-proggies-and-punters-a-neglected-part-of-internet-history/",
        wayback:
          "https://web.archive.org/web/*/https://plozee.com/aol-proggies-and-punters-a-neglected-part-of-internet-history/",
        notes:
          "Useful scene context for proggies, punters, room busters, mass mailers, idlers, ASCII/macro tools, and the Visual Basic teen-coder culture around AOL.",
      },
      {
        name: "Kadeklizem AOL Progs ARCHIVE.rar",
        kind: "large Wayback file",
        url: "https://web.archive.org/web/20220321112058/http://kadeklizem.com/AOL%20Progs%20ARCHIVE.rar",
        originalUrl: "http://kadeklizem.com/AOL Progs ARCHIVE.rar",
        wayback:
          "https://web.archive.org/web/*/http://kadeklizem.com/AOL%20Progs%20ARCHIVE.rar",
        notes:
          "Wayback captured a very large RAR archive in 2022. It is kept as an external historical source because it is too large for ordinary GitHub Pages hosting.",
      },
      {
        name: "Aciddr0p",
        kind: "old domain",
        url: "http://www.aciddr0p.net/",
        wayback: "https://web.archive.org/web/*/http://www.aciddr0p.net/*",
        notes:
          "Old-school AOL underground source domain preserved mainly through Wayback captures.",
      },
      {
        name: "Koin",
        kind: "old domain",
        url: "https://koin.org/",
        wayback: "https://web.archive.org/web/*/http://koin.org/*",
        notes:
          "Historic source domain referenced by the AOL Underground archive contributors and source list.",
      },
      {
        name: "Rexflex Progs",
        kind: "old domain",
        url: "https://progs.rexflex.net/",
        wayback: "https://web.archive.org/web/*/https://progs.rexflex.net/*",
        notes:
          "Modern-ish hosted progs index referenced by AOL Underground as a contributed source.",
      },
      {
        name: "DarcFX Submissions",
        kind: "GitHub source/code archive",
        url: "https://github.com/darcfx/darcfx-submissions",
        wayback: "https://web.archive.org/web/*/https://github.com/darcfx/darcfx-submissions",
        notes:
          "A migration of DarcFX legacy submissions covering AOL controls, DLLs, forms, modules, decompiled material, tutorials, runtimes, and non-AOL code snippets.",
      },
      {
        name: "ProgzRescue",
        kind: "Wayback recovery project",
        url: "https://github.com/raysuelzer/ProgzRescue",
        wayback: "https://web.archive.org/web/*/https://github.com/raysuelzer/ProgzRescue",
        notes:
          "A recovery project that uses Wayback CDX/timemap metadata to locate archived ZIP files from old hosts such as Angelfire, FortuneCity, and Geocities.",
      },
      {
        name: "FreeProgz",
        kind: "Wayback prog hub",
        url: "https://web.archive.org/web/20010516214202/http://www.freeprogz.com/",
        wayback: "https://web.archive.org/web/*/http://www.freeprogz.com/*",
        notes:
          "PHAT's Free Progz described itself as serving AOL needs and listed server-status counts for All Progs, AIM and ICQ, Macintosh, miscellaneous files, and total files.",
      },
      {
        name: "FreeProgz Links",
        kind: "old link directory",
        url: "https://web.archive.org/web/20010603213502/http://www.freeprogz.com/links.htm",
        wayback: "https://web.archive.org/web/*/http://www.freeprogz.com/links.htm",
        notes:
          "A FreeProgz link page with outbound scene links, free-for-all links, topsites, and period web-hosting/sponsor references.",
      },
      {
        name: "Oogle AIM Progs",
        kind: "AIM download page",
        url: "https://web.archive.org/web/20010424150235/http://www.oogle.net/d_aimprogs.htm",
        wayback: "https://web.archive.org/web/*/http://www.oogle.net/d_aimprogs.htm",
        notes:
          "A Wayback-captured AIM progs download page to use for program names, original download links, and missing-file discovery.",
      },
      {
        name: "AOL-Progz.com",
        kind: "AOL prog portal",
        url: "https://web.archive.org/web/20010301094602/http://www.aol-progz.com:80/",
        wayback: "https://web.archive.org/web/*/http://www.aol-progz.com/*",
        notes:
          "Old AOL-Progz.com entry page, useful as a domain/provenance clue for the broader AOL prog directory ecosystem.",
      },
      {
        name: "AimThings",
        kind: "AIM resource site",
        url: "https://web.archive.org/web/20030623040448/http://aimthings.com/",
        wayback: "https://web.archive.org/web/*/http://aimthings.com/*",
        notes:
          "AIMThings navigation included AIM files, tricks, profiles, IM abuse, themes, buddy icons, pranks, links, and related AIM-era material.",
      },
      {
        name: "LensHellArchive",
        kind: "AOL/AIM/Yahoo archive",
        url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/Index.html",
        wayback: "https://web.archive.org/web/*/http://lenshellarchive.com/*",
        notes:
          "LensHell presented itself as a large AOL/AIM/Yahoo prog archive with AIM, AOL, Yahoo, miscellaneous, faders, Visual Basic, OCX/VBX/DLL, prog descriptions, and passwords sections.",
      },
      {
        name: "ProgStation AIM",
        kind: "AIM progs page",
        url: "https://web.archive.org/web/20010221023818/http://progstation.hypermart.net:80/aim.html",
        wayback: "https://web.archive.org/web/*/http://progstation.hypermart.net/*",
        notes:
          "Hypermart-hosted AIM progs page captured by Wayback, included for original download and program-name discovery.",
      },
      {
        name: "LolToolz Progs",
        kind: "Geocities prog page",
        url: "https://web.archive.org/web/20021018083822/http://www.geocities.com:80/loltoolz/progs.html",
        wayback: "https://web.archive.org/web/*/http://www.geocities.com/loltoolz/*",
        notes:
          "Geocities LolToolz progs page supplied for old program links and missing-file discovery.",
      },
      {
        name: "RiceJerry Links",
        kind: "old link directory",
        url: "https://web.archive.org/web/20010223212351/http://www.8op.com:80/ricejerry/links.html",
        wayback: "https://web.archive.org/web/*/http://www.8op.com/ricejerry/*",
        notes:
          "RiceJerry link page with many outbound prog-site links; extracted links are displayed in the web directories section.",
      },
      {
        name: "CoolKid Text2k Programs",
        kind: "program pages",
        url: "https://web.archive.org/web/20010428185554/http://coolkid.text2k.net/programs/cct/",
        wayback: "https://web.archive.org/web/*/http://coolkid.text2k.net/programs/*",
        notes:
          "CoolKid/Text2k program pages for CCT and related SP material, retained for names, screenshots, and download clues.",
      },
    ],
    glossary: [
      {
        term: "Proggie / Prog / Progz",
        type: "general",
        description:
          "Independent AOL-era helper apps, usually made by hobbyists in Visual Basic. They ranged from chat and macro tools to all-in-one suites, bots, mailers, punters, faders, and account utilities.",
      },
      {
        term: "Punter",
        type: "abuse category",
        description:
          "A tool associated with forcing another user offline or making their AOL session unstable. This site treats punters as historical artifacts and does not document operating steps.",
      },
      {
        term: "Booter",
        type: "abuse category",
        description:
          "Scene synonym for a punter-style tool used to kick or boot someone offline. Preserved here only as historical vocabulary.",
      },
      {
        term: "Anti / Anti Booter",
        type: "defense tool",
        description:
          "A program advertised as protecting a user from being kicked offline by punters or booters. These were part of the back-and-forth tooling culture around AOL chat rooms.",
      },
      {
        term: "Room buster",
        type: "abuse category",
        description:
          "A tool or feature associated with repeatedly trying to enter a full room until an opening appears; the phrase was also used around disruptive room behavior in some archives.",
      },
      {
        term: "Buster",
        type: "room utility",
        description:
          "Short scene label for a room buster or related room-entry utility.",
      },
      {
        term: "C-Com",
        type: "command/chat tool",
        description:
          "A command-list tool where a typed chat trigger could send a stored list of commands or canned chat actions.",
      },
      {
        term: "Scroller",
        type: "chat tool",
        description:
          "A program that automated large text, ASCII art, or repeated chat lines. Some scrollers tried to avoid room anti-scroll limits by pacing messages.",
      },
      {
        term: "Macro studio",
        type: "creative/chat tool",
        description:
          "A tool for building, storing, and sending macro art or scripted chat text, often used for ASCII art, banners, and stylized room posting.",
      },
      {
        term: "Fader",
        type: "text effect",
        description:
          "A program that generated color-faded or stylized text for chat, profiles, or messages.",
      },
      {
        term: "Idler / AFK bot",
        type: "automation",
        description:
          "A bot that kept a screen name present, auto-responded, or performed simple unattended actions while the user was away.",
      },
      {
        term: "MMer / Mass mailer",
        type: "abuse category",
        description:
          "AOL-era bulk mail or mail-bomb tooling. This archive records it as part of the scene history without reproducing usage instructions.",
      },
      {
        term: "Server",
        type: "file/mail sharing context",
        description:
          "In this scene vocabulary, a server often meant a tool that announced or served a list of files, emails, or downloads in chat. Some overlapped with mass-mailer behavior.",
      },
      {
        term: "Cracker",
        type: "account abuse category",
        description:
          "A label for tools associated with trying to obtain or break into account passwords. This was illegal and is included only for historical classification.",
      },
      {
        term: "Phisher",
        type: "account abuse category",
        description:
          "A credential-theft or fake-login category used to trick someone into giving up an account password. This was illegal and is included only for historical classification.",
      },
      {
        term: "X'er",
        type: "text or chat utility",
        description:
          "A scene label often used for tools that ignored or blocked annoying chat-room users, transformed text, generated effects, or performed a narrow AOL automation trick.",
      },
      {
        term: "TOS / Termer",
        type: "account abuse context",
        description:
          "Tools and lore related to AOL Terms of Service reports, warnings, account termination, or attempts to manipulate those systems.",
      },
      {
        term: "Termer",
        type: "account abuse category",
        description:
          "A tool category associated with trying to terminate or kill an AOL account. This was illegal and is included only as archive vocabulary.",
      },
      {
        term: "OH account",
        type: "account context",
        description:
          "Scene shorthand often used around account status, billing, or overhead-account lore. Kept here as vocabulary, not as operational guidance.",
      },
      {
        term: "Misc prog",
        type: "mixed category",
        description:
          "A catch-all label for programs that did not fit a single category or bundled many features into one tool.",
      },
    ],
    timeline: [
      {
        year: "1995",
        title: "AOL 2.5 era",
        description:
          "AOL 2.5 became one of the important early Windows targets for classic progs such as AOHell-style tools.",
        source: "https://www.oldversion.com/software/america-online/",
      },
      {
        year: "1996",
        title: "AOL 3.0",
        description:
          "AOL 3.0 broadened the Windows audience for proggies, punters, macro tools, and chat automation.",
        source: "https://www.oldversion.com/software/america-online/",
      },
      {
        year: "1997",
        title: "AIM breaks out",
        description:
          "AOL Instant Messenger helped separate instant messaging from the full AOL client and became its own target for tools and experiments.",
        source: "https://en.wikipedia.org/wiki/AIM_(software)",
      },
      {
        year: "1998",
        title: "AOL 4.0 and ICQ",
        description:
          "AOL 4.0 arrived, and AOL also acquired Mirabilis, the company behind ICQ, as instant messaging became central internet culture.",
        source: "https://www.wired.com/1998/06/aol-grabs-icq-firm/",
      },
      {
        year: "1999",
        title: "AOL 5.0 and MSN Messenger",
        description:
          "AOL 5.0 and MSN Messenger arrived in the same broader era, expanding the chat ecosystem beyond AOL/AIM.",
        source: "https://news.microsoft.com/source/1999/07/21/microsoft-launches-msn-messenger-service/",
      },
      {
        year: "2000-2003",
        title: "AOL 6.0 through 9.0",
        description:
          "Later AOL clients changed the target surface while older proggies, source snippets, and Visual Basic components continued to circulate.",
        source: "https://www.oldversion.com/software/america-online/",
      },
      {
        year: "2016-2026",
        title: "Rescue and catalog work",
        description:
          "GitHub and Wayback-based preservation projects began turning scattered ZIPs, screenshots, readmes, and old domains into searchable archives.",
        source: "https://github.com/ssstonebraker/aolunderground-proggies",
      },
    ],
    featuredExternalPrograms: [
      {
        name: "AOHell 95",
        source: "AOL Underground archive",
        category: "all-in-one prog",
        notes:
          "One of the most recognizable AOL-era all-in-one tool families, represented in the archive with AOL 2.5/3.0 material and screenshots.",
      },
      {
        name: "AOMess 4 AOL 2.5",
        source: "AOLUnderground.com",
        category: "all-in-one prog",
        notes:
          "Documented with a feature list including chat/IM disruption terminology, mail tools, games, and other AOL 2.5-era functions.",
        url: "https://aolunderground.com/proggies/",
      },
      {
        name: "Lethal Fragment",
        source: "HyPeR's AOL Progs",
        category: "AOL prog",
        notes:
          "Listed on HyPeR's older AOL progs page with rating and download metadata.",
        url: "https://hyperspage.com/progs/aol-progs",
      },
      {
        name: "Annihilation",
        source: "HyPeR's AOL Progs",
        category: "AOL prog",
        notes:
          "Another HyPeR list item from the old-school downloadable progs era.",
        url: "https://hyperspage.com/progs/aol-progs",
      },
      {
        name: "Methodus Toolz 2.0",
        source: "HyPeR's AOL Progs",
        category: "toolz suite",
        notes:
          "A rated 'toolz' style entry in the HyPeR catalog, useful for cross-source program-name lookup.",
        url: "https://hyperspage.com/progs/aol-progs",
      },
      {
        name: "AOEvil",
        source: "HyPeR's AOL Progs",
        category: "AOL prog",
        notes:
          "Named in HyPeR's old AOL progs list, illustrating the late-1990s naming style of underground AOL tools.",
        url: "https://hyperspage.com/progs/aol-progs",
      },
    ],
  };
}

function summarize(rows, mirrorStats, tree) {
  const authors = new Set(rows.map((row) => row.author).filter(Boolean)).size;
  const platforms = new Set(rows.map((row) => row.platform).filter(Boolean)).size;
  const categories = new Set(rows.map((row) => row.category).filter(Boolean)).size;
  const screenshotPrograms = rows.filter((row) => row.screenshotCount > 0).length;
  const screenshotFiles = rows.reduce((sum, row) => sum + row.screenshotCount, 0);
  const archiveFiles = tree.filter((entry) => /\.(zip|rar|7z|sit|hqx)$/i.test(entry.path)).length;
  const mirroredRows = rows.filter((row) => row.download.status === "ready");
  const mirroredSize = mirroredRows.reduce((sum, row) => sum + (row.download.size || 0), 0);
  return {
    generatedAt: new Date().toISOString(),
    catalogRows: rows.length,
    authors,
    platforms,
    categories,
    screenshotPrograms,
    screenshotFiles,
    archiveFiles,
    mirroredFiles: mirroredRows.length,
    mirroredSize,
    mirroredSizeLabel: formatBytes(mirroredSize),
    skippedLargeFiles: rows.filter((row) => row.download.status === "too-large").length,
    missingSourceFiles: mirrorStats.missing,
    matchedSourceFiles: mirrorStats.matched,
  };
}

function groupCounts(rows, getValue) {
  const counts = new Map();
  for (const row of rows) {
    const raw = getValue(row);
    const value = raw ? String(raw) : "Unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function primaryVersionName(value) {
  const match = String(value || "").match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? `AOL ${match[1]}` : "Mixed/unknown";
}

function fileExtensionName(file) {
  const extension = path.posix.extname(file || "").replace(".", "").toLowerCase();
  return extension ? extension.toUpperCase() : "Unknown";
}

function buildStats(rows) {
  const categoryStats = groupCounts(rows, (row) => row.category).map((item) => {
    const categoryRows = rows.filter((row) => row.category === item.name);
    const local = categoryRows.filter((row) => row.download.status === "ready").length;
    const screenshots = categoryRows.filter((row) => row.screenshotCount > 0).length;
    const size = categoryRows.reduce((sum, row) => sum + (row.download.size || 0), 0);
    return { ...item, local, screenshots, size, sizeLabel: formatBytes(size) };
  });

  const duplicateRows = rows.filter((row) => row.duplicates > 0).length;
  const duplicateRefs = rows.reduce((sum, row) => sum + (row.duplicates || 0), 0);
  const passwordRows = rows.filter((row) => row.password).length;
  const localRows = rows.filter((row) => row.download.status === "ready");
  const largestFiles = [...localRows]
    .sort((a, b) => (b.download.size || 0) - (a.download.size || 0))
    .slice(0, 20)
    .map((row) => ({
      name: row.name,
      category: row.category,
      platform: row.platform,
      size: row.download.size || 0,
      sizeLabel: row.download.sizeLabel || "",
      path: row.download.path,
    }));

  return {
    byCategory: categoryStats,
    byPlatform: groupCounts(rows, (row) => row.platform),
    byVersion: groupCounts(rows, (row) => primaryVersionName(row.versions)),
    byVisualBasic: groupCounts(rows, (row) => row.visualBasic || "Unknown"),
    byCompile: groupCounts(rows, (row) => row.compile || "Unknown"),
    byFileType: groupCounts(rows, (row) => fileExtensionName(row.file)),
    byDownloadStatus: groupCounts(rows, (row) => row.download.status),
    topAuthors: groupCounts(
      rows.filter((row) => row.author),
      (row) => row.author,
    ).slice(0, 30),
    largestFiles,
    quickFacts: {
      passwordRows,
      duplicateRows,
      duplicateRefs,
      localRows: localRows.length,
      remoteRows: rows.length - localRows.length,
      screenshotRows: rows.filter((row) => row.screenshotCount > 0).length,
    },
  };
}

async function main() {
  mkdirSync(path.join(rootDir, "data"), { recursive: true });
  if (copyFiles) mkdirSync(path.join(rootDir, "files"), { recursive: true });

  const rows = parseIndex();
  const tree = getTree();
  const mirrorStats = decorateRows(rows, tree);
  const skipManifest = loadSkipManifest();
  applySkipManifest(rows, skipManifest);
  hydrateExistingLocalFiles(rows);
  let copyStats = { copied: 0, skippedExisting: 0 };
  if (copyFiles) {
    copyStats = await copyReadyFilesOneByOne(rows);
  }
  saveSkipManifest(rows, skipManifest);
  for (const row of rows) {
    delete row.download.sha;
  }
  const justin = await getJustinData();
  const aolUndergroundShots = await getAolUndergroundShots();
  const research = buildStaticResearch();
  const summary = summarize(rows, mirrorStats, tree);
  const stats = buildStats(rows);

  const data = {
    summary,
    stats,
    programs: rows,
    research: {
      ...research,
      justin,
      aolUndergroundShots,
    },
  };

  const output = `window.AOL_PROGZ_DATA = ${JSON.stringify(data, null, 2)};\n`;
  writeFileSync(path.join(rootDir, "data", "catalog.js"), output, "utf8");
  writeFileSync(
    path.join(rootDir, "data", "catalog-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Built ${rows.length} catalog rows, mirrored ${summary.mirroredFiles} files (${summary.mirroredSizeLabel}), copied ${copyStats.copied} this run, matched ${summary.matchedSourceFiles} source blobs.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
