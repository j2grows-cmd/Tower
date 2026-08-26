# FlorAccess Catalogue Scraper

A public-catalogue scraper for FlorAccess. It does **not** log in or use a customer account. It reads publicly accessible FlorAccess catalogue pages and extracts plant name, wholesale price, pot size, height and product URL.

## Features

- Walks through the public catalogue pages.
- Extracts product listings without authentication.
- Preserves separate listings for different sizes/growers.
- Writes `data/floraccess_catalogue.csv` and `data/floraccess_catalogue.xlsx`.
- Runs locally or through GitHub Actions.
- Weekly scheduled update plus manual workflow dispatch.

## Run locally

```bash
python -m pip install -r requirements.txt
python scraper.py
```

The workbook is ignored by Git so it can be generated locally without bloating the repository. GitHub Actions uploads it as an artifact and commits the CSV.

## GitHub Actions

Open **Actions → Update FlorAccess Catalogue → Run workflow** for a manual run. The scheduled job runs weekly.

## Important

This project only accesses pages that are publicly available without logging in. It does not bypass authentication, CAPTCHAs, paywalls or other access controls. FlorAccess states that catalogue prices are excluding VAT and delivery costs.

Use a reasonable request rate and respect FlorAccess's terms and robots.txt.
