# AOL Progz

AOL Progz is a historical GitHub archive for old-school AOL/AIM-era proggies,
punters, room busters, scrollers, faders, bots, source packs, screenshots, old
download mirrors, and scene links.

The repo is being built in two layers:

- Plain GitHub archive: files, data, source reports, screenshots, URL indexes,
  and mirror metadata.
- Website view: a searchable static interface generated from the same data.

## Start browsing

- [Full GitHub documentation hub](docs/README.md)
- [Generated archive guide](docs/generated/README.md)
- [All applications](docs/generated/applications/all-applications.md)
- [Categories](docs/generated/categories/README.md)
- [AOL version buckets](docs/generated/versions/README.md)
- [Sources and old-school links](docs/generated/sources/README.md)
- [Screenshots and recovered web images](docs/generated/screenshots/README.md)
- [Glossary](docs/generated/GLOSSARY.md)
- [Archive safety notes](ARCHIVE-SAFETY.md)

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
