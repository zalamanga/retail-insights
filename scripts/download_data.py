"""Download the official archive without publishing customer-level source data."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import ssl
import subprocess
import urllib.request
import urllib.error
import zipfile

ROOT = Path(__file__).resolve().parents[1]
URL = "https://archive.ics.uci.edu/static/public/352/online+retail.zip"
MAX_BYTES = 40 * 1024 * 1024


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def download(force: bool = False) -> dict:
    target = ROOT / "data/raw"
    target.mkdir(parents=True, exist_ok=True)
    archive = target / "online-retail.zip"
    if not archive.exists() or force:
        temporary = archive.with_suffix(".part")
        try:
            request = urllib.request.Request(URL, headers={"User-Agent": "RetailInsights/1.0 (+reproducible-portfolio)"})
            count = 0
            try:
                with urllib.request.urlopen(request, timeout=90) as response, temporary.open("wb") as output:
                    while chunk := response.read(1024 * 1024):
                        count += len(chunk)
                        if count > MAX_BYTES:
                            raise ValueError("Official archive exceeded the 40 MiB download limit")
                        output.write(chunk)
            except urllib.error.URLError as error:
                if os.name != "nt" or not isinstance(error.reason, ssl.SSLCertVerificationError):
                    raise
                # Windows' curl uses the system TLS trust stack; certificate checks remain enabled.
                subprocess.run(["curl.exe", "--fail", "--silent", "--show-error", "--proto", "=https",
                                "--tlsv1.2", "--max-filesize", str(MAX_BYTES), "--max-time", "180",
                                "--output", str(temporary), URL], check=True, timeout=190)
                if temporary.stat().st_size > MAX_BYTES:
                    raise ValueError("Official archive exceeded the 40 MiB download limit")
            temporary.replace(archive)
        finally:
            temporary.unlink(missing_ok=True)
    with zipfile.ZipFile(archive) as source:
        entries = [info for info in source.infolist() if info.filename == "Online Retail.xlsx"]
        if len(entries) != 1 or entries[0].file_size > MAX_BYTES:
            raise ValueError("Archive must contain one bounded Online Retail.xlsx entry")
        workbook = target / "Online Retail.xlsx"
        with source.open(entries[0]) as incoming, workbook.open("wb") as output:
            while chunk := incoming.read(1024 * 1024):
                output.write(chunk)
    metadata = {
        "name": "Online Retail", "creator": "Daqing Chen", "repository": "UCI Machine Learning Repository",
        "dataset_url": "https://archive.ics.uci.edu/dataset/352/online+retail", "download_url": URL,
        "doi": "10.24432/C5BW33", "license": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/",
        "expected_rows": 541909, "currency": "GBP", "source_period": ["2010-12-01", "2011-12-09"],
        "zip_sha256": digest(archive), "xlsx_sha256": digest(workbook),
        "zip_bytes": archive.stat().st_size, "xlsx_bytes": workbook.stat().st_size,
        "customer_level_data_published": False,
    }
    expected_path = ROOT / "data/source.json"
    if expected_path.exists() and not force:
        previous = json.loads(expected_path.read_text(encoding="utf-8"))
        for field in ("zip_sha256", "xlsx_sha256"):
            if previous.get(field) and previous[field] != metadata[field]:
                raise ValueError(f"Official source changed: {field}; review before using --force")
    expected_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    return metadata


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Explicitly accept a changed official archive after review")
    result = download(parser.parse_args().force)
    print(json.dumps({key: result[key] for key in ("zip_bytes", "zip_sha256", "xlsx_sha256")}))
