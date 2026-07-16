import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    name: "Oogle Rampage script tutorials",
    url: "https://web.archive.org/web/20001205033300/http://www.oogle.net/o_tutorial.htm",
    kind: "Rampage Toolz scripting/source lead",
    notes:
      "Oogle tutorial page for Rampage Toolz 2.0 and the Rampage Script SDK. Preserves SDK, tutorial DOC, Rampage Toolz, and Rampage Toolz 1.1 source links.",
  },
  {
    name: "Rampage Toolz 1.1 Source",
    url: "https://web.archive.org/web/20010119175900/http://www.oogle.net/rt1source/",
    kind: "Visual Basic source/tools",
    notes: "Oogle page for Rampage Toolz 1.1 source material and related source-code pages.",
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
    name: "Aciddr0p live site",
    url: "http://www.aciddr0p.net/",
    kind: "live prog/resource site",
    notes: "User-supplied Aciddr0p source, crawled for old-school AOL prog links, app details, screenshots, and download leads.",
  },
  {
    name: "Koin live site",
    url: "https://koin.org/",
    kind: "live resource site",
    notes: "User-supplied Koin source, crawled for AOL/AIM-era references, downloads, screenshots, and outbound leads.",
  },
  {
    name: "Rexflex live root",
    url: "https://progs.rexflex.net/",
    kind: "live prog archive",
    notes: "Rexflex root supplied by the user; crawled for app listings, download links, and mirrored old-school prog metadata.",
  },
  {
    name: "Digital5k AOL progz article",
    url: "https://adjkjc.github.io/www.digital5k.com/aol-progz-a-digital-throw-back-to-aol-1995/index.html",
    kind: "scene history article",
    notes:
      "Digital5k article with AOL prog history, named programs/authors, screenshots, and AOL version context for Digital Dynasty and related progs.",
  },
  {
    name: "AOLUnderground ProGGieS",
    url: "https://aolunderground.com/proggies/",
    kind: "scene index",
    notes:
      "AOLUnderground ProGGieS index with program names, missing-prog calls, category context, passwords, screenshots, and archive leads.",
  },
  {
    name: "JustinAKAPaste AOL/AIM Progs",
    url: "https://justinakapaste.com/category/aol-progs/",
    kind: "large web archive",
    notes:
      "JustinAKAPaste AOL/AIM Progs category with prog videos, screenshots, readme material, named tools, and author/context clues.",
  },
  {
    name: "JustinAKAPaste AOL/AIM Prog Read Mes",
    url: "https://justinakapaste.com/category/aolaim-prog-read-mes/",
    kind: "readme archive",
    notes:
      "JustinAKAPaste readme category with author, contact, feature, version, and usage-era clues for individual AOL/AIM progs.",
  },
  {
    name: "JustinAKAPaste AOL Progz tag",
    url: "https://justinakapaste.com/tag/aolprogz/",
    kind: "prog tag archive",
    notes: "JustinAKAPaste aolprogz tag page, retained for additional named prog/readme evidence.",
  },
  {
    name: "JustinAKAPaste AOL sites page 2",
    url: "https://justinakapaste.com/tag/aolsites/page/2/",
    kind: "AOL site archive",
    notes: "JustinAKAPaste AOL-sites tag page with old website and prog-scene source leads.",
  },
  {
    name: "JustinAKAPaste thanks",
    url: "https://justinakapaste.com/thanks/",
    kind: "archive provenance",
    notes: "JustinAKAPaste provenance page naming contributors and donated AOL/AIM files, screenshots, and site archives.",
  },
  {
    name: "Plozee AOL proggies history",
    url: "https://plozee.com/aol-proggies-and-punters-a-neglected-part-of-internet-history/",
    kind: "context article",
    notes:
      "Plozee context article for proggies, punters, room busters, mass mailers, idlers, macro/ASCII tools, and teen Visual Basic culture.",
  },
  {
    name: "Matt Mazur Revolution",
    url: "https://mattmazur.com/2009/05/13/revolution/",
    kind: "program recollection",
    notes: "Matt Mazur post mentioning Revolution and the AOL proggie vocabulary around laggers, punters, and faders.",
  },
  {
    name: "PatorJK Fate Zero",
    url: "https://patorjk.com/blog/2012/05/03/cracking-magus-fate-zero-encryption/",
    kind: "program recollection",
    notes: "PatorJK post and comments with Fate Zero, Seadoo, TacoBell Toolz, and related AOL proggie recollections.",
  },
  {
    name: "VBForums AOL prog project",
    url: "https://www.vbforums.com/showthread.php?105720-AOL-PROG-project=",
    kind: "developer forum context",
    notes: "VBForums discussion retained for historical program-name leads such as Eclypse and LensHell references.",
  },
  {
    name: "AnandTech DeadAIM request",
    url: "https://forums.anandtech.com/threads/can-someone-download-deadaim-and-send-it-to-me-via-aim.1036165/",
    kind: "AIM enhancement context",
    notes: "Forum thread showing DeadAIM distribution/availability context during the AIM era.",
  },
  {
    name: "AOL client and AIM version directory",
    url: "https://am.net/lib/TOOLS/AOL/",
    kind: "AOL/AIM client download directory",
    notes:
      "Live directory with AIM 4.x/5.x installers, AOL 1.x/2.x/6/7/8/9 setup files, file sizes, and dates. Used for AOL/AIM version download leads.",
  },
  {
    name: "Archive.org AOL creator software search",
    url: "https://archive.org/search?query=creator%3A%22AOL%22&page=3&and%5B%5D=mediatype%3A%22software%22",
    kind: "Archive.org software search",
    notes: "User-supplied Internet Archive search for AOL-created software items and client-version leads.",
  },
  {
    name: "Archive.org AOL software search",
    url: "https://archive.org/search?query=aol&page=2&and%5B%5D=mediatype%3A%22software%22",
    kind: "Archive.org software search",
    notes: "User-supplied Internet Archive search for AOL software items, AOL Gold, client CDs, and utility leads.",
  },
  {
    name: "Archive.org AIM AOL software search",
    url: "https://archive.org/search?query=AIM+aol&page=2&and%5B%5D=mediatype%3A%22software%22",
    kind: "Archive.org software search",
    notes: "User-supplied Internet Archive search for AIM/AOL software items, DeadAIM, and related utility leads.",
  },
  {
    name: "darcfx submissions repository",
    url: "https://github.com/darcfx/darcfx-submissions",
    kind: "GitHub source repository",
    notes: "User-supplied repository retained as a reference/source lead for old AOL/AIM submissions.",
  },
  {
    name: "Legacy AOL Underground repository",
    url: "https://github.com/DamianSuess/Legacy-AOL-Underground",
    kind: "GitHub mirror/fork",
    notes: "User-supplied Legacy AOL Underground repository, retained as a source and mirror lead.",
  },
  {
    name: "mikrodotnet AOL progz repository",
    url: "https://github.com/mikrodotnet/aol-progz",
    kind: "GitHub source repository",
    notes: "User-supplied AOL progz repository, crawled for file and provenance leads.",
  },
  {
    name: "LensHell GitHub README",
    url: "https://raw.githubusercontent.com/lekhanh1234/lenshell/refs/heads/main/README.md",
    kind: "GitHub source README",
    notes: "User-supplied LensHell README source, retained as context and a potential source lead.",
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
    name: "LensHell antis",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/antis.html",
    kind: "AOL anti tools",
    notes: "LensHell anti/anti-booter category page.",
  },
  {
    name: "LensHell busters",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/busters.html",
    kind: "room busters",
    notes: "LensHell room buster category page.",
  },
  {
    name: "LensHell c-coms",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/ccom.html",
    kind: "C-Com command lists",
    notes: "LensHell C-Com category page.",
  },
  {
    name: "LensHell crackers",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/crackers.html",
    kind: "historical cracker category",
    notes: "LensHell cracker category page, retained as historical provenance only.",
  },
  {
    name: "LensHell idlers",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/idle.html",
    kind: "idlers",
    notes: "LensHell idler category page.",
  },
  {
    name: "LensHell mailers and servers",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/mm-serv.html",
    kind: "mass mailers and servers",
    notes: "LensHell mass-mailer/server category page.",
  },
  {
    name: "LensHell misc progs A-M",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/progsa-m.html",
    kind: "misc progs A-M",
    notes: "LensHell miscellaneous progs A-M page.",
  },
  {
    name: "LensHell misc progs N-Z",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/progsn-z.html",
    kind: "misc progs N-Z",
    notes: "LensHell miscellaneous progs N-Z page.",
  },
  {
    name: "LensHell punters",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/punters.html",
    kind: "punters",
    notes: "LensHell punter category page, retained as historical provenance only.",
  },
  {
    name: "LensHell termers",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/termers.html",
    kind: "historical termer category",
    notes: "LensHell termer category page, retained as historical provenance only.",
  },
  {
    name: "LensHell xers",
    url: "https://web.archive.org/web/20111002114234/http://lenshellarchive.com/xer.html",
    kind: "ignore/xer tools",
    notes: "LensHell x'er/ignore-tool category page.",
  },
  {
    name: "LensHell AOL AIM Yahoo clients",
    url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/aim-aol.html",
    kind: "AOL/AIM/Yahoo client downloads",
    notes: "LensHell AOL/AIM/Yahoo client and messenger download page.",
  },
  {
    name: "LensHell runtime files",
    url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/files.html",
    kind: "runtime files",
    notes: "LensHell OCX/VBX/DLL runtime support files.",
  },
  {
    name: "LensHell Visual Basic",
    url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/vb.html",
    kind: "Visual Basic source/tools",
    notes: "LensHell Visual Basic section for source/developer files and prog-building context.",
  },
  {
    name: "LensHell miscellaneous files",
    url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/misc.html",
    kind: "misc files",
    notes: "LensHell miscellaneous archive page.",
  },
  {
    name: "LensHell descriptions",
    url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/descriptions.html",
    kind: "prog descriptions",
    notes: "LensHell description page for prog and category explanations.",
  },
  {
    name: "LensHell passwords",
    url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/passwords.html",
    kind: "archive passwords",
    notes: "LensHell password page retained for archive provenance.",
  },
  {
    name: "LensHell updates",
    url: "https://web.archive.org/web/20111001173231/http://lenshellarchive.com/updates.html",
    kind: "archive updates",
    notes: "LensHell update index used for source timeline and recovery leads.",
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
    name: "LoLToolz AIM progs",
    url: "https://web.archive.org/web/20021018083822/http://www.geocities.com/loltoolz/aim.htm",
    localPath: "docs/source-html/loltoolz-aim-progs.html",
    kind: "AIM progs local source snapshot",
    notes:
      "User-supplied LoLToolz AIM Progs HTML snapshot. Preserved locally so its AIM program rows and download filenames remain part of the GitHub archive.",
  },
  {
    name: "RiceJerry links",
    url: "https://web.archive.org/web/20010223212351/http://www.8op.com:80/ricejerry/links.html",
    kind: "link directory",
    notes: "RiceJerry links page with many old prog-site outbound links.",
  },
  {
    name: "ProgzRescue project",
    url: "https://github.com/raysuelzer/ProgzRescue",
    kind: "Wayback recovery project",
    notes: "Root ProgzRescue repository, retained as a reference for archived URL recovery lists.",
  },
  {
    name: "ProgzRescue archived URLs",
    url: "https://github.com/raysuelzer/ProgzRescue/tree/main/archived-urls",
    kind: "GitHub recovery lists",
    notes:
      "ProgzRescue archived-urls folder includes Angelfire, FortuneCity, and Geocities URL lists extracted from Wayback metadata.",
  },
  {
    name: "ProgzRescue README",
    url: "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/README.md",
    kind: "raw project notes",
    notes: "Raw README for ProgzRescue.",
  },
  {
    name: "ProgzRescue Angelfire files",
    url: "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-angelfire-files.txt",
    kind: "raw URL list",
    notes: "Large raw list of Angelfire ZIP/file URLs from ProgzRescue.",
  },
  {
    name: "ProgzRescue Geocities SiliconValley files",
    url: "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-geocities-silicon-valley-files.txt",
    kind: "raw URL list",
    notes: "Large raw list of Geocities SiliconValley ZIP/file URLs from ProgzRescue.",
  },
  {
    name: "ProgzRescue FortuneCity Skyscraper files",
    url: "https://raw.githubusercontent.com/raysuelzer/ProgzRescue/refs/heads/main/archived-urls/found-forune-city-skyscraper-files.txt",
    kind: "raw URL list",
    notes: "Large raw list of FortuneCity Skyscraper ZIP/file URLs from ProgzRescue.",
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
  {
    name: "Click-Online AOL 4/5 progz",
    url: "https://web.archive.org/web/20021015202014/http://click-online2000.com/aol45progz.htm",
    kind: "AOL 4/5 prog list",
    notes: "Click-Online AOL 4.0/5.0 prog listing supplied by the user, crawled for program details and download leads.",
  },
  {
    name: "Click-Online root",
    url: "https://web.archive.org/web/20021120062315/http://click-online2000.com/",
    kind: "old prog/resource site",
    notes: "Click-Online root capture supplied by the user.",
  },
  {
    name: "ColtPro root",
    url: "https://web.archive.org/web/20010923065731/http://www.coltpro.net/",
    kind: "old prog/resource site",
    notes: "ColtPro source supplied by the user, including missing DLL/OCX support file leads.",
  },
  {
    name: "Prig3k capture index",
    url: "https://web.archive.org/web/20260000000000*/http://www.prig3k.com/",
    kind: "Wayback capture index",
    notes: "Wayback capture index for Prig3k.",
  },
  {
    name: "Prig3k downloads category",
    url: "https://web.archive.org/web/20011109212659/http://www.prig3k.com/cgi-bin/free/dclinks.cgi?action=view_category&category=Downloads",
    kind: "download category",
    notes: "Prig3k download category supplied by the user.",
  },
  {
    name: "Dope2k index",
    url: "https://web.archive.org/web/20020601131248/http://www.8op.com/dope2k/index2.html",
    kind: "old prog/resource site",
    notes: "Dope2k 8op source supplied by the user.",
  },
  {
    name: "Hadez progs",
    url: "https://web.archive.org/web/20020611082332/http://dnx-online.net:80/~hadez/progs.html",
    kind: "prog list",
    notes: "DNX/Hadez progs page supplied by the user.",
  },
  {
    name: "DazuhProductionZ capture index",
    url: "https://web.archive.org/web/*/http://www.angelfire.com/fl4/DazuhProductionZ/*",
    kind: "Wayback capture index",
    notes: "Wayback capture index for DazuhProductionZ.",
  },
  {
    name: "AOElite capture index",
    url: "https://web.archive.org/web/*/http://www.aoelite.com/*",
    kind: "Wayback capture index",
    notes: "Wayback capture index for AOElite.",
  },
  {
    name: "DeadAIM about",
    url: "https://web.archive.org/web/20031206092015/http://www.jdennis.net/DeadAIM/about.php",
    kind: "AIM enhancement page",
    notes: "DeadAIM page supplied by the user; crawled for DeadAIM versions, features, screenshots, and download leads.",
  },
  {
    name: "AIMFilez files",
    url: "https://web.archive.org/web/20040405183602/http://aimfilez.com/?id=files1",
    kind: "AIM files",
    notes: "AIMFilez page supplied by the user, crawled for AIM tools, progs, screenshots, and download leads.",
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
  if (/^(?:data|whatsapp|tel|sms):/i.test(value)) return "";
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
  if (/\.(zip|rar|7z|sit|hqx|ace|arj|lzh|gz|tar|exe|dll|ocx|vbx|doc)(?:[?#]|$)/i.test(url)) {
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

function isNoisePageUrl(url) {
  const value = originalUrl(url);
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathName = parsed.pathname.toLowerCase();
    if (host === "github.com") {
      if (
        /^\/(?:login|signup|contact|topics|marketplace|features|pricing|explore)(?:\/|$)/.test(pathName) ||
        /\/(?:actions|issues|pulls|projects|security|pulse|branches|tags|discussions|commits|stargazers|forks|watchers|network|graphs|settings|notifications)(?:\/|$)/.test(
          pathName,
        )
      ) {
        return true;
      }
    }
    if (/(?:facebook|twitter|x|instagram|youtube|buymeacoffee|google)\.com$/.test(host)) return true;
    if (/\/wp-(?:json|admin|login)|\/feed\/?$|\/comments\/feed\/?$/.test(pathName)) return true;
    return false;
  } catch {
    return false;
  }
}

function isPotentialExternalLead(link, page, host, seedHosts) {
  if (!host || seedHosts.has(host)) return false;
  if (link.type === "page") return false;
  if (!/(link directory|scene index|large web archive|prog tag archive|readme archive|AOL site archive)/i.test(`${page.kind || ""} ${page.name || ""}`)) {
    return false;
  }
  return /(prog|tool|aol|aim|fader|punter|boot|room|buster|download|links|screenshot|skin|hell|server|mmer|macro|scroll|c-com|ccom|dead ?aim|methodus|fate|eclypse)/i.test(
    `${originalUrl(link.url)} ${link.text || ""} ${link.description || ""}`,
  );
}

function crawlUrlFor(link, page, seedHosts) {
  if (!link?.url || !["page", "prog resource", "link directory"].includes(link.type)) return false;
  const original = originalUrl(link.url);
  if (!/^https?:\/\//i.test(original)) return false;
  if (/\.(zip|rar|7z|sit|hqx|gif|png|jpe?g|bmp|webp|exe|dll|ocx|swf|doc)(?:$|[?#])/i.test(original)) return false;
  if (isNoisePageUrl(link.url)) return false;
  const host = hostOfOriginal(link.url);
  const related = /(prog|tool|aol|aim|fader|punter|boot|room|buster|download|links|screenshot|skin|methodus|hell|crack|server|mmer|macro|scroll|c-com|ccom|dead ?aim|eclypse|fate|revolution)/i.test(
    `${original} ${link.text}`,
  );
  if (!host || !related) return false;
  if (seedHosts.has(host)) return link.url;
  if (!isPotentialExternalLead(link, page, host, seedHosts)) return false;
  const info = waybackInfo(page.url);
  return info ? `https://web.archive.org/web/${info.timestamp}/${original}` : link.url;
}

async function fetchText(page) {
  if (typeof page === "object" && page.localPath) {
    const local = path.join(rootDir, page.localPath);
    if (!existsSync(local)) return { ok: false, status: 0, text: "", error: "local-file-missing" };
    return { ok: true, status: 200, text: readFileSync(local, "utf8"), localPath: page.localPath };
  }
  const url = typeof page === "object" ? page.url : page;
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

function tableRowContext(html, matchIndex) {
  const before = html.lastIndexOf("<tr", matchIndex);
  const after = html.indexOf("</tr>", matchIndex);
  if (before < 0 || after < 0 || after - before > 6000) return null;
  const rowHtml = html.slice(before, after + 5);
  const cells = [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)]
    .map((match) => decodeEntities(match[1]))
    .filter(Boolean);
  if (cells.length < 2) return null;
  return {
    cells,
    name: cells[0] || "",
    version: cells[1] || "",
    description: cells[2] || "",
    size: cells[3] || "",
  };
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
    const row = tableRowContext(html, match.index || 0);
    const rawText = decodeEntities(match[2]) || originalUrl(url);
    const text = /^download$/i.test(rawText) && row?.name ? `${row.name}${row.version ? ` ${row.version}` : ""}` : rawText;
    links.push({
      text,
      url,
      originalUrl: originalUrl(url),
      type: classify(url, text),
      description: row?.description || "",
      listedSize: row?.size || "",
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
  if (!/raw\.githubusercontent\.com\/raysuelzer\/ProgzRescue\/.*archived-urls/i.test(pageUrl)) {
    const visibleText = decodeEntities(html);
    if (visibleText.length < 300000) {
      const bareUrlRegex = /https?:\/\/[^\s"'<>()[\]{}]+/gi;
      for (const match of visibleText.matchAll(bareUrlRegex)) {
        const url = resolveHref(match[0].replace(/[.,;:!?]+$/g, ""), pageUrl);
        if (!url) continue;
        const key = linkKey(url);
        if (seen.has(key)) continue;
        seen.add(key);
        const original = originalUrl(url);
        links.push({
          text: original,
          url,
          originalUrl: original,
          type: classify(url, original),
        });
      }
    }
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
      localPath: page.localPath || "",
    };
    try {
      const fetched = await fetchText(page);
      result.ok = fetched.ok;
      result.status = fetched.status;
      result.localPath = fetched.localPath || page.localPath || "";
      result.title = extractTitle(fetched.text) || page.name;
      result.links = extractLinks(fetched.text, page.url);
      result.linkCount = result.links.length;
      result.downloadCount = result.links.filter((link) => link.type === "download").length;
      if (page.depth < crawlDepth) {
        for (const link of result.links) {
          const crawlUrl = crawlUrlFor(link, page, seedHosts);
          if (!crawlUrl) continue;
          const key = linkKey(crawlUrl);
          if (queued.has(key)) continue;
          queued.add(key);
          queue.push({
            name: link.text || originalUrl(link.url),
            url: crawlUrl,
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
