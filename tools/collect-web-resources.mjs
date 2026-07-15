import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const outJson = path.join(rootDir, "data", "web-resources.json");
const outJs = path.join(rootDir, "data", "web-resources.js");
const maxPages = Number(process.env.AOL_RESOURCE_MAX_PAGES || 260);
const crawlDepth = Number(process.env.AOL_RESOURCE_CRAWL_DEPTH || 1);

const pages = [
  {
    name: "FreeProgz main",
    url: "https://web.archive.org/web/20010516214202/http://www.freeprogz.com/",
    kind: "AOL prog index",
    notes:
      "PHAT's Free Progz listed AOL needs, progs, AIM/ICQ, Macintosh, miscellaneous files, and a server-status count.",
  },
  {
    name: "FreeProgz links",
    url: "https://web.archive.org/web/20010603213502/http://www.freeprogz.com/links.htm",
    kind: "link directory",
    notes: "Old FreeProgz links page with scene links, topsites, hosting, and sponsor links.",
  },
  {
    name: "Oogle AIM progs",
    url: "https://web.archive.org/web/20010424150235/http://www.oogle.net/d_aimprogs.htm",
    kind: "AIM downloads",
    notes: "AIM progs download page captured by Wayback.",
  },
  {
    name: "AOL-Progz.com",
    url: "https://web.archive.org/web/20010301094602/http://www.aol-progz.com:80/",
    kind: "AOL prog portal",
    notes: "Old AOL-Progz.com entry page.",
  },
  {
    name: "Angelfire progz directory",
    url: "https://web.archive.org/web/20250000000000*/http://www.angelfire.com/in3/progz/",
    kind: "Wayback capture index",
    notes: "Wayback capture index for an Angelfire progz directory.",
  },
  {
    name: "Prog.net",
    url: "https://web.archive.org/web/20020601170723/http://www.prog.net/",
    kind: "user supplied URL",
    notes: "Included as supplied; capture appears to be a prog/progressive review site rather than an AOL proggie archive.",
  },
  {
    name: "AimThings",
    url: "https://web.archive.org/web/20030623040448/http://aimthings.com/",
    kind: "AIM files and tricks",
    notes: "AIMThings navigation included AIM files, tricks, profiles, IM abuse, themes, buddy icons, pranks, and links.",
  },
  {
    name: "Titan Spaceports progs",
    url: "https://web.archive.org/web/20010504044037/http://titan.spaceports.com/~info/progs2.htm",
    kind: "prog list",
    notes: "Old Spaceports-hosted progs page captured by Wayback.",
  },
  {
    name: "Rexflex live prog endpoint",
    url: "https://progs.rexflex.net/prog",
    kind: "live endpoint",
    notes: "Live endpoint supplied by the user; the root site is kept separately as a source.",
  },
  {
    name: "LensHellArchive index",
    url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/Index.html",
    kind: "prog archive hub",
    notes:
      "LensHell described itself as an AOL/AIM/Yahoo prog archive and requested submissions with prog name, type, supported AOL/AIM/Yahoo and Windows versions, and a screenshot.",
  },
  {
    name: "LensHell AIM progs",
    url: "https://web.archive.org/web/20111002120811/http://lenshellarchive.com/aim.html",
    kind: "AIM progs",
    notes: "LensHell AIM progs category page.",
  },
  {
    name: "LensHell hells/progs",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/hell.html",
    kind: "AOL progs and categories",
    notes: "LensHell category page for progs, faders, cracks, and related categories.",
  },
  {
    name: "LensHell faders",
    url: "https://web.archive.org/web/20110904002536/http://lenshellarchive.com/faders.html",
    kind: "faders",
    notes: "LensHell faders category page.",
  },
  {
    name: "ProgStation AIM",
    url: "https://web.archive.org/web/20010221023818/http://progstation.hypermart.net:80/aim.html",
    kind: "AIM progs",
    notes: "Old Hypermart AIM progs page.",
  },
  {
    name: "PHAT secrets",
    url: "https://web.archive.org/web/20000611162712/http://solo5.abac.com/phat/secrets.htm",
    kind: "AIM/AOL secrets",
    notes: "PHAT-era secrets page.",
  },
  {
    name: "LolToolz progs",
    url: "https://web.archive.org/web/20021018083822/http://www.geocities.com:80/loltoolz/progs.html",
    kind: "prog download page",
    notes: "Geocities LolToolz progs page.",
  },
  {
    name: "RiceJerry links",
    url: "https://web.archive.org/web/20010223212351/http://www.8op.com:80/ricejerry/links.html",
    kind: "link directory",
    notes: "RiceJerry links page with many old prog-site outbound links.",
  },
  {
    name: "ProgzRescue archived URLs",
    url: "https://github.com/raysuelzer/ProgzRescue/tree/main/archived-urls",
    kind: "GitHub recovery lists",
    notes:
      "ProgzRescue archived-urls folder includes Angelfire, FortuneCity, and Geocities URL lists extracted from Wayback metadata.",
  },
  {
    name: "ProgzRescue Angelfire files",
    url: "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-angelfire-files.txt",
    kind: "raw URL list",
    notes: "Large raw list of Angelfire ZIP/file URLs from ProgzRescue.",
  },
  {
    name: "FreeProgz capture index",
    url: "https://web.archive.org/web/20250000000000*/http://www.freeprogz.com/",
    kind: "Wayback capture index",
    notes: "Wayback capture index for FreeProgz.",
  },
  {
    name: "CoolKid CCT",
    url: "https://web.archive.org/web/20010428185554/http://coolkid.text2k.net/programs/cct/",
    kind: "program page",
    notes: "CoolKid/Text2k CCT program directory.",
  },
  {
    name: "CoolKid SP how-to",
    url: "https://web.archive.org/web/20010514020453/http://coolkid.text2k.net/programs/sp/howto.html",
    kind: "how-to page",
    notes: "CoolKid/Text2k SP how-to page, retained as historical context only.",
  },
  {
    name: "Methodus2000 NetBus page",
    url: "https://web.archive.org/web/20010111011900/http://www.methodus2000.com:80/methodustoolz/netbus.htm",
    kind: "historical remote-control patch page",
    notes:
      "Methodus Toolz page about NetBus-era patch files. Tracked for historical provenance only; no operating instructions are included.",
  },
  {
    name: "Methodus Toolz directory",
    url: "https://web.archive.org/web/20001109010900/http://www.methodus2000.com:80/methodustoolz/",
    kind: "Methodus Toolz archive",
    notes:
      "Methodus Toolz directory capture with download, features, screenshots, skins, and making-progz pages.",
  },
  {
    name: "Methodus Toolz screenshots",
    url: "https://web.archive.org/web/20010119035500/http://www.methodus2000.com:80/methodustoolz/screenshots.htm",
    kind: "screenshots",
    notes:
      "Methodus Toolz screenshot page, useful for local image mirroring and version/feature research.",
  },
  {
    name: "Methodus Toolz features",
    url: "https://web.archive.org/web/20001210191700/http://www.methodus2000.com:80/methodustoolz/features.htm",
    kind: "features",
    notes: "Methodus Toolz feature page.",
  },
  {
    name: "Methodus Toolz downloads",
    url: "https://web.archive.org/web/20001109201900/http://www.methodus2000.com:80/methodustoolz/download.htm",
    kind: "downloads",
    notes: "Methodus Toolz download page.",
  },
];

