# 5ch-anime-ranking

The 5ch "best anime of the year" ranking (2001-2025, top 30 per year) as an interactive table.

## Data

- `data/rankings.csv` is the source of truth: one row per cell (`year,rank,title_ja,mal_id,title_romaji`).
  `title_ja` is the chart's text; `mal_id` is the MAL entry for the season that aired that year;
  `title_romaji` is MAL's primary title.
- `data/anilist.json`: AniList id, English title and cover per show. A cache: written by `make data`.
- `data/anime.json`: generated; what the site loads. Do not edit by hand.

After editing `data/rankings.csv`:

    make data    # rebuild data/anime.json; fetches new shows from AniList (1 request / 2 s)

## Development

    make serve   # http://localhost:8000
    make test    # Playwright browser tests (needs Google Chrome). No CI: run before each PR.
