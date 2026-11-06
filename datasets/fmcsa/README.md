---
pretty_name: New US Trucking Companies This Week (FMCSA)
license: cc0-1.0
language:
- en
tags:
- tabular
- trucking
- logistics
- transportation
- fmcsa
- usdot
- government-data
- leads
size_categories:
- 1K<n<10K
configs:
- config_name: latest_week
  data_files: new_carriers_latest.csv
- config_name: all_weeks
  data_files: weeks/*.csv
- config_name: weekly_summary
  data_files: weekly_summary.csv
---

# New US Trucking Companies This Week (FMCSA)

Every week, the list of **motor carriers, brokers and other entities that received a new USDOT number** in the United States, taken from the official FMCSA Company Census File, cleaned and summarized by state, operation type and fleet size. About 2,000–3,000 new registrations per week (2,677 in 2026-W44).

Useful for: market sizing of the US trucking industry, tracking new-entrant trends by state, research on small-fleet churn, and as a starting list for freight brokers, truck insurance agents and factoring companies.

## Files

| File | Content |
|---|---|
| `new_carriers_latest.csv` | New registrations of the last complete week (Monday–Sunday, UTC). |
| `weeks/YYYY-Www.csv` | One file per ISO week, kept forever (history grows every week). |
| `weekly_summary.csv` | One row per week × state × carrier operation: `total`, fleet-size buckets by power units (`fleet_0_or_unknown`, `fleet_1`, `fleet_2_5`, `fleet_6_20`, `fleet_21_plus`) and `hazmat_share` (0–1). |

## Columns (`new_carriers_*.csv`)

| Column | Description |
|---|---|
| `week` | ISO week of registration, e.g. `2026-W44`. |
| `dot_number` | USDOT number. |
| `add_date` | Date the USDOT number was added (ISO `YYYY-MM-DD`). |
| `legal_name` | Legal name **only for corporations**; empty for individuals, partnerships and unknown types (see Privacy). FMCSA rarely fills the business type for brand-new registrations, so this column is usually empty. |
| `carrier_operation` | `interstate`, `intrastate_hazmat` or `intrastate_non_hazmat`. |
| `classification` | FMCSA operation classification (e.g. authorized for hire, private property). |
| `phy_city`, `phy_state` | City and state of the physical address (no street, no ZIP). |
| `power_units` | Trucks + buses reported. The raw census `power_units` column is inflated for a share of 2026 records, so we use `truck_units + bus_units`, like SAFER. |
| `drivers` | Total drivers reported. |
| `hazmat` | `true` if the entity reports hazardous materials. |
| `status` | FMCSA status code (`A` active, `I` inactive, `P` pending). |
| `safer_url` | Official SAFER Company Snapshot link for the full public record. |

## Source and license

- **Source:** [FMCSA Company Census File](https://data.transportation.gov/Trucking-and-Motorcoaches/Company-Census-File/az4n-8mr2) on data.transportation.gov (U.S. Department of Transportation, Federal Motor Carrier Safety Administration). Dataset metadata: `Rights: public`. Works of the U.S. federal government are in the public domain in the U.S.
- **This dataset:** released under **CC0 1.0** (no rights reserved). Attribution appreciated, not required.
- Not affiliated with or endorsed by FMCSA or U.S. DOT. Registrations can be corrected or revoked after publication: always confirm on SAFER before making decisions.

## Privacy

Many new carriers are sole proprietors, so the official file contains names, phone numbers, emails and home addresses of individuals. **This dataset removes all of them:** no phones, faxes, emails, street addresses, ZIP codes, company officers or DBA names, and the legal name is kept only for corporations.

## How it is built

A scheduled job queries the official open-data API every Tuesday for the previous Monday–Sunday, applies the cleaning above and publishes a new version. Code and methodology: [github.com/cleanyield-data/clean-yield-data](https://github.com/cleanyield-data/clean-yield-data).

## Need more?

The full record (operating authority, insurance filings, out-of-service status, safety rating, contact data where allowed), daily updates, filters by state and fleet size and change alerts are available in the [FMCSA Carrier Data](https://apify.com/cleanyield/fmcsa-carrier-data) tool on Apify.
