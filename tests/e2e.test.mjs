import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { startServer } from "./server.mjs";

let server, browser, base;
before(async () => {
  server = await startServer();
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ channel: "chrome" });
});
after(async () => {
  await browser?.close();
  server?.close();
});

const link = (page, year, rank) => page.locator(`td[data-year="${year}"][data-rank="${rank}"] a`);
const click = (page, control, value) => page.click(`[data-control="${control}"] button[data-value="${value}"]`);

test("real data: 750 cells; title and link toggles; state survives reload", async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.waitForSelector("table.ranking");
  assert.equal(await page.locator("td a").count(), 750);

  const aot = link(page, 2013, 1);
  assert.equal(await aot.innerText(), "進撃の巨人");
  assert.equal(await aot.getAttribute("href"), "https://myanimelist.net/anime/16498");

  await click(page, "lang", "romaji");
  assert.equal(await aot.innerText(), "Shingeki no Kyojin");
  await click(page, "lang", "en");
  assert.equal(await aot.innerText(), "Attack on Titan");
  await click(page, "links", "anilist");
  assert.equal(await aot.getAttribute("href"), "https://anilist.co/anime/16498");
  assert.equal(await page.getAttribute('[data-control="lang"] button[data-value="en"]', "aria-pressed"), "true");

  await page.reload();
  await page.waitForSelector("table.ranking");
  assert.equal(await aot.innerText(), "Attack on Titan");
  assert.equal(await aot.getAttribute("href"), "https://anilist.co/anime/16498");
  await page.close();
});

const FIXTURE = {
  cells: [{ year: 2024, rank: 1, id: 1, title_ja: '姫様"拷問"の時間です & <b>' }],
  anime: { 1: { title_romaji: 'Himesama "Goumon" & <b>', title_en: null, anilist_id: null, cover: null } },
};

test("edge cases: literal text, English fallback, AniList fallback, bad URL params", async () => {
  const page = await browser.newPage();
  await page.route("**/data/anime.json", (r) => r.fulfill({ json: FIXTURE }));
  await page.goto(`${base}?lang=xx&links=yy`);
  await page.waitForSelector("table.ranking");
  const a = link(page, 2024, 1);

  assert.equal(await page.getAttribute('[data-control="lang"] button[data-value="ja"]', "aria-pressed"), "true");
  assert.equal(await a.innerText(), '姫様"拷問"の時間です & <b>');
  assert.equal(await page.locator("td b").count(), 0);

  await click(page, "lang", "en");
  assert.equal(await a.innerText(), 'Himesama "Goumon" & <b>');

  await click(page, "links", "anilist");
  assert.equal(await a.getAttribute("href"), "https://myanimelist.net/anime/1");
  assert.equal(await a.getAttribute("class"), "fallback");
  await page.close();
});

test("data load failure shows a readable error", async () => {
  const page = await browser.newPage();
  await page.route("**/data/anime.json", (r) => r.fulfill({ status: 404, body: "not found" }));
  await page.goto(base);
  await page.locator("#status", { hasText: "Couldn't load the ranking data" }).waitFor();
  assert.equal(await page.locator("table.ranking").count(), 0);
  await page.close();
});
