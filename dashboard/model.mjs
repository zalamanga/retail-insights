const MONEY_FIELDS = ["gross_sales", "credits", "net_sales"];
export function scaled(value) {
  if (!Number.isFinite(value)) throw new Error("Invalid monetary value");
  const result = Math.round(value * 10000);
  if (!Number.isSafeInteger(result))
    throw new Error("Monetary value outside supported range");
  return result;
}

export function validateSnapshot(data) {
  if (
    !data ||
    data.schema_version !== 1 ||
    !data.source ||
    !Array.isArray(data.overview) ||
    !Array.isArray(data.products) ||
    !Array.isArray(data.period?.months) ||
    !Array.isArray(data.period?.countries) ||
    !data.customers ||
    !Array.isArray(data.customers.segments) ||
    !Array.isArray(data.cohorts?.rows) ||
    !data.quality
  )
    throw new Error("Unsupported analysis snapshot");
  if (
    data.source.currency !== "GBP" ||
    !/^[a-f0-9]{64}$/i.test(data.source.sha256)
  )
    throw new Error("Missing source provenance");
  const months = new Set();
  for (const period of data.period.months) {
    if (
      !/^\d{4}-\d{2}$/.test(period.month) ||
      typeof period.complete !== "boolean" ||
      months.has(period.month)
    )
      throw new Error("Invalid source periods");
    months.add(period.month);
  }
  const countries = new Set(data.period.countries);
  if (
    !countries.size ||
    [...countries].some((country) => typeof country !== "string" || !country)
  )
    throw new Error("Invalid countries");
  for (const [records, product] of [
    [data.overview, false],
    [data.products, true],
  ]) {
    const keys = new Set();
    for (const row of records) {
      if (!months.has(row.month) || !countries.has(row.country))
        throw new Error("Aggregate outside source coverage");
      for (const key of MONEY_FIELDS) scaled(row[key]);
      if (
        scaled(row.gross_sales) < 0 ||
        scaled(row.credits) < 0 ||
        scaled(row.gross_sales) - scaled(row.credits) !== scaled(row.net_sales)
      )
        throw new Error("Unreconciled monetary aggregate");
      for (const key of ["orders", "units_sold", "units_credited"])
        if (!Number.isSafeInteger(row[key]) || row[key] < 0)
          throw new Error("Invalid count");
      if (
        product &&
        (typeof row.stock_code !== "string" ||
          typeof row.description !== "string")
      )
        throw new Error("Invalid product");
      const key = JSON.stringify([
        row.month,
        row.country,
        ...(product ? [row.stock_code] : []),
      ]);
      if (keys.has(key)) throw new Error("Duplicate aggregate");
      keys.add(key);
    }
  }
  const quality = data.quality;
  for (const key of [
    "rows_raw",
    "rows_after_dedup",
    "duplicate_rows",
    "missing_customer_id_rows",
    "excluded_rows",
    "included_sales_rows",
    "included_credit_rows",
  ])
    if (!Number.isSafeInteger(quality[key]) || quality[key] < 0)
      throw new Error("Invalid quality counts");
  if (
    quality.rows_raw !== quality.rows_after_dedup + quality.duplicate_rows ||
    quality.rows_after_dedup !==
      quality.excluded_rows +
        quality.included_sales_rows +
        quality.included_credit_rows ||
    quality.reasons.reduce((sum, row) => sum + row.rows, 0) !==
      quality.excluded_rows
  )
    throw new Error("Unreconciled quality audit");
  const customers = data.customers;
  if (
    !Number.isSafeInteger(customers.identified_buyers) ||
    !Number.isSafeInteger(customers.repeat_buyers) ||
    customers.repeat_buyers > customers.identified_buyers ||
    customers.repeat_buyers < 0 ||
    !Number.isFinite(customers.repeat_rate) ||
    customers.repeat_rate < 0 ||
    customers.repeat_rate > 1
  )
    throw new Error("Invalid customer population");
  if (
    customers.segments.reduce((sum, row) => sum + row.customers, 0) !==
    customers.identified_buyers
  )
    throw new Error("Customer groups do not reconcile");
  for (const row of data.cohorts.rows) {
    if (
      !months.has(row.cohort_month) ||
      typeof row.observed !== "boolean" ||
      !Number.isSafeInteger(row.period_index) ||
      row.period_index < 0 ||
      !Number.isSafeInteger(row.cohort_size) ||
      row.cohort_size <= 0
    )
      throw new Error("Invalid cohort");
    if (
      row.observed &&
      (!Number.isSafeInteger(row.customers) ||
        row.customers < 0 ||
        row.customers > row.cohort_size ||
        !Number.isFinite(row.retention_rate) ||
        row.retention_rate < 0 ||
        row.retention_rate > 1)
    )
      throw new Error("Invalid observed retention");
    if (
      !row.observed &&
      (row.customers !== null || row.retention_rate !== null)
    )
      throw new Error("Future retention must remain unavailable");
  }
  const overview = summarize(data.overview);
  const productTotals = summarize(data.products);
  for (const key of MONEY_FIELDS)
    if (scaled(overview[key]) !== scaled(productTotals[key]))
      throw new Error("Product and overview totals differ");
  return data;
}

