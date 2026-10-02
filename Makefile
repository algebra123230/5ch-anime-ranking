.PHONY: data test serve og-image

# Rebuild data/anime.json after editing data/rankings.csv. Fetches new shows from AniList (1 request / 2 s).
data:
	python3 scripts/build_data.py

node_modules: package.json package-lock.json
	npm ci
	touch node_modules

# Browser tests (Playwright driving installed Chrome). No CI: run before each PR.
test: node_modules
	npm test

# Link-preview image for social sites (assets/og.png). Rerun after chart data or layout changes.
og-image: node_modules
	node scripts/og_image.mjs

# Local preview at http://localhost:8000
serve:
	python3 -m http.server 8000
