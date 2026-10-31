from __future__ import annotations

import calendar
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import hashlib
import json
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
COLUMNS = ["InvoiceNo", "StockCode", "Description", "Quantity", "InvoiceDate", "UnitPrice", "CustomerID", "Country"]
PRICE_PRECISION = Decimal("0.0001")


def text(value: object) -> str | None:
    if pd.isna(value):
        return None
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip() or None


def integer(value: object) -> int | None:
    try:
        number = Decimal(str(value))
        if not number.is_finite() or number != number.to_integral_value() or abs(number) > 1_000_000_000:
            return None
        return int(number)
    except (InvalidOperation, ValueError, TypeError):
        return None


def price(value: object) -> str | None:
    try:
        number = Decimal(str(value))
        if not number.is_finite() or abs(number) >= Decimal("1000000000"):
            return None
        return str(number.quantize(PRICE_PRECISION, rounding=ROUND_HALF_UP))
    except (InvalidOperation, ValueError, TypeError):
        return None


def connect(database: str | Path = ":memory:") -> duckdb.DuckDBPyConnection:
    connection = duckdb.connect(str(database))
    connection.execute("SET threads = 2")
    connection.execute("SET memory_limit = '512MB'")
    return connection


def load_frame(connection: duckdb.DuckDBPyConnection, original: pd.DataFrame) -> dict:
    if list(original.columns) != COLUMNS:
        raise ValueError(f"Expected the original eight columns in order: {COLUMNS}")
    raw_rows = len(original)
    raw_missing = int(original["CustomerID"].isna().sum())
    rounded_price_rows = 0
    zero_price_rows = 0
    negative_price_rows = 0
    for value, count in original["UnitPrice"].value_counts(dropna=True).items():
        converted = price(value)
        if converted is not None:
            exact = Decimal(str(value))
            if exact != Decimal(converted):
                rounded_price_rows += int(count)
            if exact == 0:
                zero_price_rows += int(count)
            elif exact < 0:
                negative_price_rows += int(count)
    deduped = original.drop_duplicates(subset=COLUMNS, keep="first").copy()
    normalized = pd.DataFrame({
        "invoice": deduped["InvoiceNo"].map(text),
        "stock_code": deduped["StockCode"].map(text),
        "description": deduped["Description"].map(text).fillna("Description unavailable"),
        "quantity": pd.array(deduped["Quantity"].map(integer), dtype="Int64"),
        "invoice_date": pd.to_datetime(deduped["InvoiceDate"], errors="coerce", format="mixed"),
        "unit_price_text": deduped["UnitPrice"].map(price),
        "customer_id": deduped["CustomerID"].map(text),
        "country": deduped["Country"].map(text).fillna("Unknown"),
    })
    connection.register("normalized_frame", normalized)
    connection.execute("""
        CREATE OR REPLACE TABLE normalized_lines AS
        SELECT invoice, stock_code, description, quantity, invoice_date,
            try_cast(unit_price_text AS DECIMAL(18,4)) AS unit_price, customer_id, country
        FROM normalized_frame
    """)
    connection.unregister("normalized_frame")
    connection.execute((ROOT / "sql/01_clean.sql").read_text(encoding="utf-8"))
    return {"rows_raw": raw_rows, "rows_after_dedup": len(deduped), "duplicate_rows": raw_rows - len(deduped),
            "missing_customer_id_rows": raw_missing,
            "missing_description_rows_raw": int(original["Description"].isna().sum()),
            "zero_price_rows_raw": zero_price_rows, "negative_price_rows_raw": negative_price_rows,
            "price_rounded_to_four_dp_rows_raw": rounded_price_rows,
            "missing_customer_id_rows_after_dedup": int(deduped["CustomerID"].isna().sum())}


def records(connection: duckdb.DuckDBPyConnection, query: str, parameters: dict | None = None) -> list[dict]:
    result = connection.execute(query, parameters or {})
    columns = [entry[0] for entry in result.description]
    return [dict(zip(columns, row)) for row in result.fetchall()]


def scalar(connection: duckdb.DuckDBPyConnection, query: str):
    return connection.execute(query).fetchone()[0]


