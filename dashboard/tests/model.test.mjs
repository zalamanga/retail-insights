import test from "node:test";
import assert from "node:assert/strict";
import {
  scaled,
  filterRows,
  summarize,
  monthlySeries,
  productLeaders,
  csv,
} from "../model.mjs";

const row = (
  month,
  country,
  gross_sales,
  credits,
  orders = 1,
  stock_code = "10001",
) => ({
  month,
  country,
  gross_sales,
  credits,
  net_sales: (scaled(gross_sales) - scaled(credits)) / 10000,
  orders,
  units_sold: 3,
  units_credited: 1,
  stock_code,
  description: "Fixture product",
});
const rows = [
  row("2010-12", "UK", 10.0001, 1),
  row("2011-11", "UK", 20.0002, 2),
  row("2011-12", "UK", 30, 3),
  row("2011-11", "France", 40, 4),
];
const periods = [
  { month: "2010-12", complete: true },
  { month: "2011-11", complete: true },
  { month: "2011-12", complete: false },
];

test("complete-month selection includes December 2010 and excludes partial December 2011", () => {
  assert.deepEqual(
    filterRows(rows, { month: "complete", country: "all" }, periods).map(
      (item) => [item.month, item.country],
    ),
    [
      ["2010-12", "UK"],
      ["2011-11", "UK"],
      ["2011-11", "France"],
    ],
  );
});
test("month and country filters intersect without changing the source rows", () => {
  assert.equal(
    filterRows(rows, { month: "2011-11", country: "UK" }, periods).length,
    1,
  );
  assert.equal(
    filterRows(rows, { month: "2010-12", country: "France" }, periods).length,
    0,
  );
  assert.equal(rows.length, 4);
});
test("money sums at four decimal places and reconciles across country groups", () => {
  const result = summarize(rows);
  assert.equal(result.gross_sales, 100.0003);
  assert.equal(result.credits, 10);
  assert.equal(result.net_sales, 90.0003);
  assert.equal(result.orders, 4);
  assert.equal(
    scaled(result.gross_sales) - scaled(result.credits),
    scaled(result.net_sales),
  );
});
test("monthly totals combine countries and keep the timeline ordered", () => {
  const result = monthlySeries([...rows].reverse());
  assert.deepEqual(
    result.map((item) => item.month),
    ["2010-12", "2011-11", "2011-12"],
  );
  assert.equal(result[1].net_sales, 54.0002);
});
test("product ranking aggregates the full filtered fact set before taking a top ten", () => {
  const products = [...rows, row("2011-11", "UK", 100, 0, 1, "10002")];
  const result = productLeaders(products);
  assert.equal(result[0].stock_code, "10002");
  assert.equal(result[1].net_sales, 90.0003);
  assert.ok(
    !Object.hasOwn(result[1], "orders"),
    "distinct product invoice counts must not be summed across SKUs",
  );
});
test("negative net amounts remain negative and are not replaced with zero", () => {
  const result = summarize([row("2011-11", "UK", 0, 9.8765)]);
  assert.equal(result.net_sales, -9.8765);
});

test("a sparse country keeps observed zero-activity months on the calendar axis", () => {
  const series = monthlySeries(
    rows.filter((row) => row.country === "France"),
    ["2010-12", "2011-11", "2011-12"],
  );
  assert.equal(series.length, 3);
  assert.deepEqual(
    series.map((row) => row.net_sales),
    [0, 36, 0],
  );
});
test("CSV preserves four-place numeric values, quotes text and neutralizes formula-like text", () => {
  const output = csv([row("2011-11", "=SUM(1,2)", 1.2345, 5)]);
  assert.ok(output.startsWith("\ufeff"));
  assert.ok(output.includes('"\'=SUM(1,2)"'));
  assert.ok(output.includes('"-3.7655"'));
  assert.ok(!output.includes('"\'-3.7655"'));
  assert.ok(
    csv([row("2011-11", 'A "quoted", country', 1, 0)]).includes(
      '"A ""quoted"", country"',
    ),
  );
});
test("invalid and unsafe monetary values fail visibly rather than poisoning totals", () => {
  assert.throws(() => scaled(NaN));
  assert.throws(() => scaled(Infinity));
  assert.throws(() => scaled(1e15));
});
