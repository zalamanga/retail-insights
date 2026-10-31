import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSnapshot, summarize, scaled } from "../dashboard/model.mjs";

const root = new URL("../", import.meta.url);
const snapshot = validateSnapshot(
  JSON.parse(
    await readFile(new URL("dashboard/data/analysis.json", root), "utf8"),
  ),
);
const source = JSON.parse(
  await readFile(new URL("data/source.json", root), "utf8"),
);
const report = JSON.parse(
  await readFile(new URL("reports/kpis.json", root), "utf8"),
);
assert.ok(
  !snapshot.source.fixture,
  "Synthetic fixture must never replace the public historical snapshot",
);
assert.equal(snapshot.source.sha256, source.xlsx_sha256);
assert.equal(snapshot.source.rows, 541909);
assert.equal(snapshot.source.date_min, "2010-12-01");
assert.equal(snapshot.source.date_max, "2011-12-09");
assert.deepEqual(
  snapshot.period.months.filter((row) => !row.complete).map((row) => row.month),
  ["2011-12"],
);
assert.equal(snapshot.period.months.filter((row) => row.complete).length, 12);
const totals = summarize(snapshot.overview);
for (const key of ["gross_sales", "credits", "net_sales"])
  assert.equal(scaled(totals[key]), scaled(Number(report.kpis[key])));
for (const row of [...snapshot.overview, ...snapshot.products])
  assert.ok(
    !Object.hasOwn(row, "customer_id") && !Object.hasOwn(row, "invoice_no"),
  );
console.log(
  JSON.stringify({
    result: "PASS",
    sourceRows: snapshot.source.rows,
    fingerprint: snapshot.source.sha256,
    overviewRows: snapshot.overview.length,
    productRows: snapshot.products.length,
    completeMonths: 12,
    partialMonths: ["2011-12"],
    reconciliation:
      "gross - credits = net; product/overview/report totals agree",
  }),
);