def create_marts(connection: duckdb.DuckDBPyConnection) -> dict:
    first, last = connection.execute("SELECT min(invoice_date)::DATE, max(invoice_date)::DATE FROM normalized_lines").fetchone()
    if first is None or last is None:
        raise ValueError("No dated source transactions")
    crossing = scalar(connection, """
        SELECT count(*) FROM (SELECT invoice FROM sales_lines GROUP BY invoice
            HAVING count(DISTINCT month) > 1 OR count(DISTINCT country) > 1)
    """)
    if crossing:
        raise ValueError("Positive invoices cross month/country; additive overview orders would be invalid")
    conflicting_owners = scalar(connection, """
        SELECT count(*) FROM (SELECT invoice FROM sales_lines GROUP BY invoice
            HAVING count(DISTINCT customer_id) > 1)
    """)
    if conflicting_owners:
        raise ValueError("A positive invoice belongs to multiple identified customers")
    connection.execute((ROOT / "sql/02_facts.sql").read_text(encoding="utf-8"))
    month_count = (last.year - first.year) * 12 + last.month - first.month + 1
    customer_sql = (ROOT / "sql/03_customers.sql").read_text(encoding="utf-8")
    # Each statement binds only the values it uses, avoiding DuckDB's unused-parameter errors.
    for statement in customer_sql.split(";"):
        if statement.strip():
            candidates = {"as_of": (last + timedelta(days=1)).isoformat(), "last_day": last.isoformat(), "month_count": month_count}
            connection.execute(statement, {key: value for key, value in candidates.items() if f"${key}" in statement})
    return {"first": first, "last": last, "as_of": last + timedelta(days=1), "month_count": month_count}


def to_json(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, date):
        return value.isoformat()
    raise TypeError(type(value).__name__)


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=to_json, allow_nan=False) + "\n", encoding="utf-8")


def summarize(connection: duckdb.DuckDBPyConnection, base_quality: dict, coverage: dict, source: dict) -> dict:
    first, last = coverage["first"], coverage["last"]
    months = []
    for offset in range(coverage["month_count"]):
        year, month_index = divmod(first.year * 12 + first.month - 1 + offset, 12)
        month = month_index + 1
        month_start = date(year, month, 1)
        month_end = date(year, month, calendar.monthrange(year, month)[1])
        months.append({"month": f"{year:04d}-{month:02d}", "complete": first <= month_start and last >= month_end})
    quality = dict(base_quality)
    quality.update(records(connection, """
        SELECT count(*) FILTER (WHERE exclusion_reason IS NOT NULL) AS excluded_rows,
            count(*) FILTER (WHERE exclusion_reason IS NULL AND quantity > 0) AS included_sales_rows,
            count(*) FILTER (WHERE exclusion_reason IS NULL AND quantity < 0) AS included_credit_rows,
            count(*) FILTER (WHERE exclusion_reason IS NULL AND quantity > 0 AND customer_id IS NULL) AS unidentified_sales_rows,
            count(*) FILTER (WHERE exclusion_reason IS NULL AND quantity < 0 AND NOT starts_with(invoice, 'C')) AS credits_without_c_prefix
        FROM transaction_lines
    """)[0])
    quality["status_counts"] = records(connection, """
        SELECT coalesce(exclusion_reason, CASE WHEN quantity > 0 THEN 'included_sale' ELSE 'included_credit' END) AS reason,
            count(*) AS rows FROM transaction_lines GROUP BY reason ORDER BY reason
    """)
    quality["reasons"] = [item for item in quality["status_counts"] if item["reason"] not in ("included_sale", "included_credit")]
    quality["missing_customer_id_scope"] = "Overlapping coverage statistic, not an exclusive exclusion reason. Unidentified sales stay in revenue."
    customer_summary = records(connection, """
        SELECT count(*) AS identified_buyers, count(*) FILTER (WHERE frequency >= 2) AS repeat_buyers,
            coalesce(round(count(*) FILTER (WHERE frequency >= 2)::DOUBLE / nullif(count(*), 0), 6), 0) AS repeat_rate
        FROM customer_rfm_private
    """)[0]
    customer_summary.update({"scope": "full_period_identified_sales_buyers", "as_of": coverage["as_of"].isoformat(),
        "segments": records(connection, "SELECT * FROM customer_segments ORDER BY customers DESC, segment"),
        "rfm_rules": {"recency": "Days since last positive merchandise invoice, as of the day after the source end date.",
            "frequency": "Distinct positive merchandise invoices across the entire source period.",
            "monetary": "Gross positive merchandise sales in GBP, before credits; no profit or lifetime value claim.",
            "segments": "Priority: recent<=30 days & frequency>=5; lapsed>90 days & frequency>=2; other frequency>=5; other frequency>=2; one-time."}})
    return {"schema_version": 1,
        "source": {**source, "url": source.get("dataset_url"), "sha256": source.get("xlsx_sha256"),
            "rows": base_quality["rows_raw"], "date_min": first.isoformat(), "date_max": last.isoformat(), "currency": "GBP"},
        "definitions": {
            "sales": "Positive-quantity, positive-price merchandise lines after exact eight-field deduplication.",
            "credits": "Absolute value of negative-quantity merchandise lines; not matched to original sales or proven physical returns.",
            "net_sales": "Gross merchandise line value minus merchandise credits. Separately coded shipping, fees and adjustments are excluded. Tax treatment is not documented by the source; this is not profit or cash collected.",
            "non_merchandise": "Include only stock codes matching ^[0-9]{5}[A-Z]{0,2}$. Excludes POST, DOT, M, D, bank charges, gift vouchers and other adjustment/special codes.",
            "money": "Parse source price with Decimal(str(value)); ROUND_HALF_UP to 4 decimal places before integer quantity multiplication. Store price and line amount as DECIMAL(18,4). Aggregate exact values; round to 2 decimals only for display. JSON GBP numbers have <=4dp; consumers should sum scaled 1/10000 integers.",
            "orders": "Distinct positive merchandise invoices. Validated that each positive invoice belongs to one month and one country; overview orders are additive. Product orders are NOT additive across products.",
            "country": "Customer residence recorded by the dataset; not a delivery destination or market-size estimate.",
            "coverage": "Complete months use overall source calendar coverage, not a requirement for transactions on every day. Last December is only days 1-9.",
            "customers": "RFM, repeat buyers and cohorts use identified positive-sales buyers over the full period, independent of dashboard month/country filters. No customer identifiers are published.",
            "cohorts": "First observed positive-sale month, not true acquisition. Activity counts any positive sale in a month, not uninterrupted retention. Future months are null/unobserved; last source month is partial."
        },
        "period": {"months": months, "countries": [row[0] for row in connection.execute("SELECT DISTINCT country FROM included_lines ORDER BY country").fetchall()]},
        "overview": records(connection, "SELECT * FROM monthly_country ORDER BY month,country"),
        "products": records(connection, "SELECT * FROM monthly_country_product ORDER BY month,country,stock_code"),
        "customers": customer_summary,
        "cohorts": {"scope": "full_period_identified_sales_buyers", "rows": records(connection, "SELECT * FROM cohort_retention ORDER BY cohort_month,period_index")},
        "quality": quality, "findings": make_findings(connection, customer_summary, months)}


