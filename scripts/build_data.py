"""Build data/anime.json (what the site loads) from data/rankings.csv.

Usage: python3 scripts/build_data.py
Output: data/anime.json. Shows missing from the AniList cache (data/anilist.json) are fetched
first, 50 per request, at most 1 request per 2 seconds. Fails loudly on malformed rankings.
"""
import csv
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
CACHE = DATA / "anilist.json"
QUERY = """query ($ids: [Int]) {
  Page(perPage: 50) { media(idMal_in: $ids, type: ANIME) { id idMal title { english } coverImage { medium } } }
}"""


def fetch_anilist(ids):
    """Return AniList media for up to 50 MAL ids. Retries on HTTP 429."""
    body = json.dumps({"query": QUERY, "variables": {"ids": ids}}).encode()
    req = urllib.request.Request("https://graphql.anilist.co", body, {
        "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "5ch-anime-ranking"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = json.load(r)
            assert "errors" not in resp, resp["errors"]
            return resp["data"]["Page"]["media"]
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 2:
                raise
            time.sleep(int(e.headers.get("Retry-After", 60)))


def update_cache(ids):
    """Fetch ids missing from the cache. A null anilist_id means AniList has no match (not refetched)."""
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    todo = sorted(i for i in ids if str(i) not in cache)
    for n, start in enumerate(range(0, len(todo), 50)):
        if n:
            time.sleep(2)
        batch = todo[start:start + 50]
        found = {m["idMal"]: m for m in fetch_anilist(batch)}
        for i in batch:
            m = found.get(i)
            cache[str(i)] = {"anilist_id": m and m["id"], "title_en": m and m["title"]["english"],
                             "cover": m and m["coverImage"]["medium"]}
        cache = dict(sorted(cache.items(), key=lambda kv: int(kv[0])))
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"fetched {start + len(batch)}/{len(todo)} from AniList")
    return cache


def main():
    rows = list(csv.DictReader(open(DATA / "rankings.csv", encoding="utf-8")))
    keys = {(r["year"], r["rank"]) for r in rows}
    assert len(rows) == len(keys) == 750, f"expected 750 unique (year, rank) cells, got {len(keys)}/{len(rows)}"
    titles = {}
    for r in rows:
        first = titles.setdefault(r["mal_id"], r["title_romaji"])
        assert first == r["title_romaji"], f"mal_id {r['mal_id']} has two romaji titles: {first!r}, {r['title_romaji']!r}"

    cache = update_cache({int(i) for i in titles})
    cells = sorted(({"year": int(r["year"]), "rank": int(r["rank"]), "id": int(r["mal_id"]), "title_ja": r["title_ja"]}
                    for r in rows), key=lambda c: (c["year"], c["rank"]))
    anime = {i: {"title_romaji": t, **cache[i]} for i, t in sorted(titles.items(), key=lambda kv: int(kv[0]))}
    out = json.dumps({"cells": cells, "anime": anime}, ensure_ascii=False, separators=(",", ":"))
    (DATA / "anime.json").write_text(out + "\n", encoding="utf-8")
    unmatched = [i for i, a in anime.items() if a["anilist_id"] is None]
    print(f"wrote data/anime.json: {len(cells)} cells, {len(anime)} shows; no AniList match: {unmatched or 'none'}")


if __name__ == "__main__":
    main()
