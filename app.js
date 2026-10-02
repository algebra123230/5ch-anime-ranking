// Renders the ranking table once; applyState redraws every cell from the URL state and the loaded list.
import {
  STATUSES, ListError, parseAniListUser, loadAniList, parseMalFile, formatScore, encodeMalList, decodeMalList, sourceLabel,
} from "./lists.js";
import { summarize, summaryText } from "./summary.js";

const CONTROLS = { lang: ["ja", "romaji", "en"], links: ["mal", "anilist"] };
// Elements applyState rewrites; set from renderTable's result (may not be in the document yet).
let view = { cells: [], cellViews: [], rankHeaders: [], yearCounts: new Map() };
let list = null; // the list named by the URL (?anilist= or ?mal=, see lists.js) once loaded, or null
const data = fetch("data/anime.json").then((res) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

const $ = (selector) => document.querySelector(selector);

// --- State (lives in the URL query) -------------------------------------

function readState() {
  const params = new URLSearchParams(location.search);
  const state = Object.fromEntries(Object.entries(CONTROLS).map(([name, values]) => {
    const value = params.get(name);
    return [name, values.includes(value) ? value : values[0]];
  }));
  state.hidden = new Set((params.get("hide") ?? "").split(",").filter((s) => STATUSES.includes(s)));
  state.scores = params.get("scores") !== "0";
  return state;
}

// Sets (string) or removes (null) URL params, keeping the others, then redraws.
function updateUrl(changes) {
  const params = new URLSearchParams(location.search);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) params.delete(name);
    else params.set(name, value);
  }
  const query = String(params);
  history.replaceState(null, "", query ? `?${query}` : location.pathname);
  applyState(readState());
}

// Japanese text gets lang="ja" so browsers pick a Japanese (not Chinese) font.
function setLang(node, ja) {
  if (ja) node.lang = "ja";
  else node.removeAttribute("lang");
}

function applyState(state) {
  const { lang, links, hidden, scores } = state;
  const ja = lang === "ja";
  for (const name of Object.keys(CONTROLS)) {
    for (const btn of document.querySelectorAll(`[data-control="${name}"] button`)) {
      btn.setAttribute("aria-pressed", String(btn.dataset.value === state[name]));
    }
  }
  const h1 = $("h1");
  h1.textContent = ja ? h1.dataset.ja : h1.dataset.en;
  setLang(h1, ja);
  for (const th of view.rankHeaders) {
    th.textContent = ja ? `${th.dataset.rank}位` : th.dataset.rank;
    setLang(th, ja);
  }

  for (const { td, a, badge, cell, show } of view.cellViews) {
    const title = { ja: cell.title_ja, romaji: show.title_romaji, en: show.title_en ?? show.title_romaji }[lang];
    a.firstChild.textContent = title;
    a.title = title;
    setLang(a, ja);
    const anilistId = links === "anilist" ? show.anilist_id : null;
    a.href = anilistId ? `https://anilist.co/anime/${anilistId}` : `https://myanimelist.net/anime/${cell.id}`;
    a.classList.toggle("fallback", links === "anilist" && !anilistId);

    const entry = list?.entries.get(cell.id);
    const shown = entry && !hidden.has(entry.status);
    td.className = shown ? `s-${entry.status}` : list ? "faded" : "";
    badge.textContent = shown && scores ? formatScore(entry.score, list.scoreFormat) : "";
  }

  const summary = list && view.cells.length ? summarize(list, view.cells) : null; // null until the list and data both load
  for (const [year, span] of view.yearCounts) {
    const { completed, size } = summary?.byYear.get(year) ?? {};
    span.textContent = summary ? `${completed}/${size}` : "";
    span.parentElement.title = summary ? `${completed} of ${size} completed` : "";
  }
  $("#list-bar").hidden = !list;
  if (list) $("#list-name").textContent = `${sourceLabel(list)}: ${list.name}`;
  for (const box of document.querySelectorAll("[data-status]")) {
    box.checked = !hidden.has(box.dataset.status);
    box.parentElement.querySelector(".count").textContent = `(${summary?.counts[box.dataset.status] ?? 0})`;
  }
  $("#open-summary").disabled = !summary;
  $("#show-scores").checked = scores;
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
  const cellViews = [];
  const rankHeaders = [];
  const yearCounts = new Map();

  const head = el("tr", {}, [el("th", { className: "corner" }), ...years.map((year) => {
    const count = el("span", { className: "year-count" });
    yearCounts.set(year, count);
    const th = el("th", { scope: "col" }, [String(year), count]);
    th.dataset.year = year;
    return th;
  })]);
  const rows = ranks.map((rank) => {
    const th = el("th", { scope: "row", className: `rank ${rankClass(rank)}` });
    th.dataset.rank = rank;
    rankHeaders.push(th);
    return el("tr", {}, [th, ...years.map((year) => {
      const cell = byKey.get(`${year}-${rank}`);
      const a = el("a", { target: "_blank", rel: "noopener" }, [el("span")]);
      const badge = el("span", { className: "score" });
      const td = el("td", {}, [a, badge]);
      Object.assign(td.dataset, { year, rank });
      cellViews.push({ td, a, badge, cell, show: anime[cell.id] });
      return td;
    })]);
  });
  const table = el("table", { className: "ranking" }, [el("thead", {}, [head]), el("tbody", {}, rows)]);
  return { table, cells, cellViews, rankHeaders, yearCounts };
}

