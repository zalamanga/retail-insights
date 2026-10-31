"""Execute the SQL analysis; the offline fixture writes to a separate output root."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from retail_insights.pipeline import build_analysis, to_json


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", action="store_true", help="Use the clearly synthetic offline fixture")
    parser.add_argument("--input", type=Path, help="Alternative official workbook (hash checked), or a synthetic CSV with --sample")
    parser.add_argument("--output-root", type=Path)
    args = parser.parse_args()
    destination = args.output_root or (ROOT / ".local/sample-output" if args.sample else ROOT)
    if args.sample and destination.resolve() == ROOT.resolve():
        parser.error("Synthetic fixtures must not overwrite the official published analysis")
    source = args.input or (ROOT / "data/sample/online_retail_sample.csv" if args.sample else ROOT / "data/raw/Online Retail.xlsx")
    report = build_analysis(source, destination, expected_rows=None if args.sample else 541909, sample=args.sample)
    print(json.dumps({"scope": report["scope"], "kpis": report["kpis"], "quality": report["quality"], "reconciliation": report["reconciliation"]}, default=to_json))