def make_findings(connection: duckdb.DuckDBPyConnection, customers: dict, months: list[dict]) -> list[dict]:
    totals = records(connection, "SELECT sum(gross_sales) AS gross, sum(credits) AS credits, sum(net_sales) AS net FROM monthly_country")[0]
    complete = [item["month"] for item in months if item["complete"]]
    placeholders = ",".join("?" for _ in complete)
    peak = None
    if complete:
        peak = connection.execute(f"SELECT month,sum(net_sales) AS net FROM monthly_country WHERE month IN ({placeholders}) GROUP BY month ORDER BY net DESC,month LIMIT 1", complete).fetchone()
    missing = scalar(connection, "SELECT coalesce(sum(signed_amount),0) FROM sales_lines WHERE customer_id IS NULL")
    credit_rate = float(totals["credits"] / totals["gross"]) if totals["gross"] else 0
    findings = [
        {"id": "credit-exposure", "title": "Merchandise credits need separate monitoring", "detail": f"Credits equal {credit_rate:.2%} of gross merchandise sales. This is a credit-value ratio, not a matched physical-return rate.", "scope": "full_period", "metric": round(credit_rate, 6)},
        {"id": "repeat-buyers", "title": "Repeat purchase among identified buyers", "detail": f"{customers['repeat_buyers']:,} of {customers['identified_buyers']:,} identified buyers have at least two positive invoices ({customers['repeat_rate']:.2%}). Anonymous purchases are outside this denominator.", "scope": "full_period_identified_sales_buyers", "metric": customers["repeat_rate"]},
        {"id": "identity-coverage", "title": "Unidentified sales remain in the financial analysis", "detail": f"GBP {missing:,.4f} in gross merchandise sales lacks a customer ID; it remains in revenue but cannot be assigned to customer segments or cohorts.", "scope": "full_period", "metric": missing},
    ]
    if peak:
        findings.append({"id": "peak-complete-month", "title": "Peak net-sales month among complete months", "detail": f"{peak[0]} records GBP {peak[1]:,.4f} net merchandise sales. Partial source months are excluded from this comparison.", "scope": "complete_months", "month": peak[0], "metric": peak[1]})
    return findings


