const data = window.AOL_PROGZ_DATA;
const urlIndex = window.AOL_PROGZ_URL_INDEX || {
  scannedPrograms: 0,
  programsWithUrls: 0,
  perProgram: {},
  repoText: [],
  global: [],
};
const webResources = window.AOL_PROGZ_WEB_RESOURCES || {
  pageCount: 0,
  fetchedPages: 0,
  linkCount: 0,
  downloadCount: 0,
  pages: [],
  links: [],
};
const webAssets = window.AOL_PROGZ_WEB_ASSETS || {
  assetCount: 0,
  readyCount: 0,
  assets: [],
};
const externalDownloads = window.AOL_PROGZ_EXTERNAL_DOWNLOADS || {
  sourceListCount: 0,
  candidateCount: 0,
  downloadCount: 0,
  readyCount: 0,
  sourceLists: [],
  downloads: [],
};
const missingCandidates = window.AOL_PROGZ_MISSING_CANDIDATES || {
  candidateCount: 0,
  readyCandidateCount: 0,
  candidates: [],
};

const state = {
  query: "",
  category: "all",
  platform: "all",
  version: "all",
  sort: "screens",
  screensOnly: false,
  localFilesOnly: false,
  limit: 60,
};

const els = {
  statGrid: document.querySelector("#statGrid"),
  searchInput: document.querySelector("#searchInput"),
  categorySelect: document.querySelector("#categorySelect"),
  platformSelect: document.querySelector("#platformSelect"),
  versionSelect: document.querySelector("#versionSelect"),
  sortSelect: document.querySelector("#sortSelect"),
  screensOnly: document.querySelector("#screensOnly"),
  localFilesOnly: document.querySelector("#localFilesOnly"),
  clearFilters: document.querySelector("#clearFilters"),
  resultCount: document.querySelector("#resultCount"),
  programGrid: document.querySelector("#programGrid"),
  loadMore: document.querySelector("#loadMore"),
  fileLedger: document.querySelector("#fileLedger"),
  externalSummary: document.querySelector("#externalSummary"),
  externalGrid: document.querySelector("#externalGrid"),
  missingSummary: document.querySelector("#missingSummary"),
  missingGrid: document.querySelector("#missingGrid"),
  categoryStats: document.querySelector("#categoryStats"),
  platformStats: document.querySelector("#platformStats"),
  versionStats: document.querySelector("#versionStats"),
  authorStats: document.querySelector("#authorStats"),
  largestFiles: document.querySelector("#largestFiles"),
  shotStrip: document.querySelector("#shotStrip"),
  historyCards: document.querySelector("#historyCards"),
  glossaryGrid: document.querySelector("#glossaryGrid"),
  timelineList: document.querySelector("#timelineList"),
  sourceGrid: document.querySelector("#sourceGrid"),
  webResourceSummary: document.querySelector("#webResourceSummary"),
  webPageGrid: document.querySelector("#webPageGrid"),
  webLinkGrid: document.querySelector("#webLinkGrid"),
  urlSummary: document.querySelector("#urlSummary"),
  urlGrid: document.querySelector("#urlGrid"),
};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function text(value, fallback = "Unknown") {
  return value ? String(value) : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Original URL";
  }
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }),
  );
}

function primaryVersion(value) {
  const match = String(value || "").match(/\b(\d+(?:\.\d+)?)\b/);
  return match ? match[1] : "mixed";
}

