"""Execute the analysis notebook's plain Python cells without a notebook server."""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
from pathlib import Path
import time


def execute(path: Path, write: bool) -> dict:
    notebook = json.loads(path.read_text(encoding="utf-8"))
    if notebook.get("nbformat") != 4:
        raise ValueError("Expected notebook format 4")
    root = path.resolve().parents[1]
    previous_directory = Path.cwd()
    namespace = {"__name__": "__main__", "__file__": str(path.resolve())}
    count = 0
    started = time.monotonic()
    try:
        os.chdir(root)
        for index, cell in enumerate(notebook["cells"]):
            if cell["cell_type"] != "code":
                continue
            source = "".join(cell["source"])
            output = io.StringIO()
            count += 1
            with contextlib.redirect_stdout(output):
                exec(compile(source, f"{path.name}:cell-{index + 1}", "exec"), namespace)
            if write:
                cell["execution_count"] = count
                text = output.getvalue()
                cell["outputs"] = [{"output_type": "stream", "name": "stdout", "text": text.splitlines(keepends=True)}] if text else []
        if write:
            path.write_text(json.dumps(notebook, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    finally:
        os.chdir(previous_directory)
    return {"result": "PASS", "notebook": path.name, "code_cells": count, "seconds": round(time.monotonic() - started, 3), "outputs_saved": write}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Save actual stdout outputs back into the notebook")
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[1] / "notebooks/01_retail_analysis.ipynb"
    print(json.dumps(execute(target, args.write)))
