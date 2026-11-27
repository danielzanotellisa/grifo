import { launch } from "./browser.mjs";
import { PNG } from "pngjs";

export const BASE = "http://localhost:5199";

export async function open(pdf, { viewport = { width: 1100, height: 900 }, ctx } = {}) {
  const browser = ctx?.browser ?? (await launch());
  const page = await browser.newPage({ viewport });
  const log = { errors: [], dialogs: [], longtasks: [] };
  page.on("pageerror", (e) => log.errors.push(String(e).slice(0, 300)));
  page.on("dialog", async (d) => { log.dialogs.push(d.message()); await d.dismiss(); });
  await page.addInitScript(() => {
    window.__long = [];
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ entryTypes: ["longtask"] });
    } catch {}
    window.__alerts = [];
    const orig = window.alert; window.alert = (m) => { window.__alerts.push(String(m)); };
  });
  const t0 = Date.now();
  await page.goto(`${BASE}/?pdf=${pdf}`);
  await page.waitForFunction(() => window.__kernel?.tryCapability?.(window.__tokens.StageToken)?.getPageCount?.() > 0, null, { timeout: 60000 });
  const firstPageMs = Date.now() - t0;
  await page.waitForTimeout(800);
  return { browser, page, log, firstPageMs };
}

/** Runs `fn(sel, stage, k)` inside the page, with the two capabilities. */
export const inPage = (page, fn, arg) =>
  page.evaluate(new Function("arg", `const k = window.__kernel;
    const sel = k.tryCapability(window.__tokens.SelectionToken);
    const stage = k.tryCapability(window.__tokens.StageToken);
    return (${fn.toString()})(sel, stage, k, arg);`), arg);

export function decode(buf) { return PNG.sync.read(buf); }

/** Bounding box of dark pixels inside a screen region, or null. */
export function darkBox(png, region) {
  const { x, y, width, height } = region;
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
  for (let j = Math.max(0, Math.floor(y)); j < Math.min(png.height, Math.ceil(y + height)); j++)
    for (let i = Math.max(0, Math.floor(x)); i < Math.min(png.width, Math.ceil(x + width)); i++) {
      const o = (png.width * j + i) * 4;
      if (png.data[o] < 110 && png.data[o + 1] < 110 && png.data[o + 2] < 110) {
        if (i < minX) minX = i; if (i > maxX) maxX = i; if (j < minY) minY = j; if (j > maxY) maxY = j;
      }
    }
  return maxX < 0 ? null : { left: minX, top: minY, right: maxX + 1, bottom: maxY + 1 };
}
