---
pretty_name: Weekly Tech Hiring Index (Greenhouse & Lever job boards)
license: cc-by-4.0
language:
- en
tags:
- tabular
- timeseries
- jobs
- hiring
- labor-market
- recruiting
- tech-stack
size_categories:
- 1K<n<10K
configs:
- config_name: technologies
  data_files: tech_weekly.csv
- config_name: companies
  data_files: company_weekly.csv
---

# Weekly Tech Hiring Index (Greenhouse & Lever job boards)

A weekly snapshot of **how many jobs a fixed panel of companies has open, how many they added, and which technologies those jobs ask for**, built from the public job board APIs of Greenhouse and Lever. Aggregated counts only: no job descriptions are redistributed.

Useful for: tracking hiring momentum by company, measuring demand for technologies (Python, TypeScript, Rust, Kubernetes, LLM tooling...) week over week, labor-market research and sales "is hiring" signals.

## Panel

`companies.csv` lists the companies tracked (name, ATS, board token): 359 at launch (302 on Greenhouse, 57 on Lever), every board checked to answer with open jobs before being added. The panel is fixed so that week-over-week numbers are comparable; companies are added at most once a month and every change is logged in `CHANGELOG.md`, with the week it starts counting.

## Files

| File | One row per | Columns |
|---|---|---|
| `tech_weekly.csv` | week × technology | `week`, `technology`, `jobs_mentioning`, `companies_mentioning`, `share_of_jobs` (0–1), `change_vs_prev_week` (jobs), `panel_open_jobs` |
| `company_weekly.csv` | week × company | `week`, `company`, `ats`, `open_jobs`, `new_jobs`, `closed_jobs`, `remote_share` (0–1), `with_salary_share` (0–1), `median_annual_salary_usd` (only if ≥ 5 jobs publish a USD range), `top_departments` (up to 3, `;`-separated), `countries` (number of distinct countries) |
| `companies.csv` | company | `company`, `ats`, `token` (public board token), `added` (first ISO week counted) |

- `week` is the ISO week that just ended (Monday–Sunday, UTC), e.g. `2026-W44`; the boards are read on the following Tuesday.
- The first week (`2026-W44`) is the baseline: `new_jobs`, `closed_jobs` and `change_vs_prev_week` are empty for it, and for any company in the week it joins the panel.
- `new_jobs` = job IDs not present in the previous snapshot; `closed_jobs` = job IDs that disappeared.
- Salary columns only use ranges published in the ATS's structured fields (Greenhouse pay transparency, Lever salary range), converted to USD with that day's exchange rate; `median_annual_salary_usd` is the median of range midpoints.
- Technologies are detected with a fixed list of word-boundary patterns over title and description (about 70 technologies; list in `technologies.txt`). A job can mention several.

## Source and license

- **Sources:** Greenhouse Job Board API — "Job Board data is publicly available, so authentication is not required for any GET endpoints" ([docs](https://docs.greenhouse.io/job-board.html)); Lever Postings API — published postings "may be scraped by third parties" ([docs](https://github.com/lever/postings-api)).
- Job postings belong to the companies that publish them. This dataset only contains counts and statistics derived from them.
- **This dataset:** **CC BY 4.0**. Please credit "Clean Yield Weekly Tech Hiring Index" with a link to this page.
- Not affiliated with Greenhouse, Lever or the companies listed.

## How it is built

A scheduled job reads each company's public board every Tuesday, compares with the previous snapshot and publishes a new version. Code and methodology: [github.com/cleanyield-data/clean-yield-data](https://github.com/cleanyield-data/clean-yield-data). Live chart: [cleanyield-data.github.io/clean-yield-data](https://cleanyield-data.github.io/clean-yield-data/).

## Need the jobs themselves?

Full job listings for any company (titles, salaries, locations, descriptions, also Ashby), in real time and with "only new jobs" alerts, are available in the [ATS Jobs Scraper](https://apify.com/cleanyield/ats-jobs-scraper) tool on Apify.