function decodeEntities(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function waybackInfo(url) {
  const match = String(url).match(/https?:\/\/web\.archive\.org\/web\/([^/]+)\/(https?:\/\/.*)$/i);
  if (!match) return null;
  return { timestamp: match[1], original: match[2] };
}

function resolveHref(href, pageUrl) {
  if (!href) return "";
  let value = href.trim();
  if (!value || value.startsWith("#") || /^javascript:/i.test(value)) return "";
  if (/^mailto:/i.test(value)) return value;
  if (value.startsWith("//")) value = `https:${value}`;
  if (/^https?:\/\/web\.archive\.org\/web\//i.test(value)) return value;
  if (value.startsWith("/web/")) return `https://web.archive.org${value}`;
  if (/^https?:\/\//i.test(value)) return value;

  const info = waybackInfo(pageUrl);
  if (info) {
    try {
      const originalResolved = new URL(value, info.original).href;
      return `https://web.archive.org/web/${info.timestamp}/${originalResolved}`;
    } catch {
      return "";
    }
  }

  try {
    return new URL(value, pageUrl).href;
  } catch {
    return "";
  }
}

function originalUrl(url) {
  const info = waybackInfo(url);
  return info?.original || url;
}

function canonicalOriginalUrl(url) {
  let value = originalUrl(url);
  if (/^mailto:/i.test(value)) return value.toLowerCase();
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
      parsed.port = "";
    }
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.pathname = parsed.pathname
      .replace(/\/(?:index|default|home)\.(?:html?|php|asp)$/i, "/")
      .replace(/\/+$/g, "/");
    const params = [...parsed.searchParams.entries()].filter(([key]) => !/^utm_/i.test(key));
    parsed.search = "";
    for (const [key, val] of params.sort(([a], [b]) => a.localeCompare(b))) {
      parsed.searchParams.append(key, val);
    }
    return parsed.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return value.replace(/\/$/, "").toLowerCase();
  }
}

function linkKey(url) {
  return canonicalOriginalUrl(url);
}

function classify(url, text) {
  const value = `${url} ${text}`.toLowerCase();
  if (/\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx)(?:[?#]|$)/i.test(url)) {
    return "download";
  }
  if (/\.(gif|png|jpe?g|bmp|webp)(?:[?#]|$)/i.test(url)) return "image";
  if (/topsites|links|affiliates|free-for-all/.test(value)) return "link directory";
  if (/prog|toolz|aol|aim|fader|punter|hell|download/.test(value)) return "prog resource";
  return "page";
}

function hostOfOriginal(url) {
  try {
    return new URL(originalUrl(url)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isRelatedPage(link, seedHosts) {
  if (!link?.url || !["page", "prog resource", "link directory"].includes(link.type)) return false;
  const original = originalUrl(link.url);
  if (!/^https?:\/\//i.test(original)) return false;
  if (/\.(zip|rar|7z|sit|hqx|gif|png|jpe?g|bmp|webp|exe|dll|ocx|swf)(?:$|[?#])/i.test(original)) return false;
  const host = hostOfOriginal(link.url);
  if (!host || !seedHosts.has(host)) return false;
  return /(prog|tool|aol|aim|fader|punter|boot|room|buster|download|links|screenshot|skin|methodus|hell|crack|server|mmer|macro|scroll|c-com|ccom)/i.test(
    `${original} ${link.text}`,
  );
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "AOL-Progz-resource-collector/1.0" },
    });
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder("windows-1252");
    return { ok: response.ok, status: response.status, text: decoder.decode(buffer) };
  } finally {
    clearTimeout(timer);
  }
}

function extractLinks(html, pageUrl) {
  const seen = new Set();
  const links = [];
  const anchorRegex = /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchorRegex)) {
    const url = resolveHref(match[1], pageUrl);
    if (!url) continue;
    const key = linkKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const text = decodeEntities(match[2]) || originalUrl(url);
    links.push({
      text,
      url,
      originalUrl: originalUrl(url),
      type: classify(url, text),
    });
  }
  const imageRegex = /<img\b[^>]*(?:src|data-src)\s*=\s*["']?([^"'\s>]+)[^>]*>/gi;
  for (const match of html.matchAll(imageRegex)) {
    const url = resolveHref(match[1], pageUrl);
    if (!url) continue;
    const key = linkKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    const file = originalUrl(url).split("/").pop() || "image";
    links.push({
      text: file,
      url,
      originalUrl: originalUrl(url),
      type: "image",
    });
  }
  return links;
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities(match?.[1] || "");
}

async function main() {
  const pageResults = [];
  const globalSeen = new Set();
  const allLinks = [];
  const queue = pages.map((page) => ({ ...page, depth: 0, seed: true }));
  const queued = new Set(queue.map((page) => linkKey(page.url)));
  const seedHosts = new Set(pages.map((page) => hostOfOriginal(page.url)).filter(Boolean));

  for (let i = 0; i < queue.length && pageResults.length < maxPages; i += 1) {
    const page = queue[i];
    let result = {
      ...page,
      title: "",
      ok: false,
      status: 0,
      linkCount: 0,
      downloadCount: 0,
      links: [],
      error: "",
    };
    try {
      const fetched = await fetchText(page.url);
      result.ok = fetched.ok;
      result.status = fetched.status;
      result.title = extractTitle(fetched.text) || page.name;
      result.links = extractLinks(fetched.text, page.url);
      result.linkCount = result.links.length;
      result.downloadCount = result.links.filter((link) => link.type === "download").length;
      if (page.depth < crawlDepth) {
        for (const link of result.links) {
          if (!isRelatedPage(link, seedHosts)) continue;
          const key = linkKey(link.url);
          if (queued.has(key)) continue;
          queued.add(key);
          queue.push({
            name: link.text || originalUrl(link.url),
            url: link.url,
            kind: link.type,
            notes: `Discovered from ${page.name}`,
            depth: page.depth + 1,
            seed: false,
          });
        }
      }
      for (const link of result.links) {
        const key = linkKey(link.url);
        if (globalSeen.has(key)) continue;
        globalSeen.add(key);
        allLinks.push({
          ...link,
          pageName: page.name,
          pageUrl: page.url,
        });
      }
    } catch (error) {
      result.error = error.message;
    }
    pageResults.push(result);
  }

  const byType = {};
  for (const link of allLinks) byType[link.type] = (byType[link.type] || 0) + 1;

  const data = {
    generatedAt: new Date().toISOString(),
    pageCount: pageResults.length,
    seedPageCount: pages.length,
    fetchedPages: pageResults.filter((page) => page.ok).length,
    linkCount: allLinks.length,
    downloadCount: allLinks.filter((link) => link.type === "download").length,
    byType,
    pages: pageResults,
    links: allLinks.sort((a, b) => a.type.localeCompare(b.type) || a.text.localeCompare(b.text)),
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  writeFileSync(outJson, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  writeFileSync(outJs, `window.AOL_PROGZ_WEB_RESOURCES = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(
    `Collected ${data.linkCount} unique links from ${data.fetchedPages}/${data.pageCount} pages, including ${data.downloadCount} downloads.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