// --- Loading a list ---------------------------------------------------------

function showError(node, message) {
  node.textContent = message;
  node.hidden = !message;
}

// Shows label on node (a button, or a hidden status line) and disables it while run() is pending.
async function whileBusy(node, label, run) {
  const { textContent, hidden } = node;
  Object.assign(node, { textContent: label, hidden: false, disabled: true });
  try {
    return await run();
  } finally {
    Object.assign(node, { textContent, hidden, disabled: false });
  }
}

// Runs load(); returns its list, or null after showing the error in errorNode.
async function tryLoad(errorNode, load) {
  showError(errorNode, "");
  try {
    return await load();
  } catch (err) {
    if (!(err instanceof ListError)) console.error(err);
    showError(errorNode, err instanceof ListError ? err.message : "Something went wrong loading the list.");
    return null;
  }
}

function wireDialog() {
  const dialog = $("#load-dialog");
  const tabs = { anilist: $("#tab-anilist"), mal: $("#tab-mal") };
  for (const [name, tab] of Object.entries(tabs)) {
    tab.addEventListener("click", () => {
      for (const [other, otherTab] of Object.entries(tabs)) {
        otherTab.setAttribute("aria-selected", String(other === name));
        $(`#panel-${other}`).hidden = other !== name;
      }
    });
  }
  $("#open-load").addEventListener("click", () => {
    for (const node of document.querySelectorAll("#load-error, #load-dialog .error")) showError(node, "");
    dialog.showModal();
  });

  const form = $("#panel-anilist");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submit = form.querySelector("button[type=submit]");
    const loaded = await whileBusy(submit, "Loading…", () =>
      tryLoad(form.querySelector(".error"), () => loadAniList(parseAniListUser($("#anilist-name").value))));
    if (!loaded) return;
    list = loaded;
    updateUrl({ anilist: loaded.name, mal: null });
    dialog.close();
  });

  $("#mal-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = ""; // allow picking the same file again after an error
    if (!file) return;
    const loaded = await whileBusy($("#panel-mal .busy"), "Reading file…", () =>
      tryLoad($("#panel-mal .error"), async () => {
        const mal = await parseMalFile(file);
        return { list: mal, code: await encodeMalList(mal, (await data).cells) };
      }));
    if (!loaded) return;
    list = loaded.list;
    updateUrl({ mal: loaded.code, anilist: null });
    dialog.close();
  });
}

function wireSummary() {
  const dialog = $("#summary-dialog");
  const status = $("#copy-status");
  $("#open-summary").addEventListener("click", () => {
    $("#summary-text").value = summaryText(summarize(list, view.cells), list, location.href);
    status.textContent = "";
    dialog.showModal();
  });
  $("#copy-summary").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("#summary-text").value); // clipboard is undefined on insecure origins
      status.textContent = "Copied.";
    } catch {
      status.textContent = "Couldn't copy. Select the text and copy it.";
    }
  });
}

function wireListBar() {
  const boxes = [...document.querySelectorAll("[data-status]")];
  for (const box of boxes) {
    box.addEventListener("change", () => {
      const hidden = boxes.filter((b) => !b.checked).map((b) => b.dataset.status);
      updateUrl({ hide: hidden.length ? hidden.join(",") : null });
    });
  }
  $("#show-scores").addEventListener("change", (e) => updateUrl({ scores: e.target.checked ? null : "0" }));
  $("#clear-list").addEventListener("click", () => {
    list = null;
    updateUrl({ anilist: null, mal: null, hide: null, scores: null });
  });
}

function listParams() {
  const params = new URLSearchParams(location.search);
  return { name: params.get("anilist"), code: params.get("mal") };
}

// On page load: the list named by the URL.
async function restoreList() {
  const { name, code } = listParams();
  if (!name && !code) return;
  const loaded = await whileBusy($("#load-status"), name ? `Loading ${name}'s AniList list…` : "Loading MAL list…", () =>
    tryLoad($("#load-error"), async () => (name ? loadAniList(name) : decodeMalList(code, (await data).cells))));
  // The viewer may have loaded or cleared a list meanwhile; show this one only if the URL still names it.
  const now = listParams();
  if (loaded && now.name === name && now.code === code) {
    list = loaded;
    applyState(readState());
  }
}

// --- Startup ----------------------------------------------------------------

for (const group of document.querySelectorAll("[data-control]")) {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (btn) updateUrl({ [group.dataset.control]: btn.dataset.value });
  });
}
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.querySelector(".close").addEventListener("click", () => dialog.close());
}
wireDialog();
wireSummary();
wireListBar();
applyState(readState()); // toolbar buttons, before the data arrives
restoreList(); // runs alongside the data load; both redraw, so either may finish first

try {
  const { table, ...elements } = renderTable(await data);
  view = elements;
  applyState(readState()); // fill the cells; re-reads the URL in case a toggle was clicked during load
  $("#table-wrap").replaceChildren(table); // last, so #status survives any error above
} catch (err) {
  console.error(err);
  $("#status").textContent = "Couldn't load the ranking data. Try reloading the page.";
}