function setupStats() {
  const summary = data.summary;
  const items = [
    ["Catalog rows", summary.catalogRows],
    ["Local files", summary.mirroredFiles],
    ["Mirrored size", summary.mirroredSizeLabel],
    ["External files", externalDownloads.readyCount || 0],
    ["Missing leads", missingCandidates.candidateCount || 0],
    ["Authors", summary.authors],
    ["Screenshot files", summary.screenshotFiles],
    ["Web images", webAssets.readyCount || 0],
    ["Source archives", data.research.sourceCollections.length],
  ];
  els.statGrid.innerHTML = items
    .map(
      ([label, value]) => `
        <div>
          <dt>${escapeHtml(label)}</dt>
          <dd>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</dd>
        </div>
      `,
    )
    .join("");

  const ledger = [
    ["Mirrored", summary.mirroredFiles],
    ["External", externalDownloads.readyCount || 0],
    ["Archive size", summary.mirroredSizeLabel],
    ["Matched source blobs", summary.matchedSourceFiles],
    ["Skipped large", summary.skippedLargeFiles],
  ];
  els.fileLedger.innerHTML = ledger
    .map(
      ([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${typeof value === "number" ? formatNumber(value) : escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join("");
}

function setupFilters() {
  const categories = uniqueSorted(data.programs.map((program) => program.category));
  const platforms = uniqueSorted(data.programs.map((program) => program.platform));
  const versions = uniqueSorted(data.programs.map((program) => primaryVersion(program.versions)));

  fillSelect(els.categorySelect, "All categories", categories);
  fillSelect(els.platformSelect, "All platforms", platforms);
  fillSelect(els.versionSelect, "All versions", versions);

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value.trim().toLowerCase();
    state.limit = 60;
    renderCatalog();
  });
  els.categorySelect.addEventListener("change", () => {
    state.category = els.categorySelect.value;
    state.limit = 60;
    renderCatalog();
  });
  els.platformSelect.addEventListener("change", () => {
    state.platform = els.platformSelect.value;
    state.limit = 60;
    renderCatalog();
  });
  els.versionSelect.addEventListener("change", () => {
    state.version = els.versionSelect.value;
    state.limit = 60;
    renderCatalog();
  });
  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    renderCatalog();
  });
  els.screensOnly.addEventListener("change", () => {
    state.screensOnly = els.screensOnly.checked;
    state.limit = 60;
    renderCatalog();
  });
  els.localFilesOnly.addEventListener("change", () => {
    state.localFilesOnly = els.localFilesOnly.checked;
    state.limit = 60;
    renderCatalog();
  });
  els.clearFilters.addEventListener("click", () => {
    Object.assign(state, {
      query: "",
      category: "all",
      platform: "all",
      version: "all",
      sort: "screens",
      screensOnly: false,
      localFilesOnly: false,
      limit: 60,
    });
    els.searchInput.value = "";
    els.categorySelect.value = "all";
    els.platformSelect.value = "all";
    els.versionSelect.value = "all";
    els.sortSelect.value = "screens";
    els.screensOnly.checked = false;
    els.localFilesOnly.checked = false;
    renderCatalog();
  });
  els.loadMore.addEventListener("click", () => {
    state.limit += 60;
    renderCatalog();
  });
}

function renderStats() {
  if (!data.stats) return;
  const categoryRows = data.stats.byCategory || [];
  els.categoryStats.innerHTML = [
    `<div class="stats-row header"><span>Category</span><span>Total</span><span>Files</span><span>Screens</span><span>Size</span></div>`,
    ...categoryRows.map(
      (item) => `
        <div class="stats-row">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${formatNumber(item.count)}</span>
          <span>${formatNumber(item.local)}</span>
          <span>${formatNumber(item.screenshots)}</span>
          <span>${escapeHtml(item.sizeLabel)}</span>
        </div>
      `,
    ),
  ].join("");

  renderBars(els.platformStats, data.stats.byPlatform, 8);
  renderBars(els.versionStats, data.stats.byVersion, 10);
  renderBars(els.authorStats, data.stats.topAuthors, 12);
  els.largestFiles.innerHTML = (data.stats.largestFiles || [])
    .slice(0, 12)
    .map(
      (item) => `
        <a class="largest-row" href="${escapeHtml(item.path)}" download>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.sizeLabel)}</span>
        </a>
      `,
    )
    .join("");
}

function renderBars(container, items = [], limit = 10) {
  const visible = items.slice(0, limit);
  const max = Math.max(...visible.map((item) => item.count), 1);
  container.innerHTML = visible
    .map(
      (item) => `
        <div class="bar-item">
          <div class="bar-top">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${formatNumber(item.count)}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${Math.max(4, (item.count / max) * 100)}%"></div>
          </div>
        </div>
      `,
    )
    .join("");
}