export function filterRows(rows, selection, periods) {
  const complete = new Set(
    periods.filter((period) => period.complete).map((period) => period.month),
  );
  return rows.filter(
    (row) =>
      (selection.month === "all" ||
        (selection.month === "complete"
          ? complete.has(row.month)
          : row.month === selection.month)) &&
      (selection.country === "all" || row.country === selection.country),
  );
}

export function summarize(rows) {
  const sums = {
    gross_sales: 0,
    credits: 0,
    net_sales: 0,
    orders: 0,
    units_sold: 0,
    units_credited: 0,
  };
  for (const row of rows) {
    for (const key of MONEY_FIELDS) sums[key] += scaled(row[key]);
    for (const key of ["orders", "units_sold", "units_credited"])
      sums[key] += row[key];
  }
  for (const key of MONEY_FIELDS) {
    if (!Number.isSafeInteger(sums[key]))
      throw new Error("Aggregate exceeds supported range");
    sums[key] /= 10000;
  }
  return sums;
}

export function monthlySeries(rows, coveredMonths = []) {
  const groups = new Map(coveredMonths.map((month) => [month, []]));
  for (const row of rows) {
    if (!groups.has(row.month)) groups.set(row.month, []);
    groups.get(row.month).push(row);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, ...summarize(values) }));
}

export function productLeaders(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.stock_code)) groups.set(row.stock_code, []);
    groups.get(row.stock_code).push(row);
  }
  return [...groups]
    .map(([stock_code, values]) => {
      const totals = summarize(values);
      delete totals.orders;
      return {
        stock_code,
        description: values.map((row) => row.description).sort()[0],
        ...totals,
      };
    })
    .sort(
      (a, b) =>
        scaled(b.net_sales) - scaled(a.net_sales) ||
        a.stock_code.localeCompare(b.stock_code),
    );
}

export function csv(rows) {
  const keys = [
    "month",
    "country",
    "gross_sales",
    "credits",
    "net_sales",
    "orders",
    "units_sold",
    "units_credited",
  ];
  const quote = (value, text = false) => {
    const original = String(value);
    const safe =
      text && (/^\s*[=+\-@]/.test(original) || /^[\t\r]/.test(original))
        ? `'${original}`
        : original;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return (
    "\ufeff" +
    [
      keys.map((key) => quote(key)).join(","),
      ...rows.map((row) =>
        keys
          .map((key) =>
            quote(
              MONEY_FIELDS.includes(key)
                ? (scaled(row[key]) / 10000).toFixed(4)
                : row[key],
              key === "country" || key === "month",
            ),
          )
          .join(","),
      ),
    ].join("\r\n") +
    "\r\n"
  );
}
