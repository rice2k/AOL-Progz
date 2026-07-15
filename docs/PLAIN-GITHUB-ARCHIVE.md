# Plain GitHub Archive Layout

This repository is organized so GitHub itself can act as the primary archive,
even when the website view is too large for normal GitHub Pages hosting.

## Main folders

- `files/aol/` and `files/aim/`: mirrored files from the main AOL Underground
  catalog.
- `files/external/`: additional recovered files from Wayback, ProgzRescue URL
  lists, and old link/download pages.
- `assets/screenshots/`: screenshots mirrored from the main catalog source.
- `assets/web-resources/`: screenshots and page images recovered from old web
  resource pages.
- `data/catalog.js`: complete searchable catalog used by the website.
- `data/catalog-summary.json`: top-level counts.
- `data/url-index.json`: original URLs found inside safely readable archive
  text files.
- `data/web-resources.json`: crawled old-page links, download links, images,
  and source-page metadata.
- `data/external-downloads.json`: recovered external download attempts, ready
  files, statuses, and mirror groups.
- `data/source-reports/`: source-specific research reports, such as
  Methodus2000.
- `docs/sources/`: human-readable source notes.

## Mirror groups

`data/external-downloads.json` includes `mirrorGroups`, which groups repeated
file names and multiple source URLs together. This preserves the original URLs
without showing them as accidental duplicates.

## Safety

Some AOL-era archives include abuse tools, prankware, password theft tools,
remote-control/trojan-era material, and broken executables. This repo preserves
historical files and metadata, but does not include operating instructions.

Do not run anything from the archive on a real machine.
