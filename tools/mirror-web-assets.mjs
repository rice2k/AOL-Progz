import { mkdirSync, existsSync, createWriteStream, readFileSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const webResourcesPath = path.join(rootDir, "data", "web-resources.json");
const outJson = path.join(rootDir, "data", "web-assets.json");
const outJs = path.join(rootDir, "data", "web-assets.js");
const limit = Number(process.env.AOL_WEB_ASSET_LIMIT || 250);
const maxMb = Number(process.env.AOL_WEB_ASSET_MAX_MB || 10);
const timeoutMs = Number(process.env.AOL_WEB_ASSET_TIMEOUT_MS || 25000);

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/[_\s.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 140) || "asset";
}

function originalFromWayback(url) {
  const match = String(url).match(/https?:\/\/web\.archive\.org\/web\/[^/]+\/(https?:\/\/.*)$/i);
  return match?.[1] || url;
}

function imageReplayUrl(url) {
  const match = String(url).match(/^(https?:\/\/web\.archive\.org\/web\/)(\d+)(?:[a-z_]+)?\/(https?:\/\/.*)$/i);
  if (!match) return url;
  return `${match[1]}${match[2]}im_/${match[3]}`;
}

function canonicalUrl(url) {
  try {
    const parsed = new URL(originalFromWayback(url));
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return parsed.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

function targetFor(link) {
  const original = originalFromWayback(link.url);
  const parsed = new URL(original);
  const extension = path.posix.extname(parsed.pathname).toLowerCase() || ".jpg";
  const host = slugify(parsed.hostname.replace(/^www\./, ""));
  const base = slugify(path.posix.basename(parsed.pathname, extension));
  return `assets/web-resources/${host}/${base}${extension}`;
}

function isLikelyArchiveAsset(link) {
  const original = originalFromWayback(link.url);
  let parsed;
  try {
    parsed = new URL(original);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const full = `${host}${parsed.pathname}`.toLowerCase();
  if (/(githubusercontent|go2net|akamai|doubleclick|advert|banner|ads\/)/.test(full)) return false;
  return /(methodus2000|methodus\.atfreeweb|lenshellarchive|freeprogz|oogle\.net|aol-progz|aimthings|spaceports|hypermart|geocities|8op\.com|coolkid|text2k|angelfire|rexflex|aciddr0p|koin)/.test(
    full,
  );
}

function assetPriority(link) {
  const original = originalFromWayback(link.url).toLowerCase();
  const text = String(link.text || "").toLowerCase();
  if (/methodus2000|methodus\.atfreeweb|methimages|methodus\.bizland/.test(original)) return 0;
  if (/screenshots?|screen|main|fader|macro|phish|netbus|skin/.test(`${original} ${text}`)) return 1;
  if (/freeprogz|oogle\.net|aol-progz|aimthings|geocities|8op\.com|coolkid|text2k/.test(original)) return 2;
  if (/lenshellarchive\/images\/\d+\.png/.test(original)) return 9;
  return 5;
}

function readExisting() {
  if (!existsSync(outJson)) return { assets: [] };
  try {
    return JSON.parse(readFileSync(outJson, "utf8"));
  } catch {
    return { assets: [] };
  }
}

async function downloadAsset(link) {
  const localPath = targetFor(link);
  const target = path.join(rootDir, localPath);
  if (existsSync(target) && statSync(target).size > 0) {
    return { ...link, localPath, status: "ready", size: statSync(target).size };
  }
  mkdirSync(path.dirname(target), { recursive: true });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const temp = `${target}.tmp`;
  let size = 0;
  try {
    const response = await fetch(imageReplayUrl(link.url), {
      signal: controller.signal,
      headers: { "user-agent": "AOL-Progz-web-asset-mirror/1.0" },
    });
    if (!response.ok) return { ...link, localPath: "", status: `http-${response.status}`, size: 0 };
    const contentType = response.headers.get("content-type") || "";
    if (!/image|octet-stream/i.test(contentType)) {
      return { ...link, localPath: "", status: "not-image", size: 0 };
    }
    const out = createWriteStream(temp);
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxMb * 1024 * 1024) {
        out.destroy();
        return { ...link, localPath: "", status: "too-large", size };
      }
      out.write(chunk);
    }
    await new Promise((resolve) => out.end(resolve));
    await import("node:fs").then(({ renameSync }) => renameSync(temp, target));
    return { ...link, localPath, status: "ready", size };
  } catch (error) {
    return { ...link, localPath: "", status: error.name === "AbortError" ? "timeout" : "failed", size };
  } finally {
    clearTimeout(timer);
    try {
      if (existsSync(temp)) await import("node:fs").then(({ unlinkSync }) => unlinkSync(temp));
    } catch {
      // Safe to ignore stale temp cleanup.
    }
  }
}

function writeOutput(assets) {
  const byStatus = {};
  for (const asset of assets) byStatus[asset.status] = (byStatus[asset.status] || 0) + 1;
  const data = {
    generatedAt: new Date().toISOString(),
    assetCount: assets.length,
    readyCount: assets.filter((asset) => asset.status === "ready").length,
    byStatus,
    assets,
  };
  writeFileSync(outJson, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(outJs, `window.AOL_PROGZ_WEB_ASSETS = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(`Web assets: ${data.readyCount}/${data.assetCount} ready.`);
}

async function main() {
  const web = JSON.parse(readFileSync(webResourcesPath, "utf8"));
  const existing = readExisting().assets || [];
  const byKey = new Map(existing.map((asset) => [canonicalUrl(asset.url), asset]));
  const imageLinks = (web.links || [])
    .filter((link) => link.type === "image" && isLikelyArchiveAsset(link))
    .sort((a, b) => assetPriority(a) - assetPriority(b));
  let attempted = 0;

  for (const link of imageLinks) {
    const key = canonicalUrl(link.url);
    const previous = byKey.get(key);
    if (previous?.status === "ready") continue;
    if (limit && attempted >= limit) break;
    attempted += 1;
    const result = await downloadAsset(link);
    if (previous) Object.assign(previous, result);
    else byKey.set(key, result);
  }

  writeOutput([...byKey.values()]);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