function fillSelect(select, label, options) {
  select.innerHTML = [
    `<option value="all">${escapeHtml(label)}</option>`,
    ...options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`),
  ].join("");
}

function filteredPrograms() {
  const filtered = data.programs.filter((program) => {
    if (state.query && !program.search.includes(state.query)) return false;
    if (state.category !== "all" && program.category !== state.category) return false;
    if (state.platform !== "all" && program.platform !== state.platform) return false;
    if (state.version !== "all" && primaryVersion(program.versions) !== state.version) return false;
    if (state.screensOnly && !program.screenshotCount) return false;
    if (state.localFilesOnly && program.download.status !== "ready") return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (state.sort === "name") return a.name.localeCompare(b.name, undefined, { numeric: true });
    if (state.sort === "author") {
      return text(a.author, "zzzz").localeCompare(text(b.author, "zzzz"), undefined, {
        numeric: true,
      });
    }
    if (state.sort === "size") return (b.download.size || 0) - (a.download.size || 0);
    if (state.sort === "index") return a.index - b.index;
    return (
      b.screenshotCount - a.screenshotCount ||
      (b.download.size || 0) - (a.download.size || 0) ||
      a.name.localeCompare(b.name)
    );
  });
}

function renderCatalog() {
  const programs = filteredPrograms();
  const visible = programs.slice(0, state.limit);
  els.resultCount.textContent = `${formatNumber(programs.length)} matching programs`;
  els.loadMore.hidden = visible.length >= programs.length;
  els.programGrid.innerHTML = visible.map(renderProgramCard).join("");
}

function renderProgramCard(program) {
  const firstShot = program.screenshots?.[0];
  const shotHtml = firstShot
    ? `<a href="${escapeHtml(firstShot.rawUrl)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(firstShot.rawUrl)}" loading="lazy" alt="Screenshot for ${escapeHtml(program.name)}" /></a>`
    : `<div class="no-shot">NO SCREENSHOT</div>`;
  const download =
    program.download.status === "ready" && program.download.path
      ? `<a class="download" href="${escapeHtml(program.download.path)}" download>Download file</a>`
      : "";
  const raw =
    program.download.originalUrl
      ? `<a href="${escapeHtml(program.download.originalUrl)}" target="_blank" rel="noreferrer">Source path</a>`
      : "";
  const wayback = `<a href="https://web.archive.org/web/*/${encodeURIComponent(program.name)}" target="_blank" rel="noreferrer">Wayback search</a>`;
  const programUrls = (urlIndex.perProgram?.[program.id]?.urls || []).slice(0, 4);
  const urlLinks = programUrls
    .map(
      (item) =>
        `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(hostLabel(item.url))}</a>`,
    )
    .join("");

  return `
    <article class="program-card">
      <div class="program-shot">${shotHtml}</div>
      <div class="program-body">
        <div class="program-title">
          <h3>${escapeHtml(program.name)}</h3>
          <span class="badge yellow">${escapeHtml(program.platform)}</span>
        </div>
        <div class="meta">
          <div><span>Author</span><strong>${escapeHtml(text(program.author))}</strong></div>
          <div><span>Version</span><strong>${escapeHtml(text(program.versions, "Mixed"))}</strong></div>
          <div><span>VB</span><strong>${escapeHtml(text(program.visualBasic))}</strong></div>
          <div><span>Size</span><strong>${escapeHtml(text(program.download.sizeLabel, "n/a"))}</strong></div>
        </div>
        <div class="tags">
          <span class="tag">${escapeHtml(program.category)}</span>
          ${program.compile ? `<span class="tag">${escapeHtml(program.compile)}</span>` : ""}
          ${program.password ? `<span class="tag">password: ${escapeHtml(program.password)}</span>` : ""}
          ${program.screenshotCount ? `<span class="tag">${program.screenshotCount} screens</span>` : ""}
        </div>
        <div class="program-links">
          ${download}
          ${raw}
          ${urlLinks}
          ${wayback}
        </div>
      </div>
    </article>
  `;
}

function renderShots() {
  const catalogShots = data.programs
    .flatMap((program) =>
      (program.screenshots || []).slice(0, 2).map((shot) => ({
        title: program.name,
        url: shot.rawUrl,
        sourceUrl: shot.sourceUrl,
      })),
    )
    .slice(0, 24);

  const pageShots = data.research.aolUndergroundShots.map((shot, index) => ({
    title: `AOLUnderground scene image ${index + 1}`,
    url: shot.url,
    sourceUrl: shot.url,
  }));
  const mirroredWebShots = (webAssets.assets || [])
    .filter((asset) => asset.status === "ready")
    .slice(0, 48)
    .map((asset) => ({
      title: asset.text || asset.pageName || "Web resource image",
      url: asset.localPath,
      sourceUrl: asset.url,
    }));

  els.shotStrip.innerHTML = [...catalogShots, ...mirroredWebShots, ...pageShots]
    .slice(0, 72)
    .map(
      (shot) => `
        <a href="${escapeHtml(shot.sourceUrl)}" target="_blank" rel="noreferrer" title="${escapeHtml(shot.title)}">
          <img src="${escapeHtml(shot.url)}" loading="lazy" alt="${escapeHtml(shot.title)}" />
        </a>
      `,
    )
    .join("");
}

function renderResearch() {
  const featured = data.research.featuredExternalPrograms;
  const justinCategories = data.research.justin.categories.slice(0, 8).map((category) => ({
    name: category.name,
    source: "JustinAKAPaste",
    category: `${formatNumber(category.count)} posts`,
    notes: "Live WordPress category count pulled for this archive build.",
    url: category.url,
  }));
  els.historyCards.innerHTML = [...featured, ...justinCategories]
    .map(
      (item) => `
        <article class="history-card">
          <span class="badge">${escapeHtml(item.category)}</span>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.notes)}</p>
          <div class="card-links">
            ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.source)}</a>` : `<span>${escapeHtml(item.source)}</span>`}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderGlossary() {
  els.glossaryGrid.innerHTML = data.research.glossary
    .map(
      (item) => `
        <article class="glossary-card">
          <span class="badge">${escapeHtml(item.type)}</span>
          <h3>${escapeHtml(item.term)}</h3>
          <p>${escapeHtml(item.description)}</p>
        </article>
      `,
    )
    .join("");
}

function renderTimeline() {
  els.timelineList.innerHTML = data.research.timeline
    .map(
      (item) => `
        <li>
          <div class="year">${escapeHtml(item.year)}</div>
          <div>
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.description)}</p>
            <div class="card-links">
              <a href="${escapeHtml(item.source)}" target="_blank" rel="noreferrer">Source</a>
            </div>
          </div>
        </li>
      `,
    )
    .join("");
}

function renderSources() {
  els.sourceGrid.innerHTML = data.research.sourceCollections
    .map(
      (source) => `
        <article class="source-card">
          <span class="kind">${escapeHtml(source.kind)}</span>
          <h3>${escapeHtml(source.name)}</h3>
          <p>${escapeHtml(source.notes)}</p>
          <div class="card-links">
            <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">Open</a>
            ${source.wayback ? `<a href="${escapeHtml(source.wayback)}" target="_blank" rel="noreferrer">Wayback</a>` : ""}
            ${source.originalUrl ? `<a href="${escapeHtml(source.originalUrl)}" target="_blank" rel="noreferrer">Original</a>` : ""}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderExternalDownloads() {
  if (!els.externalSummary || !els.externalGrid) return;
  els.externalSummary.innerHTML = [
    ["Source lists", externalDownloads.sourceListCount || 0],
    ["Candidates", externalDownloads.candidateCount || 0],
    ["Mirror groups", externalDownloads.mirrorGroupCount || 0],
    ["Ready files", externalDownloads.readyCount || 0],
  ]
    .map(
      ([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${formatNumber(value)}</strong>
        </div>
      `,
    )
    .join("");

  const downloads = (externalDownloads.downloads || [])
    .filter((item) => item.status === "ready")
    .slice(0, 120);
  els.externalGrid.innerHTML = downloads.length
    ? downloads
        .map(
          (item) => `
            <article class="source-card">
              <span class="kind">${escapeHtml(item.sourceList || "external")}</span>
              <h3>${escapeHtml(item.name || hostLabel(item.originalUrl))}</h3>
              <p>${escapeHtml(item.originalUrl)}</p>
              <div class="card-links">
                <a href="${escapeHtml(item.localPath)}" download>Download file</a>
                <a href="${escapeHtml(item.waybackUrl)}" target="_blank" rel="noreferrer">Wayback</a>
              </div>
            </article>
          `,
        )
        .join("")
    : `<article class="source-card"><span class="kind">pending</span><h3>No external downloads yet</h3><p>Run the external downloader to pull filtered Wayback/GitHub-list files into the collection.</p></article>`;
}

function renderMissingCandidates() {
  if (!els.missingSummary || !els.missingGrid) return;
  const ready = missingCandidates.readyCandidateCount || 0;
  const total = missingCandidates.candidateCount || 0;
  const mirrorTotal = (missingCandidates.candidates || []).reduce(
    (sum, item) => sum + (item.mirrorCount || 0),
    0,
  );
  const hazardous = (missingCandidates.candidates || []).filter((item) =>
    /hazardous|account|remote/i.test(item.category || ""),
  ).length;
  els.missingSummary.innerHTML = [
    ["Candidates", total],
    ["Recovered", ready],
    ["Mirror URLs", mirrorTotal],
    ["Hazardous context", hazardous],
  ]
    .map(
      ([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${formatNumber(value)}</strong>
        </div>
      `,
    )
    .join("");

  els.missingGrid.innerHTML = (missingCandidates.candidates || [])
    .slice(0, 160)
    .map((item) => {
      const firstMirror = item.mirrors?.[0];
      const firstFile = item.readyLocalFiles?.[0];
      return `
        <article class="source-card">
          <span class="kind">${escapeHtml(item.category || "candidate")}</span>
          <h3>${escapeHtml(item.fileName)}</h3>
          <p>${formatNumber(item.mirrorCount || 0)} mirror URL${(item.mirrorCount || 0) === 1 ? "" : "s"} found${firstMirror ? `: ${escapeHtml(firstMirror.url)}` : ""}</p>
          <div class="card-links">
            ${firstFile ? `<a href="${escapeHtml(firstFile)}" download>Download file</a>` : ""}
            ${firstMirror ? `<a href="${escapeHtml(firstMirror.waybackUrl || firstMirror.url)}" target="_blank" rel="noreferrer">Open mirror</a>` : ""}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderWebResources() {
  if (!els.webResourceSummary || !els.webPageGrid || !els.webLinkGrid) return;
  els.webResourceSummary.innerHTML = [
    ["Pages tracked", webResources.pageCount || 0],
    ["Fetched", webResources.fetchedPages || 0],
    ["Unique links", webResources.linkCount || 0],
    ["Download links", webResources.downloadCount || 0],
  ]
    .map(
      ([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${formatNumber(value)}</strong>
        </div>
      `,
    )
    .join("");

  els.webPageGrid.innerHTML = (webResources.pages || [])
    .map(
      (page) => `
        <article class="source-card">
          <span class="kind">${escapeHtml(page.kind || "page")}</span>
          <h3>${escapeHtml(page.name)}</h3>
          <p>${escapeHtml(page.notes || page.title || "")}</p>
          <div class="card-links">
            <a href="${escapeHtml(page.url)}" target="_blank" rel="noreferrer">Open</a>
            <span>${formatNumber(page.linkCount || 0)} links</span>
            <span>${formatNumber(page.downloadCount || 0)} files</span>
          </div>
        </article>
      `,
    )
    .join("");

  els.webLinkGrid.innerHTML = (webResources.links || [])
    .slice(0, 180)
    .map(
      (link) => `
        <article class="source-card">
          <span class="kind">${escapeHtml(link.type || "link")}</span>
          <h3>${escapeHtml(link.text || hostLabel(link.url))}</h3>
          <p>${escapeHtml(link.pageName || link.originalUrl)}</p>
          <div class="card-links">
            <a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">Open archived</a>
            <a href="${escapeHtml(link.originalUrl)}" target="_blank" rel="noreferrer">Original</a>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderUrlProvenance() {
  const scanned = urlIndex.scannedPrograms || 0;
  const withUrls = urlIndex.programsWithUrls || 0;
  const unique = urlIndex.global?.length || 0;
  const repoText = urlIndex.repoText?.length || 0;
  els.urlSummary.innerHTML = [
    ["Scanned programs", scanned],
    ["Programs with URLs", withUrls],
    ["Unique URLs", unique],
    ["Repo text links", repoText],
  ]
    .map(
      ([label, value]) => `
        <div>
          <span>${escapeHtml(label)}</span>
          <strong>${formatNumber(value)}</strong>
        </div>
      `,
    )
    .join("");

  const links = (urlIndex.global || []).slice(0, 120);
  els.urlGrid.innerHTML = links.length
    ? links
        .map(
          (item) => `
            <article class="source-card">
              <span class="kind">${escapeHtml(item.source || "url")}</span>
              <h3>${escapeHtml(item.programName || item.sourcePath || item.url)}</h3>
              <p>${escapeHtml(item.url)}</p>
              <div class="card-links">
                <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Open URL</a>
              </div>
            </article>
          `,
        )
        .join("")
    : `<article class="source-card"><span class="kind">pending</span><h3>No URL scan data yet</h3><p>Run the URL scanner to populate original sites and download clues.</p></article>`;
}

function init() {
  if (!data) {
    document.body.innerHTML = "<main><h1>Catalog data missing.</h1></main>";
    return;
  }
  setupStats();
  setupFilters();
  renderStats();
  renderCatalog();
  renderShots();
  renderResearch();
  renderGlossary();
  renderTimeline();
  renderSources();
  renderExternalDownloads();
  renderMissingCandidates();
  renderWebResources();
  renderUrlProvenance();
}

init();
