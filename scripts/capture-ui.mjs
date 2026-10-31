import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { filterRows, summarize, csv } from "../dashboard/model.mjs";

const root = new URL("../", import.meta.url);
const require = createRequire(
  new URL(
    process.env.RETAIL_PLAYWRIGHT_PACKAGE || "../package.json",
    import.meta.url,
  ),
);
const { chromium, expect } = require("@playwright/test");
const snapshot = JSON.parse(
  await readFile(new URL("dashboard/data/analysis.json", root), "utf8"),
);
const base = process.env.RETAIL_BASE_URL || "http://127.0.0.1:8103";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.RETAIL_BROWSER_CHANNEL
    ? { channel: process.env.RETAIL_BROWSER_CHANNEL }
    : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  reducedMotion: "reduce",
  acceptDownloads: true,
});
const errors = [],
  consoleErrors = [],
  unexpectedHttp = [],
  layoutChecks = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error" && !message.text().includes("net::ERR_FAILED"))
    consoleErrors.push(message.text());
});
page.on("response", (response) => {
  if (response.status() >= 400)
    unexpectedHttp.push({ url: response.url(), status: response.status() });
});
const format = (value) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
const complete = filterRows(
  snapshot.overview,
  { month: "complete", country: "all" },
  snapshot.period.months,
);
const expected = summarize(complete);
const checkWidths = async (view) => {
  await page.locator(`[data-view="${view}"]`).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1100 });
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(
      size.scroll <= size.width + 1,
      `Horizontal overflow: ${view} at ${width}: ${size.scroll}`,
    );
    layoutChecks.push({ view, width, textScale: 100, ...size });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(size.scroll <= size.width + 1, `Enlarged-text overflow: ${view}`);
  layoutChecks.push({ view, width: 1440, textScale: 200, ...size });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
};
try {
  await page.route("**/data/analysis.json", (route) => route.abort());
  await page.goto(base);
  await expect(page.locator("#loadError")).toBeVisible();
  await page.unroute("**/data/analysis.json");
  await page.locator("#retry").click();
  await expect(page.locator("#netSales")).toHaveText(
    format(expected.net_sales),
  );
  await expect(page.locator("#grossSales")).toHaveText(
    format(expected.gross_sales),
  );
  await expect(page.locator("#credits")).toHaveText(format(expected.credits));
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await page.locator("#monthlyTable").locator("..").locator("summary").click();
  await expect(page.locator("#monthlyTable tbody tr")).toHaveCount(12);
  await page.locator("#monthlyTable").locator("..").locator("summary").click();
  await page.locator(".method-note summary").click();
  await expect(page.locator(".method-note p")).toBeVisible();
  await page.locator(".method-note summary").click();
  await page.locator("#monthFilter").selectOption("2011-12");
  await expect(page.locator("#selectionStatus")).toContainText("partial month");
  await expect(
    page.locator("#monthlyChart rect[stroke-dasharray]"),
  ).toHaveCount(1);
  await page.locator("#countryFilter").selectOption("United Kingdom");
  const selected = filterRows(
    snapshot.overview,
    { month: "2011-12", country: "United Kingdom" },
    snapshot.period.months,
  );
  await expect(page.locator("#netSales")).toHaveText(
    format(summarize(selected).net_sales),
  );
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportCsv").click();
  const download = await downloadPromise;
  assert.equal(
    (await readFile(await download.path(), "utf8")).replace(/^\ufeff/, ""),
    csv(selected).replace(/^\ufeff/, ""),
  );
  const sparse = snapshot.period.countries.find(
    (country) =>
      new Set(
        snapshot.overview
          .filter((row) => row.country === country)
          .map((row) => row.month),
      ).size < 5,
  );
  assert.ok(
    sparse,
    "Need a real sparse country for calendar and empty-state verification",
  );
  const absent = snapshot.period.months.find(
    (period) =>
      !snapshot.overview.some(
        (row) => row.country === sparse && row.month === period.month,
      ),
  );
  await page.locator("#countryFilter").selectOption(sparse);
  await page.locator("#monthFilter").selectOption(absent.month);
  await expect(page.locator("#emptySelection")).toBeVisible();
  await expect(page.locator("#exportCsv")).toBeDisabled();
  await page.locator("#monthFilter").selectOption("complete");
  await expect(page.locator("#monthlyChart rect")).toHaveCount(12);
  await page.locator('[data-view="customers"]').click();
  await expect(page.locator("#identifiedBuyers")).toHaveText(
    new Intl.NumberFormat("en-GB").format(snapshot.customers.identified_buyers),
  );
  await expect(page.locator("#cohortTable td.partial")).toHaveCount(13);
  assert.ok((await page.locator("#cohortTable td.unobserved").count()) > 0);
  await page.locator("#customers details summary").click();
  await expect(page.locator("#customers details p")).toBeVisible();
  await page.locator("#customers details summary").click();
  await page.locator('[data-view="quality"]').click();
  await expect(page.locator("#qualityTable")).toContainText("541,909");
  await page.locator('[data-view="overview"]').click();
  await page.locator('button[type="reset"]').click();
  await expect(page.locator("#countryFilter")).toHaveValue("all");
  await expect(page.locator("#monthFilter")).toHaveValue("complete");
  await expect(page.locator("#netSales")).toHaveText(
    format(expected.net_sales),
  );
  for (const view of ["overview", "customers", "quality"])
    await checkWidths(view);
  const contrastRows = [];
  for (const view of ["overview", "customers", "quality"]) {
    await page.locator(`[data-view="${view}"]`).click();
    const contrast = await page.evaluate(() => {
      const rgb = (value) =>
        value
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number);
      const luminance = (values) =>
        values
          .map((value) => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, value, index) =>
              sum + value * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      const rows = [];
      for (const element of document.querySelectorAll("body *")) {
        if (
          !element.getClientRects().length ||
          ![...element.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
          ) ||
          element.matches("svg *,option")
        )
          continue;
        const style = getComputedStyle(element);
        if (style.opacity !== "1") continue;
        let current = element,
          background;
        while (current) {
          const value = getComputedStyle(current).backgroundColor;
          if (value !== "rgba(0, 0, 0, 0)" && value !== "transparent") {
            background = value;
            break;
          }
          current = current.parentElement;
        }
        if (!background) continue;
        const a = luminance(rgb(style.color)),
          b = luminance(rgb(background));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const size = parseFloat(style.fontSize),
          large =
            size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
        rows.push({
          text: element.textContent.trim().slice(0, 90),
          ratio,
          required: large ? 3 : 4.5,
        });
      }
      return rows;
    });
    contrastRows.push(...contrast.map((row) => ({ view, ...row })));
  }
  assert.deepEqual(
    contrastRows.filter((row) => row.ratio + 0.01 < row.required),
    [],
    "Visible text contrast",
  );
  await mkdir(new URL("docs/screenshots/", root), { recursive: true });
  for (const [view, name] of [
    ["overview", "01-overview"],
    ["customers", "02-customers"],
    ["quality", "03-quality"],
  ]) {
    await page.locator(`[data-view="${view}"]`).click();
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: fileURLToPath(new URL(`docs/screenshots/${name}.png`, root)),
      fullPage: true,
    });
  }
  await page.locator('[data-view="overview"]').click();
  await page.setViewportSize({ width: 390, height: 900 });
  await page.screenshot({
    path: fileURLToPath(new URL("docs/screenshots/04-mobile.png", root)),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(unexpectedHttp, []);
  await mkdir(new URL(".local/", root), { recursive: true });
  const report = {
    result: "PASS",
    actualSource: snapshot.source.sha256,
    functionalChecks: [
      "error-and-retry",
      "actual-source-KPIs",
      "skip-link",
      "monthly-table",
      "method-definition",
      "partial-month",
      "country-filter",
      "actual-CSV-download",
      "empty-selection",
      "sparse-country-calendar",
      "global-customer-scope",
      "partial-and-future-cohorts",
      "grouping-rules",
      "quality-bridge",
      "reset",
    ],
    layoutChecks,
    minimumScannedContrast: Math.min(...contrastRows.map((row) => row.ratio)),
    screenshots: 4,
    pageErrors: errors,
    unexpectedConsoleErrors: consoleErrors,
    unexpectedHttp,
  };
  await writeFile(
    new URL(".local/ui-checks.json", root),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS: real aggregate dashboard,15functional checks,18layouts,4screenshots and rendered text contrast.",
  );
} finally {
  await browser.close();
}
