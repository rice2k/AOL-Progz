<div align="center">

# AOL Progz

**A GitHub-first historical archive for AOL/AIM-era proggies, punters, room busters, faders, idlers, scrollers, bots, source packs, original links, recovered mirrors, screenshots, and scene research.**

<p align="center"><img alt="catalog: 2,139 apps" src="https://img.shields.io/badge/catalog-2%2C139%20apps-18D5D1?style=for-the-badge&labelColor=101820"></p>
<p align="center"><img alt="recovered files: 2,743" src="https://img.shields.io/badge/recovered%20files-2%2C743-64DC8A?style=for-the-badge&labelColor=101820"> <img alt="archive size: 3.2 GB" src="https://img.shields.io/badge/archive%20size-3.2%20GB-FFD34D?style=for-the-badge&labelColor=101820"></p>
<p align="center"><img alt="old URLs: 19,133" src="https://img.shields.io/badge/old%20URLs-19%2C133-FF5B8F?style=for-the-badge&labelColor=101820"> <img alt="master links: 39,794" src="https://img.shields.io/badge/master%20links-39%2C794-7AA8FF?style=for-the-badge&labelColor=101820"></p>
<p align="center"><img alt="author evidence: 65 strong" src="https://img.shields.io/badge/author%20evidence-65%20strong-BB8CFF?style=for-the-badge&labelColor=101820"> <img alt="source files: 2,918 indexed" src="https://img.shields.io/badge/source%20files-2%2C918%20indexed-E7EDF7?style=for-the-badge&labelColor=101820"></p>

</div>

## Start Here

| Page | Why it matters |
| --- | --- |
| [Master progs table](docs/generated/applications/all-progs-master.md) | One table with actual/best-known name, category, prog type, AOL/AIM version clues, author evidence, local file, URLs, screenshots, and review flags. |
| [Detailed all-progs inventory](docs/generated/applications/all-programs-detailed.md) | The full researcher-facing inventory for every cataloged prog/app. |
| [Authors and crews](docs/generated/authors/README.md) | Strong author evidence separated from weak catalog/filename claims so mirror repos do not get false creator credit. |
| [Original download URLs](docs/generated/sources/original-download-urls.md) | Deduped original URLs, Wayback URLs, recovered local files, and matched program pages. |
| [Master all-links index](docs/generated/sources/all-links.md) | Every user-supplied link, crawled source page, embedded archive URL, mirror lead, image URL, and source-code URL. |
| [Recovered files](docs/generated/sources/recovered-files.md) | All local archive files, external recoveries, runtime files, utilities, screenshots/images, hashes, and source URLs. |
| [External ZIP text evidence](docs/generated/sources/external-archive-text.md) | Readme/source/NFO evidence mined from recovered external ZIPs for authors, descriptions, versions, and URLs. |
| [Reference source-code tree](docs/generated/sources/reference-source-code.md) | AOL-era VB/source/help/control files indexed by AOL version bucket with recovered import candidates. |
| [Categories](docs/generated/categories/README.md) | Punters, room busters, faders, idlers, C-Coms, AIM tools, source packs, all-in-one progs, runtimes, and unknowns. |
| [Metadata confidence](docs/generated/applications/metadata-confidence.md) | Shows which fields are confirmed, inferred, catalog-only, or still need manual review. |
| [Research priority queue](docs/generated/applications/research-priority.md) | A practical cleanup queue for author gaps, source gaps, old URLs, screenshots, and category/type fixes. |
| [Glossary](docs/generated/GLOSSARY.md) | Historical AOL/AIM scene vocabulary with context and safety notes. |

## Current Archive Stats

| Metric | Value |
| --- | --- |
| Main catalog applications | 2,139 |
| Generated GitHub Markdown pages | 2,300+ |
| GitHub working-tree size | 3.2 GB |
| Files directory size | 2.9 GB |
| Data directory size | 197.9 MB |
| Docs directory size | 85.4 MB |
| Mirrored main catalog files | 1672 |
| Mirrored main catalog size | 2.2 GB |
| Recovered external files | 686 |
| Recovered local file records | 2,743 |
| External ZIPs scanned for text | 490 |
| External ZIPs with readable text | 294 |
| External ZIPs with author clues | 89 |
| External ZIPs with purpose clues | 238 |
| External ZIPs with AOL/AIM version clues | 51 |
| Programs with strong author evidence | 65 |
| Weak catalog/filename author claims | 788 |
| Deduped original/download URLs | 19,133 |
| Master deduped links | 39,794 |
| Crawled source pages | 1502 |
| Crawled download links | 6258 |
| Missing/recovery candidates | 3149 |
| Recovered missing candidates | 424 |
| Recovered web images | 168 |
| Archive.org AOL/AIM software items | 173 |
| Reference source-code files indexed | 2918 |
| Reference source import candidates | 105 |

## What This Archive Is Doing

- Preserving local files when they can be recovered within normal GitHub file-size limits.
- Recording original download URLs, Wayback URLs, mirror URLs, source-page URLs, and embedded homepage/contact links without deduplicating away history.
- Separating actual author evidence from reference mirrors and weak catalog labels.
- Scanning readable text inside ZIPs for names, versions, descriptions, source URLs, and category clues without running old binaries.
- Keeping AOL/AIM clients, DeadAIM/AIM enhancers, runtime DLL/OCX files, Winamp skins, source code, and classic AOL progs in separate research lanes.

## Safety Note

This is a historical preservation archive. Do not run unknown binaries on your real machine. Use an isolated vintage VM or emulator for inspection. Abuse-related categories are documented as historical vocabulary and metadata only, not as operating instructions.

## Rebuild

The generated GitHub documentation comes from the local data and recovered files:

```powershell
$env:AOL_SOURCE_REPO = "D:/AOL-Progz-Source"
node tools/build-catalog.mjs
node tools/scan-archive-text-metadata.mjs
node tools/scan-urls.mjs
node tools/scan-external-archive-text.mjs
node tools/build-program-enrichment.mjs
node tools/build-github-docs.mjs
```
