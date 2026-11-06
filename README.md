# Clean Yield open data

Two free datasets, rebuilt automatically every Tuesday by a GitHub Actions job in this repository:

| Dataset | What it is | License | Files |
|---|---|---|---|
| **New US Trucking Companies Weekly** | Every new USDOT registration of the last Monday–Sunday, from the official FMCSA Company Census File, cleaned and summarized by state, operation type and fleet size. No personal contact data. | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | [`datasets/fmcsa/`](datasets/fmcsa/) |
| **Weekly Tech Hiring Index** | For a fixed panel of companies on Greenhouse and Lever: open, new and closed jobs per company, and how many jobs mention each of 70 technologies. Counts only, never job texts. | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | [`datasets/ats/`](datasets/ats/) |

- **Live page:** [cleanyield-data.github.io/clean-yield-data](https://cleanyield-data.github.io/clean-yield-data/), with a fixed page per week under `weeks/` for citing.
- **Also on** Hugging Face ([trucking](https://huggingface.co/datasets/cleanyield/new-us-trucking-companies-weekly), [hiring index](https://huggingface.co/datasets/cleanyield/weekly-tech-hiring-index)) and Kaggle (same files, one version per week).

## How to cite

Weekly Tech Hiring Index (CC BY 4.0, attribution required):

> Clean Yield Weekly Tech Hiring Index, week 2026-W44. https://cleanyield-data.github.io/clean-yield-data/weeks/2026-W44.html

New US Trucking Companies (CC0, attribution appreciated but not required):

> Clean Yield, New US Trucking Companies Weekly (from FMCSA Company Census File), week 2026-W44. https://github.com/cleanyield-data/clean-yield-data

## Methodology

### New US trucking companies (`jobs/fmcsa.mjs`)

1. Takes the last complete ISO week (Monday–Sunday, UTC). FMCSA publishes with about one day of delay, so on Tuesday the week is complete.
2. Queries the official open-data API ([data.transportation.gov, dataset az4n-8mr2](https://data.transportation.gov/Trucking-and-Motorcoaches/Company-Census-File/az4n-8mr2)) for records whose `add_date` falls in that week, 5,000 rows per page.
3. Requests only non-personal columns. Phones, faxes, emails, street addresses, ZIP codes, company officers and DBA names are **never requested nor published**. The legal name is kept only when the record says the business is a corporation (sole proprietors' names are personal data).
4. `power_units` = trucks + buses, like SAFER (the raw census column is inflated for part of 2026 records). Carrier operation A/B/C → `interstate` / `intrastate_hazmat` / `intrastate_non_hazmat`. Each row links to its official SAFER snapshot.
5. Control: the week must have between 500 and 10,000 rows, or nothing is published.

### Weekly Tech Hiring Index (`jobs/ats.mjs`)

1. Reads the panel in [`datasets/ats/companies.csv`](datasets/ats/companies.csv) (company, ATS, public board token, week added). Changes are logged in [`datasets/ats/CHANGELOG.md`](datasets/ats/CHANGELOG.md).
2. One request per company to the public APIs: `boards-api.greenhouse.io/v1/boards/<token>/jobs` (Greenhouse: "Job Board data is publicly available") and `api.lever.co/v0/postings/<token>` (Lever: postings "may be scraped by third parties"). At most 4 requests in parallel, Lever requests spaced 1 second apart, 2 retries, identified as `CleanYieldIndex/1.0 (+https://github.com/cleanyield-data/clean-yield-data)`.
3. For each job, in memory only: technologies mentioned (70 word-boundary patterns over title and description, [`technologies.txt`](technologies.txt)), remote or not, country, department, and the annual salary in USD when the ATS publishes a structured range. The job text is discarded right away; nothing from a posting is written to disk.
4. Compares job IDs with the previous snapshot ([`state/ats-ids.json.gz`](state/), IDs only) to count new and closed jobs.
5. Control: if more than 10% of the panel fails, nothing is published.
6. The `week` label is the ISO week that just ended; the boards are read on the following Tuesday.

### Page and publication

`jobs/site.mjs` writes `site/data/index.json` and `site/weeks/<week>.html`. The workflow ([`.github/workflows/weekly.yml`](.github/workflows/weekly.yml)) then commits the data, uploads both folders to Hugging Face (`jobs/publish_hf.py`) and Kaggle (`jobs/publish_kaggle.py`) and deploys the page to GitHub Pages. If any step fails, the following ones do not run and an issue titled "Publicación semanal: falló" is opened.

## Run it yourself

Node.js 22 (no dependencies) and, for publishing, Python 3.12 with `huggingface_hub` and `kaggle`.

```bash
npm test                    # unit tests
node jobs/fmcsa.mjs         # last complete week; WEEK=2026-W44 to (re)build a given week
node jobs/ats.mjs
node jobs/site.mjs
```

Secrets (repository Settings → Secrets and variables → Actions), all optional: `HF_TOKEN`, `KAGGLE_API_TOKEN` (or `KAGGLE_USERNAME` + `KAGGLE_KEY`), `SOCRATA_APP_TOKEN`. Without them, the matching publication step is skipped with a warning. GitHub Pages needs Settings → Pages → Source: "GitHub Actions".

## Licenses and disclaimers

- Code: [MIT](LICENSE).
- `datasets/fmcsa/`: CC0 1.0. Source data is a work of the U.S. federal government (FMCSA, dataset metadata `Rights: public`). Registrations can be corrected or revoked later: confirm on SAFER before making decisions.
- `datasets/ats/`: CC BY 4.0. Job postings belong to the companies that publish them; this repository only contains counts and statistics derived from them.
- Not affiliated with or endorsed by FMCSA, U.S. DOT, Greenhouse, Lever or any company in the panel.

---

Clean Yield also builds data tools for these sources (full records, daily updates, alerts): [apify.com/cleanyield](https://apify.com/cleanyield).
