from datetime import date
from decimal import Decimal
import json

import pandas as pd
import pytest

from retail_insights.pipeline import (
    ROOT, COLUMNS, assert_reconciliation, build_analysis, connect, create_marts,
    integer, load_frame, price, records, scalar, summarize, write_exports,
)


@pytest.fixture
def source_frame():
    return pd.read_csv(ROOT / "data/sample/online_retail_sample.csv", dtype=object)


@pytest.fixture
def analysis(source_frame):
    with connect() as connection:
        quality = load_frame(connection, source_frame)
        coverage = create_marts(connection)
        result = summarize(connection, quality, coverage, {"fixture": True})
        yield connection, result


def test_exact_eight_field_deduplication(analysis):
    _, result = analysis
    assert result["quality"]["rows_raw"] == 16
    assert result["quality"]["rows_after_dedup"] == 15
    assert result["quality"]["duplicate_rows"] == 1


def test_similar_line_with_different_original_description_is_not_duplicate(source_frame):
    extra = source_frame.iloc[[0]].copy()
    extra["Description"] = "BLUE NOTEBOOK "
    with connect() as connection:
        quality = load_frame(connection, pd.concat([source_frame, extra], ignore_index=True))
        assert quality["rows_after_dedup"] == 16


def test_duplicate_anonymous_sale_is_retained_once(source_frame):
    anonymous = source_frame[source_frame["CustomerID"].isna()].iloc[[0]].copy()
    with connect() as connection:
        quality = load_frame(connection, pd.concat([source_frame, anonymous], ignore_index=True))
        assert quality["duplicate_rows"] == 2
        assert scalar(connection, "SELECT count(*) FROM sales_lines WHERE customer_id IS NULL") == 1


def test_revenue_uses_exact_decimal_and_keeps_anonymous_sale(analysis):
    connection, _ = analysis
    assert scalar(connection, "SELECT sum(gross_sales) FROM monthly_country") == Decimal("31.7038")
    assert scalar(connection, "SELECT sum(credits) FROM monthly_country") == Decimal("3.0000")
    assert scalar(connection, "SELECT sum(net_sales) FROM monthly_country") == Decimal("28.7038")
    assert scalar(connection, "SELECT sum(signed_amount) FROM sales_lines WHERE customer_id IS NULL") == Decimal("2.5000")


def test_credit_without_c_prefix_is_still_credit(analysis):
    connection, result = analysis
    assert result["quality"]["credits_without_c_prefix"] == 1
    assert scalar(connection, "SELECT signed_amount FROM included_lines WHERE invoice='500010'") == Decimal("-0.5000")


def test_cancel_invoice_with_positive_quantity_is_excluded(analysis):
    connection, _ = analysis
    assert scalar(connection, "SELECT exclusion_reason FROM transaction_lines WHERE invoice='C500013'") == "cancel_invoice_positive_quantity"


def test_nonmerchandise_and_nonpositive_prices_are_exclusive(analysis):
    _, result = analysis
    reasons = {item["reason"]: item["rows"] for item in result["quality"]["reasons"]}
    assert reasons["non_merchandise_code"] == 1
    assert reasons["nonpositive_or_invalid_price"] == 2
    assert reasons["invalid_quantity"] == 1
    assert result["quality"]["excluded_rows"] == 5


def test_missing_customer_id_is_coverage_not_exclusion(analysis):
    _, result = analysis
    assert result["quality"]["missing_customer_id_rows"] == 1
    assert result["quality"]["unidentified_sales_rows"] == 1
    assert result["customers"]["identified_buyers"] == 3


def test_price_rounds_before_multiplication_and_reports_affected_rows(analysis):
    connection, result = analysis
    assert price("1.23455") == "1.2346"
    assert scalar(connection, "SELECT signed_amount FROM included_lines WHERE invoice='500012'") == Decimal("3.7038")
    assert result["quality"]["price_rounded_to_four_dp_rows_raw"] == 1


@pytest.mark.parametrize("value", ["nan", "inf", "bad", None])
def test_invalid_price_is_not_coerced_to_zero(value):
    assert price(value) is None


@pytest.mark.parametrize("value", ["1.5", "NaN", "1000000001", "bad"])
def test_quantity_must_be_bounded_integer(value):
    assert integer(value) is None


def test_month_country_orders_additive_but_product_orders_not(analysis):
    connection, _ = analysis
    assert scalar(connection, "SELECT sum(orders) FROM monthly_country") == 7
    assert scalar(connection, "SELECT count(DISTINCT invoice) FROM sales_lines") == 7
    assert scalar(connection, "SELECT sum(orders) FROM monthly_country_product") == 8


