.PHONY: data test serve

# Rebuild data/anime.json after editing data/rankings.csv. Fetches new shows from AniList (1 request / 2 s).
data:
	python3 scripts/build_data.py

node_modules: package.json package-lock.json
	npm ci
	touch node_modules

# Browser tests (Playwright driving installed Chrome). No CI: run before each PR.
test: node_modules
	npm test

# Local preview at http://localhost:8000
serve:
	python3 -m http.server 8000
