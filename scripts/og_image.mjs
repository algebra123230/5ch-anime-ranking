// Renders assets/og.png, the link-preview image for social sites (1200x630, the size X and Facebook show).
// Usage: make og-image (rerun after the chart data or layout changes).
import { chromium } from "playwright-core";
import { startServer } from "../tests/server.mjs";

const server = await startServer();
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForSelector("table.ranking");
await page.screenshot({ path: "assets/og.png" });
await browser.close();
server.close();