def test_repeated_customer_is_counted_once_across_months(analysis):
    _, result = analysis
    assert result["customers"]["identified_buyers"] == 3
    assert result["customers"]["repeat_buyers"] == 2
    assert result["customers"]["repeat_rate"] == 0.666667


def test_rfm_as_of_and_gross_spend_are_explicit(analysis):
    connection, result = analysis
    assert result["customers"]["as_of"] == "2011-12-10"
    row = records(connection, "SELECT * FROM customer_rfm_private WHERE customer_id='10001'")[0]
    assert row["recency_days"] == 1
    assert row["frequency"] == 3
    assert row["monetary"] == Decimal("17.0000")
    assert row["segment"] == "Other repeat buyers"


def test_cohorts_use_first_observed_positive_sale_and_right_censoring(analysis):
    connection, _ = analysis
    first = records(connection, "SELECT * FROM cohort_retention WHERE cohort_month='2011-01' AND period_index=0")[0]
    assert first["cohort_size"] == first["customers"] == 1
    assert first["retention_rate"] == 1
    future = records(connection, "SELECT * FROM cohort_retention WHERE cohort_month='2011-02' AND period_index=12")[0]
    assert future["observed"] is False
    assert future["customers"] is None
    assert future["retention_rate"] is None


def test_zero_activity_is_observed_zero_not_unobserved(analysis):
    connection, _ = analysis
    row = records(connection, "SELECT * FROM cohort_retention WHERE cohort_month='2010-12' AND period_index=2")[0]
    assert row["observed"] is True
    assert row["customers"] == 0
    assert row["retention_rate"] == 0


def test_complete_source_calendar_months_and_partial_last_month(analysis):
    _, result = analysis
    months = result["period"]["months"]
    assert len(months) == 13
    assert months[0] == {"month": "2010-12", "complete": True}
    assert sum(item["complete"] for item in months) == 12
    assert months[-1] == {"month": "2011-12", "complete": False}


def test_every_quality_and_money_total_reconciles(analysis):
    connection, result = analysis
    assert_reconciliation(connection, result["quality"])


@pytest.mark.parametrize("field,value", [("Country", "Germany"), ("InvoiceDate", "2011-01-03 10:00:00"), ("CustomerID", "99999")])
def test_invoice_scope_anomalies_fail_instead_of_miscounting(source_frame, field, value):
    extra = source_frame.iloc[[0]].copy()
    extra[field] = value
    with connect() as connection:
        load_frame(connection, pd.concat([source_frame, extra], ignore_index=True))
        with pytest.raises(ValueError, match="Positive invoices cross|multiple identified customers"):
            create_marts(connection)


def test_original_schema_is_required(source_frame):
    with connect() as connection, pytest.raises(ValueError, match="eight columns"):
        load_frame(connection, source_frame.drop(columns=["Country"]))


def test_offline_build_exports_only_aggregate_data(tmp_path):
    report = build_analysis(ROOT / "data/sample/online_retail_sample.csv", tmp_path, sample=True)
    assert report["reconciliation"] == "PASS"
    published = json.loads((tmp_path / "dashboard/data/analysis.json").read_text(encoding="utf-8"))
    assert published["source"]["fixture"] is True
    def reject_identifiers(value):
        if isinstance(value, dict):
            assert "customer_id" not in value
            for item in value.values():
                reject_identifiers(item)
        elif isinstance(value, list):
            for item in value:
                reject_identifiers(item)
    reject_identifiers(published)
    for csv in (tmp_path / "reports/exports").glob("*.csv"):
        assert "customer_id" not in csv.read_text(encoding="utf-8").splitlines()[0]
    assert published["products"]


def test_expected_official_row_count_does_not_silently_accept_fixture(tmp_path):
    with pytest.raises(ValueError, match="541909"):
        build_analysis(ROOT / "data/sample/online_retail_sample.csv", tmp_path, expected_rows=541909, sample=True)


def test_csv_exports_have_explicit_order_independent_of_table_storage(analysis, tmp_path):
    connection, result = analysis
    original = tmp_path / "original"
    reordered = tmp_path / "reordered"
    write_exports(connection, original, result["quality"])
    for table in ("monthly_country", "monthly_country_product", "customer_segments", "cohort_retention"):
        connection.execute(f"CREATE OR REPLACE TABLE {table} AS SELECT * FROM {table} ORDER BY ALL DESC")
    shuffled_quality = dict(result["quality"])
    shuffled_quality["status_counts"] = list(reversed(result["quality"]["status_counts"]))
    write_exports(connection, reordered, shuffled_quality)
    for path in original.glob("*.csv"):
        assert path.read_bytes() == (reordered / path.name).read_bytes()
        assert b"\r\n" not in path.read_bytes()
