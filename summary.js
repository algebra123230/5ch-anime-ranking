// Summarizes a viewer's list (see lists.js) against the chart cells, and formats it as shareable text.
import { STATUSES } from "./lists.js";

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

export function summaryText({ shows, counts, byYear, average }, list, url) {
  const years = [...byYear.keys()];
  const most = Math.max(...[...byYear.values()].map((y) => y.completed));
  const top = years.filter((y) => byYear.get(y).completed === most);
  return [
    `5ch Best Anime Ranking ${Math.min(...years)}-${Math.max(...years)} - ${list.source === "anilist" ? "AniList" : "MAL"}: ${list.name}`,
    `Completed ${counts.completed} of ${shows} shows`,
    STATUSES.slice(1).map((s) => `${LABELS[s]} ${counts[s]}`).join(" · "),
    average && `Average score: ${average.value.toFixed(1)}/${average.scale} (${average.scored} scored)`,
    most > 0 && `Most completed year${top.length > 1 ? "s" : ""}: ${top.join(", ")} (${most} of ${byYear.get(top[0]).size})`,
    url,
  ].filter(Boolean).join("\n");
}
