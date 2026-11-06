"""Step 4c · Kaggle: create (first time) or version (every week) the two datasets.

Auth: KAGGLE_API_TOKEN, or the legacy pair KAGGLE_USERNAME + KAGGLE_KEY. Without them the step is
skipped with a visible warning (exit 0). Any error once credentials exist fails the step.

Each upload is built in a temporary folder: dataset-metadata.json gets `description` = README.md
without its YAML header, and sub-folders are flattened (weeks/2026-W44.csv -> weeks_2026-W44.csv)
so Kaggle shows every file as a CSV instead of a zip. The repository files are never modified.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FOLDERS = ["datasets/fmcsa", "datasets/ats"]


def has_credentials() -> bool:
    if os.environ.get("KAGGLE_API_TOKEN", "").strip():
        return True
    return bool(os.environ.get("KAGGLE_USERNAME", "").strip() and os.environ.get("KAGGLE_KEY", "").strip())


def readme_without_yaml(text: str) -> str:
    return re.sub(r"\A---\n.*?\n---\n", "", text, count=1, flags=re.S).strip() + "\n"


def build(folder: Path, dest: Path) -> dict:
    meta = json.loads((folder / "dataset-metadata.json").read_text())
    meta["description"] = readme_without_yaml((folder / "README.md").read_text())
    for f in sorted(folder.rglob("*")):
        if not f.is_file() or f.name in ("README.md", "dataset-metadata.json"):
            continue
        rel = f.relative_to(folder)
        shutil.copy2(f, dest / "_".join(rel.parts))
    # Los recursos con comodín (p. ej. "weeks_YYYY-Www.csv") se expanden a los archivos reales; los que no existen
    # se sacan (Kaggle rechaza la subida si un recurso no está).
    resources = []
    for r in meta.get("resources", []):
        path = r.get("path", "")
        if "YYYY" in path:
            pattern = re.compile("^" + re.escape(path).replace("YYYY", r"\d{4}").replace("ww", r"\d{2}") + "$")
            for f in sorted(dest.iterdir()):
                if pattern.match(f.name):
                    resources.append({**r, "path": f.name})
        elif (dest / path).is_file():
            resources.append(r)
    if "resources" in meta:
        meta["resources"] = resources
    (dest / "dataset-metadata.json").write_text(json.dumps(meta, indent=2, ensure_ascii=False))
    return meta


def kaggle(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    print("$ kaggle " + " ".join(args), flush=True)
    res = subprocess.run(["kaggle", *args], capture_output=True, text=True)
    print(res.stdout + res.stderr, flush=True)
    if check and res.returncode != 0:
        raise SystemExit(f"kaggle {args[0]} {args[1]} failed")
    return res


def main() -> int:
    if not has_credentials():
        print("::warning title=Kaggle skipped::KAGGLE_API_TOKEN (or KAGGLE_USERNAME + KAGGLE_KEY) secret is not set. Datasets were NOT uploaded to Kaggle this week.")
        return 0
    week = (ROOT / "datasets" / "WEEK").read_text().strip()
    for rel in FOLDERS:
        with tempfile.TemporaryDirectory() as tmp:
            meta = build(ROOT / rel, Path(tmp))
            status = kaggle("datasets", "status", meta["id"], check=False)
            out = (status.stdout + status.stderr).lower()
            exists = status.returncode == 0 and not re.search(r"404|not found|error", out)
            if exists:
                kaggle("datasets", "version", "-p", tmp, "-m", f"Week {week}")
            else:
                res = kaggle("datasets", "create", "-p", tmp, "--public", check=False)
                if res.returncode != 0 or "already" in (res.stdout + res.stderr).lower():
                    # Si ya existía (el chequeo de estado puede fallar con 403 mientras Kaggle procesa), se versiona.
                    if "already" not in (res.stdout + res.stderr).lower():
                        raise SystemExit("kaggle datasets create failed")
                    kaggle("datasets", "version", "-p", tmp, "-m", f"Week {week}")
                    exists = True
            print(f"Kaggle {'versioned' if exists else 'created'}: https://www.kaggle.com/datasets/{meta['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