def assert_reconciliation(connection: duckdb.DuckDBPyConnection, quality: dict) -> None:
    if quality["rows_raw"] != quality["duplicate_rows"] + quality["rows_after_dedup"]:
        raise AssertionError("Raw-row reconciliation failed")
    if quality["rows_after_dedup"] != sum(item["rows"] for item in quality["status_counts"]):
        raise AssertionError("Exclusive quality reasons do not reconcile")
    if quality["excluded_rows"] != sum(item["rows"] for item in quality["reasons"]):
        raise AssertionError("Exclusion reasons do not reconcile")
    if quality["rows_after_dedup"] != quality["excluded_rows"] + quality["included_sales_rows"] + quality["included_credit_rows"]:
        raise AssertionError("Included/excluded rows do not reconcile")
    line = connection.execute("SELECT coalesce(sum(signed_amount),0) FROM included_lines").fetchone()[0]
    overview = connection.execute("SELECT coalesce(sum(net_sales),0) FROM monthly_country").fetchone()[0]
    products = connection.execute("SELECT coalesce(sum(net_sales),0) FROM monthly_country_product").fetchone()[0]
    if not line == overview == products:
        raise AssertionError("Exact decimal sales reconciliation failed")
    if scalar(connection, "SELECT count(*) FROM monthly_country WHERE gross_sales-credits != net_sales"):
        raise AssertionError("Gross minus credits does not equal net")
    if scalar(connection, "SELECT count(*) FROM cohort_retention WHERE period_index=0 AND (customers!=cohort_size OR retention_rate!=1)"):
        raise AssertionError("Cohort month-zero reconciliation failed")


def write_exports(connection: duckdb.DuckDBPyConnection, destination: Path, quality: dict) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    sort_keys = {
        "monthly_country": "month, country",
        "monthly_country_product": "month, country, stock_code",
        "customer_segments": "customers DESC, segment ASC",
        "cohort_retention": "cohort_month, period_index",
    }
    for table, order_by in sort_keys.items():
        path = str(destination / f"{table}.csv").replace("'", "''")
        connection.execute(f"COPY (SELECT * FROM {table} ORDER BY {order_by}) TO '{path}' (HEADER, DELIMITER ',')")
    pd.DataFrame(quality["status_counts"]).sort_values("reason").to_csv(destination / "quality_reasons.csv", index=False, lineterminator="\n")


def build_analysis(input_path: Path, output_root: Path, expected_rows: int | None = None, sample: bool = False) -> dict:
    output_root.mkdir(parents=True, exist_ok=True)
    cache = output_root / ".local"
    cache.mkdir(exist_ok=True)
    frame = pd.read_csv(input_path, dtype=object) if input_path.suffix.lower() == ".csv" else pd.read_excel(input_path, engine="openpyxl", dtype=object)
    if expected_rows is not None and len(frame) != expected_rows:
        raise ValueError(f"Expected {expected_rows} official rows, received {len(frame)}")
    if sample:
        source = {"name": "Synthetic offline fixture", "dataset_url": None, "license": "Project test fixture", "fixture": True,
                  "xlsx_sha256": hashlib.sha256(input_path.read_bytes()).hexdigest(), "currency": "GBP"}
    else:
        source = json.loads((ROOT / "data/source.json").read_text(encoding="utf-8"))
        actual_sha = hashlib.sha256(input_path.read_bytes()).hexdigest()
        if actual_sha != source["xlsx_sha256"]:
            raise ValueError("Workbook hash differs from data/source.json; rerun download and inspect source")
    database = cache / "retail.duckdb"
    with connect(database) as connection:
        quality = load_frame(connection, frame)
        del frame
        coverage = create_marts(connection)
        if not sample and (coverage["first"], coverage["last"]) != (date(2010, 12, 1), date(2011, 12, 9)):
            raise ValueError("Unexpected official source date coverage")
        analysis = summarize(connection, quality, coverage, source)
        assert_reconciliation(connection, analysis["quality"])
        write_json(output_root / "dashboard/data/analysis.json", analysis)
        write_exports(connection, output_root / "reports/exports", analysis["quality"])
        kpis = records(connection, """
            SELECT sum(gross_sales) AS gross_sales, sum(credits) AS credits, sum(net_sales) AS net_sales,
                sum(orders)::BIGINT AS orders, sum(units_sold)::BIGINT AS units_sold,
                sum(units_credited)::BIGINT AS units_credited FROM monthly_country
        """)[0]
        report = {"source": analysis["source"], "scope": "full_period", "kpis": kpis, "customers": analysis["customers"],
                  "quality": analysis["quality"], "findings": analysis["findings"], "reconciliation": "PASS"}
        write_json(output_root / "reports/kpis.json", report)
        report_path = output_root / "reports/FINDINGS.md"
        report_path.write_text("# Findings from the executed SQL\n\n" + "\n\n".join(f"## {item['title']}\n\n{item['detail']}\n\nScope: `{item['scope']}`." for item in analysis["findings"]) + "\n\nThese are historical descriptive findings. They do not establish causation, forecast current demand, or measure profit.\n", encoding="utf-8")
        return report
