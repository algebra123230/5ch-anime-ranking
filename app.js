// Renders the ranking table once; toolbar toggles rewrite each cell's title and link in place.
const CONTROLS = { lang: ["ja", "romaji", "en"], links: ["mal", "anilist"] };
// Elements applyState rewrites; set from renderTable's result (may not be in the document yet).
let view = { cellLinks: [], rankHeaders: [] };

// --- State (lives in the URL query) -------------------------------------

function readState() {
  const params = new URLSearchParams(location.search);
  return Object.fromEntries(Object.entries(CONTROLS).map(([name, values]) => {
    const value = params.get(name);
    return [name, values.includes(value) ? value : values[0]];
  }));
}

function setControl(name, value) {
  const params = new URLSearchParams(location.search); // keep any other params
  params.set(name, value);
  history.replaceState(null, "", `?${params}`);
  applyState(readState());
}

// Japanese text gets lang="ja" so browsers pick a Japanese (not Chinese) font.
function setLang(node, ja) {
  if (ja) node.lang = "ja";
  else node.removeAttribute("lang");
}

function applyState(state) {
  const { lang, links } = state;
  const ja = lang === "ja";
  for (const [name, value] of Object.entries(state)) {
    for (const btn of document.querySelectorAll(`[data-control="${name}"] button`)) {
      btn.setAttribute("aria-pressed", String(btn.dataset.value === value));
    }
  }
  const h1 = document.querySelector("h1");
  h1.textContent = ja ? h1.dataset.ja : h1.dataset.en;
  setLang(h1, ja);
  for (const th of view.rankHeaders) {
    th.textContent = ja ? `${th.dataset.rank}位` : th.dataset.rank;
    setLang(th, ja);
  }
  for (const { a, cell, show } of view.cellLinks) {
    const title = { ja: cell.title_ja, romaji: show.title_romaji, en: show.title_en ?? show.title_romaji }[lang];
    a.firstChild.textContent = title;
    a.title = title;
    setLang(a, ja);
    const anilistId = links === "anilist" ? show.anilist_id : null;
    a.href = anilistId ? `https://anilist.co/anime/${anilistId}` : `https://myanimelist.net/anime/${cell.id}`;
    a.classList.toggle("fallback", links === "anilist" && !anilistId);
  }
}

// --- Rendering ------------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function rankClass(rank) {
  if (rank <= 3) return `rank-${rank}`;
  return rank <= 10 ? "band-a" : rank <= 20 ? "band-b" : "band-c";
}

// Returns the table plus the elements applyState rewrites.
function renderTable({ cells, anime }) {
  const years = [...new Set(cells.map((c) => c.year))].sort((a, b) => a - b);
  const ranks = [...new Set(cells.map((c) => c.rank))].sort((a, b) => a - b);
  const byKey = new Map(cells.map((c) => [`${c.year}-${c.rank}`, c]));
  const cellLinks = [];
  const rankHeaders = [];

  const head = el("tr", {}, [el("th", { className: "corner" }), ...years.map((y) => el("th", { scope: "col", textContent: y }))]);
  const rows = ranks.map((rank) => {
    const th = el("th", { scope: "row", className: `rank ${rankClass(rank)}` });
    th.dataset.rank = rank;
    rankHeaders.push(th);
    return el("tr", {}, [th, ...years.map((year) => {
      const cell = byKey.get(`${year}-${rank}`);
      const a = el("a", { target: "_blank", rel: "noopener" }, [el("span")]);
      cellLinks.push({ a, cell, show: anime[cell.id] });
      const td = el("td", {}, [a]);
      Object.assign(td.dataset, { year, rank });
      return td;
    })]);
  });
  const table = el("table", { className: "ranking" }, [el("thead", {}, [head]), el("tbody", {}, rows)]);
  return { table, cellLinks, rankHeaders };
}

// --- Startup ----------------------------------------------------------------

for (const group of document.querySelectorAll("[data-control]")) {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) setControl(group.dataset.control, btn.dataset.value);
  });
}
applyState(readState()); // toolbar buttons, before the data arrives

try {
  const res = await fetch("data/anime.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { table, ...elements } = renderTable(await res.json());
  view = elements;
  applyState(readState()); // fill the cells; re-reads the URL in case a toggle was clicked during load
  document.getElementById("table-wrap").replaceChildren(table); // last, so #status survives any error above
} catch (err) {
  console.error(err);
  document.getElementById("status").textContent = "Couldn't load the ranking data. Try reloading the page.";
}
