// Summarizes a viewer's list (see lists.js) against the chart cells, and formats it as shareable text.
import { STATUSES, sourceLabel } from "./lists.js";

const LABELS = { completed: "Completed", watching: "Watching", on_hold: "On hold", dropped: "Dropped", planning: "Planning" };
// Score formats that average to a meaningful number, with the scale shown after it.
const SCALES = { POINT_100: 100, POINT_10_DECIMAL: 10, POINT_10: 10, MAL: 10 };

// Status counts and the average count each show once; byYear counts cells, so a show that charted
// in two years counts in both columns. average is null when nothing is scored or the format isn't numeric.
export function summarize(list, cells) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const byYear = new Map();
  const seen = new Set();
  let total = 0, scored = 0;
  for (const cell of cells) {
    const entry = list.entries.get(cell.id);
    const year = byYear.get(cell.year) ?? { completed: 0, size: 0 };
    byYear.set(cell.year, year);
    year.size++;
    if (entry?.status === "completed") year.completed++;
    if (seen.has(cell.id)) continue;
    seen.add(cell.id);
    if (!entry) continue;
    counts[entry.status]++;
    if (entry.score) { total += entry.score; scored++; }
  }
  const scale = SCALES[list.scoreFormat];
  const average = scale && scored ? { value: total / scored, scale, scored } : null;
  return { shows: seen.size, counts, byYear, average };
}

// Year range, and the most-completed years (all ties) with their count; topYears is empty if nothing is completed.
function highlights(byYear) {
  const years = [...byYear.keys()];
  const most = Math.max(...[...byYear.values()].map((y) => y.completed));
  return {
    range: `${Math.min(...years)}-${Math.max(...years)}`,
    most,
    topYears: most > 0 ? years.filter((y) => byYear.get(y).completed === most) : [],
  };
}

const formatAverage = ({ value, scale }) => `${value.toFixed(1)}/${scale}`;

// Multi-line text for the Copy button.
export function summaryText({ shows, counts, byYear, average }, list, url) {
  const { range, most, topYears } = highlights(byYear);
  return [
    `5ch Best Anime Ranking ${range} - ${sourceLabel(list)}: ${list.name}`,
    `Completed ${counts.completed} of ${shows} shows`,
    STATUSES.slice(1).map((s) => `${LABELS[s]} ${counts[s]}`).join(" · "),
    average && `Average score: ${formatAverage(average)} (${average.scored} scored)`,
    topYears.length && `Most completed year${topYears.length > 1 ? "s" : ""}: ${topYears.join(", ")} (${most} of ${byYear.get(topYears[0]).size})`,
    url,
  ].filter(Boolean).join("\n");
}

// One line for social posts; the link is passed separately. "Watched" counts completed shows.
export function postText({ shows, counts, byYear, average }, list) {
  const { range, topYears } = highlights(byYear);
  return [
    `${list.name} watched ${counts.completed} of the ${shows} anime in 5ch's top 30 of each year (${range})`,
    average && `average score ${formatAverage(average)}`,
    topYears.length && `most in ${topYears.join(", ")}`,
  ].filter(Boolean).join(" · ");
}
