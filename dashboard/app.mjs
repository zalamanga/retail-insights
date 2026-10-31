import {
  validateSnapshot,
  filterRows,
  summarize,
  monthlySeries,
  productLeaders,
  csv,
  scaled,
} from "./model.mjs";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("en-GB");
const percentage = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 1,
});
const decimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const byId = (id) => document.getElementById(id);
const svgNS = "http://www.w3.org/2000/svg";
let snapshot;
let visibleRows = [];
let lastSeries = [];
let lastChartWidth = 0;
let activeView = ["overview", "customers", "quality"].includes(
  location.hash.slice(1),
)
  ? location.hash.slice(1)
  : "overview";

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function svg(tag, attributes, text) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes))
    node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function monthName(month, short = false) {
  return new Intl.DateTimeFormat("en-GB", {
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}
function table(headers, rows, numeric = [], caption) {
  const node = element("table");
  if (caption) node.append(element("caption", caption));
  const head = element("thead");
  const header = element("tr");
  headers.forEach((label, index) => {
    const cell = element("th", label, numeric.includes(index) ? "amount" : "");
    cell.scope = "col";
    header.append(cell);
  });
  head.append(header);
  node.append(head);
  const body = element("tbody");
  for (const row of rows) {
    const tr = element("tr");
    row.forEach((value, index) =>
      tr.append(element("td", value, numeric.includes(index) ? "amount" : "")),
    );
    body.append(tr);
  }
  node.append(body);
  return node;
}
function setView(view, focus = false) {
  activeView = ["overview", "customers", "quality"].includes(view)
    ? view
    : "overview";
  for (const button of document.querySelectorAll("[data-view]"))
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.view === activeView),
    );
  for (const section of document.querySelectorAll(".view"))
    section.hidden = section.id !== activeView;
  if (focus && snapshot) {
    const heading = byId(activeView).querySelector("h1");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    byId("main").scrollIntoView({ block: "start" });
  }
}
function renderChart(series) {
  lastSeries = series;
  const width = Math.max(200, Math.round(byId("monthlyChart").clientWidth)),
    height = width < 500 ? 245 : 275;
  lastChartWidth = width;
  const left = width < 500 ? 52 : 69,
    right = 12,
    top = 15,
    bottom = 47;
  const min = Math.min(0, ...series.map((row) => row.net_sales));
  const rawMax = Math.max(0, ...series.map((row) => row.net_sales));
  const max = rawMax === min ? min + 1 : rawMax;
  const innerH = height - top - bottom;
  const y = (value) => top + ((max - value) / (max - min)) * innerH;
  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-labelledby": "salesChartTitle salesChartDescription",
  });
  chart.append(
    svg(
      "title",
      { id: "salesChartTitle" },
      "Monthly net recorded merchandise sales in GBP",
    ),
  );
  chart.append(
    svg(
      "desc",
      { id: "salesChartDescription" },
      "Bars show the selected historical months. Negative values extend below zero. An outlined bar is a partial month. Exact values are available in the monthly table.",
    ),
  );
  for (let tick = 0; tick <= 4; tick++) {
    const value = min + ((max - min) * tick) / 4;
    const lineY = y(value);
    chart.append(
      svg("line", {
        x1: left,
        x2: width - right,
        y1: lineY,
        y2: lineY,
        stroke: "#d6dcd4",
        "stroke-width": 1,
      }),
    );
    const label =
      Math.abs(value) >= 1e6
        ? `${decimal.format(value / 1e6)}m`
        : Math.abs(value) >= 1000
          ? `${decimal.format(value / 1000)}k`
          : decimal.format(value);
    chart.append(
      svg("text", { x: left - 9, y: lineY + 4, "text-anchor": "end" }, label),
    );
  }
  chart.append(
    svg("line", {
      x1: left,
      x2: width - right,
      y1: y(0),
      y2: y(0),
      stroke: "#526258",
      "stroke-width": 1,
    }),
  );
  const step = (width - left - right) / Math.max(1, series.length);
  const labelEvery = step < 36 ? 2 : 1;
  let labelledYear;
  series.forEach((row, index) => {
    const complete = snapshot.period.months.find(
      (period) => period.month === row.month,
    ).complete;
    const rect = svg("rect", {
      x: left + step * index + step * 0.17,
      y: Math.min(y(row.net_sales), y(0)),
      width: step * 0.66,
      height: Math.abs(y(row.net_sales) - y(0)),
      fill: complete ? (row.net_sales < 0 ? "#8b3f2f" : "#205d45") : "#e9f0e9",
      stroke: row.net_sales < 0 ? "#8b3f2f" : "#205d45",
      "stroke-width": complete ? 0 : 2,
      ...(complete ? {} : { "stroke-dasharray": "4 3" }),
    });
    rect.append(
      svg(
        "title",
        {},
        `${monthName(row.month)}${complete ? "" : " (partial)"}: ${money.format(row.net_sales)}`,
      ),
    );
    chart.append(rect);
    if (index % labelEvery !== 0) return;
    chart.append(
      svg(
        "text",
        {
          x: left + step * (index + 0.5),
          y: height - 25,
          "text-anchor": "middle",
        },
        `${monthName(row.month, true)}${complete ? "" : "*"}`,
      ),
    );
    if (row.month.slice(0, 4) !== labelledYear)
      chart.append(
        svg(
          "text",
          {
            x: left + step * (index + 0.5),
            y: height - 8,
            "text-anchor": "middle",
          },
          row.month.slice(0, 4),
        ),
      );
    labelledYear = row.month.slice(0, 4);
  });
  byId("monthlyChart").replaceChildren(chart);
}
function renderCountries(rows) {
  const groups = new Map();
  for (const row of rows)
    groups.set(
      row.country,
      (groups.get(row.country) || 0) + scaled(row.gross_sales),
    );
  const total = [...groups.values()].reduce((sum, value) => sum + value, 0);
  const output = [];
  for (const [country, value] of [...groups]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)) {
    const item = element("div", undefined, "country-row");
    const heading = element("header");
    heading.append(
      element("strong", country),
      element("span", money.format(value / 10000), "country-value"),
    );
    item.append(heading);
    const share = total ? value / total : 0;
    const bar = svg("svg", {
      viewBox: "0 0 300 7",
      "aria-hidden": "true",
      preserveAspectRatio: "none",
    });
    bar.append(
      svg("rect", { x: 0, y: 0, width: 300, height: 7, fill: "#e9f0e9" }),
      svg("rect", {
        x: 0,
        y: 0,
        width: 300 * share,
        height: 7,
        fill: "#205d45",
      }),
    );
    item.append(
      bar,
      element("p", `${percentage.format(share)} of selected gross sales`),
    );
    output.push(item);
  }
  byId("countryRanking").replaceChildren(...output);
}
function renderSales() {
  const selection = {
    month: byId("monthFilter").value,
    country: byId("countryFilter").value,
  };
  visibleRows = filterRows(
    snapshot.overview,
    selection,
    snapshot.period.months,
  );
  const products = productLeaders(
    filterRows(snapshot.products, selection, snapshot.period.months),
  );
  const label =
    selection.month === "complete"
      ? "Complete calendar months"
      : selection.month === "all"
        ? "Full recorded period, including the partial final month"
        : `${monthName(selection.month)}${snapshot.period.months.find((row) => row.month === selection.month).complete ? "" : " (partial month)"}`;
  byId("selectionStatus").textContent =
    `${label} · ${selection.country === "all" ? "All customer countries" : selection.country} · ${integer.format(visibleRows.length)} month/country aggregates`;
  byId("emptySelection").hidden = visibleRows.length !== 0;
  byId("salesResults").hidden = visibleRows.length === 0;
  byId("exportCsv").disabled = visibleRows.length === 0;
  if (!visibleRows.length) return;
  const total = summarize(visibleRows);
  byId("netSales").textContent = money.format(total.net_sales);
  byId("grossSales").textContent = money.format(total.gross_sales);
  byId("credits").textContent = money.format(total.credits);
  byId("orders").textContent = integer.format(total.orders);
  const coveredMonths = snapshot.period.months
    .filter(
      (period) =>
        selection.month === "all" ||
        (selection.month === "complete"
          ? period.complete
          : period.month === selection.month),
    )
    .map((period) => period.month);
  const series = monthlySeries(visibleRows, coveredMonths);
  renderChart(series);
  renderCountries(visibleRows);
  byId("monthlyTable").replaceChildren(
    table(
      ["Month", "Gross sales", "Credits", "Net sales", "Sales invoices"],
      series.map((row) => [
        `${monthName(row.month)}${snapshot.period.months.find((period) => period.month === row.month).complete ? "" : " (partial)"}`,
        money.format(row.gross_sales),
        money.format(row.credits),
        money.format(row.net_sales),
        integer.format(row.orders),
      ]),
      [1, 2, 3, 4],
    ),
  );
  byId("productCount").textContent =
    `${integer.format(products.length)} SKUs in selection`;
  byId("productTable").replaceChildren(
    table(
      ["Stock code", "Product", "Net sales", "Units sold", "Units credited"],
      products
        .slice(0, 10)
        .map((row) => [
          row.stock_code,
          row.description,
          money.format(row.net_sales),
          integer.format(row.units_sold),
          integer.format(row.units_credited),
        ]),
      [2, 3, 4],
    ),
  );
}
function renderCustomers() {
  const customers = snapshot.customers;
  byId("repeatRate").textContent = percentage.format(customers.repeat_rate);
  byId("identifiedBuyers").textContent = integer.format(
    customers.identified_buyers,
  );
  byId("repeatBuyers").textContent = integer.format(customers.repeat_buyers);
  const cutoff =
    customers.as_of || snapshot.definitions?.rfm_as_of || "2011-12-10";
  byId("asOf").textContent = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${String(cutoff).slice(0, 10)}T00:00:00Z`));
  byId("segmentTable").replaceChildren(
    table(
      [
        "Observed group",
        "Buyers",
        "Gross purchase spend",
        "Avg. recency (days)",
        "Avg. invoices",
      ],
      customers.segments.map((row) => [
        row.segment,
        integer.format(row.customers),
        money.format(row.monetary),
        decimal.format(row.avg_recency_days),
        decimal.format(row.avg_frequency),
      ]),
      [1, 2, 3, 4],
    ),
  );
  const cohorts = [
    ...new Set(snapshot.cohorts.rows.map((row) => row.cohort_month)),
  ].sort();
  const maxPeriod = Math.max(
    ...snapshot.cohorts.rows.map((row) => row.period_index),
  );
  const matrix = element("table");
  const head = element("thead");
  const header = element("tr");
  for (const value of [
    "First purchase",
    "Buyers",
    ...Array.from({ length: maxPeriod + 1 }, (_, index) => `M${index}`),
  ]) {
    const cell = element("th", value);
    cell.scope = "col";
    header.append(cell);
  }
  head.append(header);
  matrix.append(head);
  const body = element("tbody");
  const indexed = new Map(
    snapshot.cohorts.rows.map((row) => [
      `${row.cohort_month}/${row.period_index}`,
      row,
    ]),
  );
  for (const cohort of cohorts) {
    const tr = element("tr");
    const label = element("th", monthName(cohort));
    label.scope = "row";
    tr.append(label);
    tr.append(
      element("td", integer.format(indexed.get(`${cohort}/0`).cohort_size)),
    );
    for (let index = 0; index <= maxPeriod; index++) {
      const row = indexed.get(`${cohort}/${index}`);
      if (!row || !row.observed) {
        const cell = element("td", "");
        cell.className = "unobserved";
        cell.setAttribute(
          "aria-label",
          "Not yet observed within the source window",
        );
        tr.append(cell);
        continue;
      }
      const partial =
        snapshot.period.months.find(
          (period) => period.month === row.activity_month,
        )?.complete === false;
      const cell = element("td", percentage.format(row.retention_rate));
      cell.className = `level-${Math.min(5, Math.floor(row.retention_rate * 6))}${partial ? " partial" : ""}`;
      cell.title = `${monthName(row.activity_month)}: ${row.customers} of ${row.cohort_size} buyers${partial ? "; partial month through 9 December" : ""}`;
      cell.setAttribute(
        "aria-label",
        cell.title + `; ${percentage.format(row.retention_rate)}`,
      );
      tr.append(cell);
    }
    body.append(tr);
  }
  matrix.append(body);
  byId("cohortTable").replaceChildren(matrix);
}
function renderQuality() {
  const q = snapshot.quality;
  const rows = [
    ["Original source rows", q.rows_raw],
    ["Exact duplicate rows removed", q.duplicate_rows],
    ["Rows after deduplication", q.rows_after_dedup],
    ...q.reasons.map((row) => [
      `Excluded: ${row.reason.replaceAll("_", " ")}`,
      row.rows,
    ]),
    ["All excluded rows", q.excluded_rows],
    ["Included positive-sale rows", q.included_sales_rows],
    ["Included credit rows", q.included_credit_rows],
    [
      "Missing CustomerID rows (overlapping source check)",
      q.missing_customer_id_rows,
    ],
  ];
  byId("qualityTable").replaceChildren(
    table(
      ["Audit step", "Rows"],
      rows.map(([label, count]) => [label, integer.format(count)]),
      [1],
    ),
  );
  const pairs = [
    [
      "Recorded window",
      `${snapshot.source.date_min} to ${snapshot.source.date_max}`,
    ],
    ["Currency", "GBP (sterling)"],
    ["Original rows", integer.format(snapshot.source.rows)],
    ["Source fingerprint (SHA-256)", snapshot.source.sha256],
    ["License", "Creative Commons Attribution 4.0"],
  ];
  byId("provenance").replaceChildren(
    ...pairs.flatMap(([key, value]) => [
      element("dt", key),
      element("dd", value),
    ]),
  );
}
async function load() {
  byId("loading").hidden = false;
  byId("loadError").hidden = true;
  byId("app").hidden = true;
  for (const button of document.querySelectorAll("[data-view]"))
    button.disabled = true;
  try {
    const response = await fetch("data/analysis.json", {
      cache: "no-cache",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error("Snapshot unavailable");
    snapshot = validateSnapshot(await response.json());
    const month = byId("monthFilter");
    while (month.options.length > 2) month.remove(2);
    for (const period of snapshot.period.months) {
      const option = element(
        "option",
        `${monthName(period.month)}${period.complete ? "" : " (partial)"}`,
      );
      option.value = period.month;
      month.append(option);
    }
    const country = byId("countryFilter");
    while (country.options.length > 1) country.remove(1);
    for (const name of snapshot.period.countries) {
      const option = element("option", name);
      option.value = name;
      country.append(option);
    }
    byId("coverage").replaceChildren(
      document.createTextNode(
        `${snapshot.source.date_min} to ${snapshot.source.date_max}`,
      ),
      element("br"),
      document.createTextNode("Final month ends on 9 December 2011"),
    );
    renderSales();
    renderCustomers();
    renderQuality();
    setView(activeView);
    byId("app").hidden = false;
    for (const button of document.querySelectorAll("[data-view]"))
      button.disabled = false;
  } catch {
    snapshot = undefined;
    byId("loadError").hidden = false;
  } finally {
    byId("loading").hidden = true;
  }
}
byId("retry").addEventListener("click", load);
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  byId("main").focus({ preventScroll: true });
  byId("main").scrollIntoView({ block: "start" });
});
byId("filters").addEventListener("submit", (event) => event.preventDefault());
byId("filters").addEventListener("change", renderSales);
byId("filters").addEventListener("reset", () => {
  byId("monthFilter").value = "complete";
  byId("countryFilter").value = "all";
  queueMicrotask(renderSales);
});
byId("exportCsv").addEventListener("click", () => {
  if (!visibleRows.length) return;
  const blob = new Blob([csv(visibleRows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = element("a");
  link.href = url;
  link.download = `retail-insights-${byId("monthFilter").value}-${byId(
    "countryFilter",
  )
    .value.replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (const button of document.querySelectorAll("[data-view]"))
  button.addEventListener("click", () => {
    if (location.hash !== `#${button.dataset.view}`)
      location.hash = button.dataset.view;
    else setView(button.dataset.view, true);
  });
window.addEventListener("hashchange", () =>
  setView(location.hash.slice(1), true),
);
new ResizeObserver(() => {
  const width = byId("monthlyChart").clientWidth;
  if (width > 0 && Math.round(width) !== lastChartWidth && lastSeries.length)
    renderChart(lastSeries);
}).observe(byId("monthlyChart"));
load();
