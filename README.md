<div align="center">

# AOL Progz

**A historical archive of AOL/AIM-era proggies, punters, room busters, faders,
idlers, scrollers, bots, source packs, old download mirrors, screenshots, and
scene links.**

![catalog](https://img.shields.io/badge/catalog-2,139%20apps-18d5d1)
![files](https://img.shields.io/badge/mirrored%20files-1,672-64dc8a)
![size](https://img.shields.io/badge/local%20archive-2.2GB-ffd34d)
![links](https://img.shields.io/badge/crawled%20links-6,707-7aa8ff)
![downloads](https://img.shields.io/badge/download%20links-3,450-ff5b8f)
![docs](https://img.shields.io/badge/generated%20docs-3,000%2B-lightgrey)

</div>

## Quick Doors

| Browse | What it shows |
| --- | --- |
| [Detailed all-progs inventory](docs/generated/applications/all-programs-detailed.md) | Every cataloged prog/app with actual name, archive filename, inferred prog type, category, AOL version, author, local file, source URL, embedded URLs, and screenshot count. |
| [Master all-links index](docs/generated/sources/all-links.md) | Deduped master list of user-supplied links, crawled links, download links, embedded archive URLs, mirrors, and source pages. |
| [Links you supplied](docs/generated/sources/user-supplied-links.md) | The priority source links from the request, preserved as their own page. |
| [Sources and old-school links](docs/generated/sources/README.md) | Curated source notes, crawled pages, mirror groups, missing candidates, Methodus2000, FreeProgz, LensHell, RiceJerry, LolToolz, and more. |
| [Categories](docs/generated/categories/README.md) | Punters, room busters, faders, idlers, C-Coms/chat tools, mailers, source packs, all-in-one progs, and uncategorized items. |
| [AOL version buckets](docs/generated/versions/README.md) | AOL 2.5, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, tools, and mixed/unknown buckets. |
| [Screenshots and recovered web images](docs/generated/screenshots/README.md) | Program screenshots plus recovered old-site images from crawled pages. |
| [Glossary](docs/generated/GLOSSARY.md) | Scene vocabulary for progs, punters, booters, room busters, C-Coms, faders, idlers, MMers, servers, crackers, phishers, termers, and X'ers. |
| [Archive safety notes](ARCHIVE-SAFETY.md) | Historical preservation warnings and safe-inspection guidance. |

## What Is Here

| Area | Count |
| --- | ---: |
| Main catalog applications | 2,139 |
| Mirrored main files | 1,672 |
| Mirrored archive size | 2.2 GB |
| Catalog author strings | 810 |
| Inferred categories | 12 |
| Programs with embedded URLs | 170 |
| URLs found in readable archive text | 234 |
| Crawled source pages | 156 |
| Unique crawled links | 6,707 |
| Crawled download links | 3,450 |
| Recovered external files | 238 |
| External mirror groups | 1,191 |
| Recovered web images | 60 |

The site includes:

- A searchable catalog generated from `ssstonebraker/aolunderground-proggies`.
- GitHub-readable generated documentation with one detail page per main catalog
  application.
- Local downloadable archive files under `files/` when the source blob can be
  mirrored within normal GitHub file-size limits.
- Screenshot-aware program cards when source screenshots are available.
- Old-school source links and Wayback links for AOLUnderground, JustinAKAPaste,
  HyPeR, Plozee, Kadeklizem, Aciddr0p, Koin, Rexflex, DarcFX, and ProgzRescue.
- Glossary and timeline context for AOL, AIM, ICQ, MSN Messenger, Yahoo, and
  related scene vocabulary.
- Statistics by category, platform, AOL version, Visual Basic version, file
  type, download status, author, local file coverage, screenshots, duplicates,
  passwords, and largest mirrored files.
- A deduplicated URL index for original sites, homepages, and download clues
  discovered in repository text and safely readable archive text.
- Crawled old resource pages and link directories, including FreeProgz,
  RiceJerry, LolToolz, LensHellArchive, Methodus2000, Oogle, ProgStation,
  AimThings, CoolKid/Text2k, and related Wayback captures.
- Missing-candidate reports comparing old download links against the main
  catalog, with mirror URLs and recovered local files where available.

## Safety note

This is a historical research archive. Do not run unknown binaries on your real
machine. Use an isolated vintage VM or emulator if you need to inspect old
software behavior.

Some archived tools were associated with abuse or account compromise in their
original era. This project preserves names, files, screenshots, and context, but
does not provide operating instructions for harming services or users.

## Rebuild

The builder expects a local Git object copy of the source archive:

```powershell
$env:AOL_SOURCE_REPO = "D:/AOL-Progz-Source"
node tools/build-catalog.mjs
```

To rebuild metadata only without copying archive files:

```powershell
$env:AOL_COPY_FILES = "0"
node tools/build-catalog.mjs
```

To scan mirrored ZIPs for original URLs without executing anything:

```powershell
$env:AOL_URL_SCAN_LIMIT = "250"
node tools/scan-urls.mjs
```

Run the URL scanner repeatedly to continue from the existing `data/url-index.json`.

To crawl old resource/link pages:

```powershell
$env:AOL_RESOURCE_CRAWL_DEPTH = "1"
$env:AOL_RESOURCE_MAX_PAGES = "260"
node tools/collect-web-resources.mjs
```

To mirror page images/screenshots:

```powershell
$env:AOL_WEB_ASSET_LIMIT = "500"
node tools/mirror-web-assets.mjs
```

To mirror filtered recovered files and preserve mirror groups:

```powershell
$env:AOL_EXTERNAL_DOWNLOAD_LIMIT = "120"
node tools/download-external-files.mjs
```

To rebuild missing-candidate reports:

```powershell
node tools/build-missing-candidates.mjs
```

To rebuild the GitHub-readable documentation pages:

```powershell
node tools/build-github-docs.mjs
```

## GitHub Pages

The plain GitHub archive is the primary deliverable right now. The repository is
larger than normal GitHub Pages recommendations, so the Pages workflow is manual
only and should be used after splitting or slimming the published website view.
