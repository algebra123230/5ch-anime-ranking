# 5ch-anime-ranking

The 5ch "best anime of the year" ranking (2001-2025, top 30 per year) as an interactive table.

## Your list

"Load list" shows your watch status on the chart. The page URL holds your list, so reloading or sharing the link shows the same list. Nothing is stored in the browser.

- AniList: enter your username or profile link.
- MAL: export your anime list on MAL (Profile → Export My List) and choose the downloaded file (`.xml` or `.xml.gz`).

## Data

- `data/rankings.csv` is the source of truth: one row per cell (`year,rank,title_ja,mal_id,title_romaji`).
  `title_ja` is the chart's text; `mal_id` is the MAL entry for the season that aired that year;
  `title_romaji` is MAL's primary title.
- `data/anilist.json`: AniList id, English title and cover per show. `make data` adds new shows to this cache.
- `data/anime.json`: the file the site loads. `make data` generates it; do not edit by hand.

After editing `data/rankings.csv`:

    make data    # rebuild data/anime.json; fetches new shows from AniList (1 request / 2 s)

## Development

    make serve   # http://localhost:8000
    make test    # Playwright browser tests (needs Google Chrome). No CI: run before each PR.
