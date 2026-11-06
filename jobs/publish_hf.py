"""Step 4b · Hugging Face: upload datasets/fmcsa and datasets/ats as two dataset repos.

Skips (exit 0, with a visible warning) when HF_TOKEN is not set, so the weekly job still works
before the token is configured. Any error once the token exists fails the step.
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPOS = {
    "datasets/fmcsa": "cleanyield/new-us-trucking-companies-weekly",
    "datasets/ats": "cleanyield/weekly-tech-hiring-index",
}


def main() -> int:
    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        print("::warning title=Hugging Face skipped::HF_TOKEN secret is not set. Datasets were NOT uploaded to Hugging Face this week.")
        return 0
    from huggingface_hub import HfApi

    week = (ROOT / "datasets" / "WEEK").read_text().strip()
    api = HfApi(token=token)
    for folder, repo_id in REPOS.items():
        api.create_repo(repo_id, repo_type="dataset", exist_ok=True)
        api.upload_folder(
            folder_path=str(ROOT / folder),
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=f"Week {week}",
            ignore_patterns=["dataset-metadata.json"],
        )
        print(f"Uploaded {folder} -> https://huggingface.co/datasets/{repo_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
