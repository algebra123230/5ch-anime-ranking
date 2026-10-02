// Loads a viewer's anime list from AniList (by username) or a MAL export file into one shape:
//   { source: "anilist" | "mal", name, scoreFormat, entries: Map<id, { status, score }> }
// AniList lists are keyed by AniList id, MAL lists by MAL id. score is null when unscored.

export const STATUSES = ["completed", "watching", "on_hold", "dropped", "planning"];

const ANILIST_STATUS = {
  COMPLETED: "completed", REPEATING: "completed", CURRENT: "watching",
  PAUSED: "on_hold", DROPPED: "dropped", PLANNING: "planning",
};
const MAL_STATUS = {
  "Completed": "completed", "Watching": "watching", "On-Hold": "on_hold",
  "Dropped": "dropped", "Plan to Watch": "planning",
};
const MAL_FILE_ERROR = "This file isn't a MAL export. Upload the .xml or .xml.gz from MAL's Export page.";
const SAVED_KEY = "malList";

// Message is shown to the viewer as-is.
export class ListError extends Error {}

// "name", "@name", "https://anilist.co/user/name/stats/anime/tags" -> "name"
export function parseAniListUser(input) {
  const text = input.trim();
  const match = text.match(/anilist\.co\/user\/([^/?#\s]+)/i);
  const name = (match ? match[1] : text.replace(/\/+$/, "")).replace(/^@/, "");
  if (!/^[\w-]+$/.test(name)) throw new ListError("Enter an AniList username or profile link.");
  return name;
}

const QUERY = `query ($name: String) {
  MediaListCollection(userName: $name, type: ANIME) {
    user { name mediaListOptions { scoreFormat } }
    lists { entries { mediaId status score } }
  }
}`;

export async function loadAniList(name) {
  let res;
  try {
    res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { name } }),
    });
  } catch {
    throw new ListError("Couldn't reach AniList. Check your connection.");
  }
  if (res.status === 429) throw new ListError("AniList is busy right now. Try again in a minute.");
  const body = await res.json().catch(() => ({}));
  const message = body.errors?.[0]?.message ?? "";
  if (message === "User not found") throw new ListError(`No AniList user named "${name}".`);
  if (/private/i.test(message)) throw new ListError("This AniList list is private.");
  const collection = body.data?.MediaListCollection;
  if (!collection) throw new ListError(`AniList error: ${message || `HTTP ${res.status}`}`);

  // A show in a custom list appears in several lists with the same status; the Map dedupes it.
  const entries = new Map();
  for (const list of collection.lists) {
    for (const e of list.entries) entries.set(e.mediaId, { status: ANILIST_STATUS[e.status], score: e.score || null });
  }
  return { source: "anilist", name: collection.user.name, scoreFormat: collection.user.mediaListOptions.scoreFormat, entries };
}

export async function parseMalFile(file) {
  let text;
  try {
    // Check the gzip magic bytes, not the extension: Safari often unzips downloads but keeps the name.
    const [b0, b1] = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    const gzipped = b0 === 0x1f && b1 === 0x8b;
    text = await new Response(gzipped ? file.stream().pipeThrough(new DecompressionStream("gzip")) : file).text();
  } catch {
    throw new ListError(MAL_FILE_ERROR);
  }
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror") || doc.documentElement.nodeName !== "myanimelist") throw new ListError(MAL_FILE_ERROR);

  const entries = new Map();
  for (const anime of doc.documentElement.querySelectorAll(":scope > anime")) {
    const field = (tag) => anime.querySelector(tag)?.textContent.trim() ?? "";
    const status = MAL_STATUS[field("my_status")];
    if (status) entries.set(Number(field("series_animedb_id")), { status, score: Number(field("my_score")) || null });
  }
  const name = doc.querySelector("myinfo > user_name")?.textContent.trim() ?? "";
  return { source: "mal", name, scoreFormat: "MAL", entries };
}

// AniList POINT_100 / POINT_10_DECIMAL / POINT_10 and MAL scores are shown as plain numbers.
export function formatScore(score, scoreFormat) {
  if (!score) return "";
  if (scoreFormat === "POINT_5") return `★${score}`;
  if (scoreFormat === "POINT_3") return ["", "🙁", "😐", "🙂"][score] ?? "";
  return String(score);
}

// localStorage can throw (private mode, blocked storage); the list then just isn't remembered.
export function saveMalList(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify({ ...list, entries: [...list.entries] }));
  } catch {}
}

export function loadSavedMalList() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY));
    return saved && { ...saved, entries: new Map(saved.entries) };
  } catch {
    return null;
  }
}

export function clearSavedMalList() {
  try {
    localStorage.removeItem(SAVED_KEY);
  } catch {}
}
