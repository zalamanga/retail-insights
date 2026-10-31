# Offline test fixture

`online_retail_sample.csv` contains **16 synthetic lines**, not a sample of real customers or a basis for portfolio findings. It exercises exact duplicates, an anonymous sale, merchandise credits with and without a cancellation prefix, a positive-quantity cancellation anomaly, excluded postage, zero/negative prices, a zero quantity, recurring buyers, missing cohort activity, and a five-decimal source price.

Run `python scripts/build.py --sample` from the repository root. Results go to `.local/sample-output/`, so the fixture cannot replace the published official-dataset analysis.

The independent expected totals after deduplication and exclusions are GBP 31.7038 gross sales, GBP 3.0000 credits, GBP 28.7038 net sales, 7 invoices, 19 sold units, and 2 credited units. Quantizing `1.23455` to four decimals **before** multiplying by quantity 3 yields GBP 3.7038.
