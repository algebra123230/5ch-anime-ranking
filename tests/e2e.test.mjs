import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
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

const td = (page, year, rank) => page.locator(`td[data-year="${year}"][data-rank="${rank}"]`);
const link = (page, year, rank) => td(page, year, rank).locator("a");
const click = (page, control, value) => page.click(`[data-control="${control}"] button[data-value="${value}"]`);

test("real data: 750 cells; title and link toggles; state survives reload", async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.waitForSelector("table.ranking");
  assert.equal(await page.locator("td a").count(), 750);

  // Mahouka: its MAL id (20785) and AniList id (20458) differ, so links can't be built from the wrong one.
  const mahouka = link(page, 2014, 17);
  assert.equal(await mahouka.innerText(), "魔法科高校の劣等生");
  assert.equal(await page.innerText("h1"), "5ch ベストアニメランキング");
  assert.equal(await page.innerText('th[data-rank="3"]'), "3位");
  assert.equal(await mahouka.getAttribute("href"), "https://myanimelist.net/anime/20785");

  await click(page, "lang", "romaji");
  assert.equal(await mahouka.innerText(), "Mahouka Koukou no Rettousei");
  assert.equal(await page.innerText("h1"), "5ch Best Anime Ranking");
  assert.equal(await page.innerText('th[data-rank="3"]'), "3");
  await click(page, "lang", "en");
  assert.equal(await mahouka.innerText(), "The Irregular at Magic High School");
  await click(page, "links", "anilist");
  assert.equal(await mahouka.getAttribute("href"), "https://anilist.co/anime/20458");
  assert.equal(await page.getAttribute('[data-control="lang"] button[data-value="en"]', "aria-pressed"), "true");

  await page.reload();
  await page.waitForSelector("table.ranking");
  assert.equal(await mahouka.innerText(), "The Irregular at Magic High School");
  assert.equal(await mahouka.getAttribute("href"), "https://anilist.co/anime/20458");
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
  assert.ok(await a.evaluate((node) => node.classList.contains("fallback")));
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

const yearCount = (page, year) => page.locator(`th[data-year="${year}"] .year-count`);
const openSummary = async (page) => {
  await page.click("#open-summary");
  return page.inputValue("#summary-text");
};
const hasClass = (locator, name) => locator.evaluate((node, name) => node.classList.contains(name), name);

// Mahouka (2014 #17): MAL 20785, AniList 20458. Attack on Titan (2013 #1): MAL = AniList = 16498.
const ANILIST_LIST = {
  data: {
    MediaListCollection: {
      user: { name: "tester", mediaListOptions: { scoreFormat: "POINT_100" } },
      lists: [{ entries: [
        { status: "COMPLETED", score: 85, media: { idMal: 20785 } },
        { status: "DROPPED", score: 0, media: { idMal: 16498 } },
        { status: "PLANNING", score: 0, media: { idMal: null } }, // not on MAL: ignored
      ] }],
    },
  },
};

test("AniList list: errors, profile URL, statuses, filters, scores, reload", async () => {
  const page = await browser.newPage();
  await page.route("https://graphql.anilist.co/**", async (r) => {
    const { name } = r.request().postDataJSON().variables;
    if (name !== "tester") {
      return r.fulfill({ status: 404, json: { errors: [{ message: "User not found", status: 404 }], data: { MediaListCollection: null } } });
    }
    await new Promise((resolve) => setTimeout(resolve, 500)); // long enough to see the loading state
    return r.fulfill({ json: ANILIST_LIST });
  });
  await page.addInitScript(() => { navigator.share = async (data) => { window.shared = data; }; });
  await page.goto(`${base}?anilist=nobody`);
  await page.locator("#load-error", { hasText: 'No AniList user named "nobody".' }).waitFor();

  await page.click("#open-load");
  await page.fill("#anilist-name", "nobody");
  await page.click("#panel-anilist button[type=submit]");
  await page.locator("#panel-anilist .error", { hasText: 'No AniList user named "nobody".' }).waitFor();

  await page.fill("#anilist-name", "  https://anilist.co/user/tester/stats/anime/tags ");
  await page.click("#panel-anilist button[type=submit]");
  await page.locator("#list-bar").waitFor();
  assert.equal(await page.locator("#load-dialog").evaluate((d) => d.open), false);
  assert.match(page.url(), /anilist=tester/);

  const mahouka = td(page, 2014, 17);
  const aot = td(page, 2013, 1);
  assert.ok(await hasClass(mahouka, "s-completed"));
  assert.equal(await mahouka.locator(".score").innerText(), "85");
  assert.ok(await hasClass(aot, "s-dropped"));
  assert.equal(await aot.locator(".score").innerText(), "");
  assert.ok(await hasClass(td(page, 2001, 1), "faded"));
  assert.match(await page.locator("label", { has: page.locator('[data-status="completed"]') }).innerText(), /\(1\)/);
  assert.equal(await yearCount(page, 2014).innerText(), "1/30");
  assert.equal(await yearCount(page, 2013).innerText(), "0/30");

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  assert.equal(await openSummary(page), [
    "5ch Best Anime Ranking 2001-2025 - AniList: tester",
    "Completed 1 of 723 shows",
    "Watching 0 · On hold 0 · Dropped 1 · Planning 0",
    "Average score: 85.0/100 (1 scored)",
    "Most completed year: 2014 (1 of 30)",
    page.url(),
  ].join("\n"));
  await page.click("#copy-summary");
  await page.locator("#copy-status", { hasText: "Copied." }).waitFor();
  const post = "I've watched 1 of the 723 anime in 5ch's top 30 of each year (2001-2025) · average score 85.0/100 · most in 2014";
  const x = new URL(await page.getAttribute("#share-x", "href"));
  assert.equal(x.origin + x.pathname, "https://x.com/intent/post");
  assert.equal(x.searchParams.get("text"), post);
  assert.equal(x.searchParams.get("url"), page.url());
  const bluesky = new URL(await page.getAttribute("#share-bluesky", "href"));
  assert.equal(bluesky.searchParams.get("text"), `${post} ${page.url()}`);
  await page.click("#share-native");
  assert.deepEqual(await page.evaluate(() => window.shared), { text: post, url: page.url() });
  await page.click("#summary-dialog .close");

  await page.uncheck('[data-status="completed"]');
  assert.ok(await hasClass(mahouka, "faded"));
  assert.ok(!(await hasClass(mahouka, "s-completed")));
  await page.uncheck("#show-scores");
  await page.check('[data-status="completed"]');
  assert.equal(await mahouka.locator(".score").innerText(), "");

  await page.uncheck('[data-status="dropped"]');

  await page.reload();
  await page.locator("#load-status", { hasText: "Loading tester's AniList list…" }).waitFor();
  await page.locator("#list-bar").waitFor();
  assert.equal(await page.isVisible("#load-status"), false);
  assert.ok(await hasClass(mahouka, "s-completed"));
  assert.ok(await hasClass(aot, "faded"));
  assert.equal(await page.isChecked('[data-status="dropped"]'), false);
  assert.equal(await page.isChecked("#show-scores"), false);

  // Loading a MAL export replaces the AniList list and drops it from the URL.
  await page.click("#open-load");
  await page.click("#tab-mal");
  await page.setInputFiles("#mal-file", { name: "animelist.xml", mimeType: "text/xml", buffer: Buffer.from(MAL_XML) });
  await page.locator("#list-name", { hasText: "maltester" }).waitFor();
  assert.doesNotMatch(page.url(), /anilist=/);
  assert.ok(await hasClass(mahouka, "s-watching"));
  await page.close();
});

const MAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<myanimelist>
  <myinfo><user_name>maltester</user_name></myinfo>
  <anime><series_animedb_id>20785</series_animedb_id><my_score>9</my_score><my_status>Watching</my_status></anime>
  <anime><series_animedb_id>831</series_animedb_id><my_score>0</my_score><my_status>Completed</my_status></anime>
</myanimelist>`;

test("MAL export: bad file error, .xml.gz upload, list kept in the URL, clear, broken link", async () => {
  const page = await browser.newPage();
  await page.goto(base);
  await page.waitForSelector("table.ranking");

  await page.click("#open-load");
  await page.click("#tab-mal");
  await page.setInputFiles("#mal-file", { name: "notes.xml", mimeType: "text/xml", buffer: Buffer.from("<notes/>") });
  await page.locator("#panel-mal .error", { hasText: "This file isn't a MAL export" }).waitFor();

  await page.setInputFiles("#mal-file", { name: "animelist.xml.gz", mimeType: "application/gzip", buffer: gzipSync(MAL_XML) });
  await page.locator("#list-bar").waitFor();
  const mahouka = td(page, 2014, 17);
  assert.ok(await hasClass(mahouka, "s-watching"));
  assert.equal(await mahouka.locator(".score").innerText(), "9");
  assert.match(await page.innerText("#list-name"), /maltester/);
  // Sugar charted in 2001 and 2002: both cells colored, counted once.
  assert.ok(await hasClass(td(page, 2001, 18), "s-completed"));
  assert.ok(await hasClass(td(page, 2002, 3), "s-completed"));
  assert.match(await page.locator("label", { has: page.locator('[data-status="completed"]') }).innerText(), /\(1\)/);
  assert.equal(await yearCount(page, 2001).innerText(), "1/30");
  assert.equal(await yearCount(page, 2002).innerText(), "1/30");
  const summary = (await openSummary(page)).split("\n");
  assert.deepEqual(summary.slice(1, 5), [
    "Completed 1 of 723 shows",
    "Watching 1 · On hold 0 · Dropped 0 · Planning 0",
    "Average score: 9.0/10 (1 scored)",
    "Most completed years: 2001, 2002 (1 of 30)",
  ]);
  await page.click("#summary-dialog .close");

  const shared = page.url();
  assert.match(shared, /mal=/);
  const other = await browser.newPage();
  await other.goto(shared);
  await other.locator("#list-name", { hasText: "maltester" }).waitFor();
  assert.ok(await hasClass(td(other, 2014, 17), "s-watching"));
  assert.equal(await td(other, 2014, 17).locator(".score").innerText(), "9");
  await other.close();

  await page.click("#clear-list");
  assert.equal(await page.isVisible("#list-bar"), false);
  assert.doesNotMatch(page.url(), /mal=/);
  assert.equal(await yearCount(page, 2001).innerText(), "");
  assert.ok(!(await hasClass(mahouka, "s-watching")));
  assert.ok(!(await hasClass(mahouka, "faded")));

  await page.goto(`${base}?mal=bm90LWEtbGlzdA`);
  await page.locator("#load-error", { hasText: "This MAL list link is broken" }).waitFor();
  await page.close();
});
