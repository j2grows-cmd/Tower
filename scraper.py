import json
import re
import time
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE_URL = "https://www.floraccess.com/en/search/"
OUTPUT_DIR = Path("data")
CHECKPOINT_PATH = OUTPUT_DIR / "floraccess_checkpoint.json"
PARTIAL_CSV_PATH = OUTPUT_DIR / "floraccess_partial.csv"
REQUEST_DELAY_SECONDS = 1.0
MAX_PAGES = 700
SAVE_EVERY_PAGES = 10


def page_url(page: int) -> str:
    return f"{BASE_URL}?page={page}" if page > 1 else BASE_URL


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def extract_price(text: str) -> float | None:
    match = re.search(r"€\s*([0-9]+(?:[.,][0-9]{1,2})?)", text)
    return float(match.group(1).replace(",", ".")) if match else None


def extract_dimensions(text: str) -> tuple[str | None, str | None]:
    measurements = re.findall(
        r"\b\d+(?:\.\d+)?\s*cm\b(?:\s*[-–]\s*\d+(?:\.\d+)?\s*cm\b)?",
        text,
        re.I,
    )
    measurements = [clean_text(x) for x in measurements]
    if len(measurements) >= 2:
        return measurements[0], measurements[1]
    return (measurements[0], None) if measurements else (None, None)


def parse_rendered_page(page, catalogue_page: int) -> list[dict]:
    page.goto(page_url(catalogue_page), wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2500)

    body_text = clean_text(page.locator("body").inner_text()) or ""
    euro_count = len(re.findall(r"€\s*[0-9]", body_text))
    anchors = page.locator("a").count()
    print(f"  diagnostic: {anchors} anchors, {euro_count} rendered EUR prices", flush=True)

    products: list[dict] = []
    seen = set()

    for link in page.locator("a").all():
        try:
            text = clean_text(link.inner_text()) or ""
            href = link.get_attribute("href") or ""
        except Exception:
            continue

        price = extract_price(text)
        if price is None:
            continue

        name = clean_text(text)
        if not name or name.startswith("€"):
            continue

        pot_size, height = extract_dimensions(text)
        product_url = urljoin(BASE_URL, href) if href else ""
        key = (name, price, pot_size, height, product_url)
        if key in seen:
            continue
        seen.add(key)

        products.append({
            "Plant": name,
            "Price EUR": price,
            "Pot Size": pot_size,
            "Height": height,
            "Product URL": product_url,
            "Catalogue Page": catalogue_page,
        })

    if not products:
        pattern = re.compile(
            r"(?P<name>.+?)\s+€\s*(?P<price>\d+(?:[.,]\d{1,2})?)\s+"
            r"(?P<pot>\d+(?:\.\d+)?\s*cm)\s+(?P<height>\d+(?:\.\d+)?(?:[-–]\d+(?:\.\d+)?)?\s*cm)",
            re.I,
        )
        for match in pattern.finditer(body_text):
            products.append({
                "Plant": clean_text(match.group("name")),
                "Price EUR": float(match.group("price").replace(",", ".")),
                "Pot Size": clean_text(match.group("pot")),
                "Height": clean_text(match.group("height")),
                "Product URL": "",
                "Catalogue Page": catalogue_page,
            })

    return products


def load_checkpoint() -> tuple[int, list[dict]]:
    if not CHECKPOINT_PATH.exists() or not PARTIAL_CSV_PATH.exists():
        return 1, []

    try:
        checkpoint = json.loads(CHECKPOINT_PATH.read_text(encoding="utf-8"))
        next_page = int(checkpoint.get("next_page", 1))
        df = pd.read_csv(PARTIAL_CSV_PATH)
        rows = df.to_dict("records")
        print(f"Resuming from page {next_page:,} with {len(rows):,} saved listings", flush=True)
        return next_page, rows
    except Exception as exc:
        print(f"Checkpoint could not be loaded ({exc}); starting from page 1", flush=True)
        return 1, []


def save_checkpoint(next_page: int, rows: list[dict]) -> None:
    df = pd.DataFrame(rows)
    if not df.empty:
        df = df.drop_duplicates(subset=["Plant", "Price EUR", "Pot Size", "Height", "Product URL"])
        df.to_csv(PARTIAL_CSV_PATH, index=False)

    CHECKPOINT_PATH.write_text(
        json.dumps({"next_page": next_page, "saved_listings": len(df)}, indent=2),
        encoding="utf-8",
    )
    print(f"  checkpoint saved: next page {next_page:,}; {len(df):,} listings", flush=True)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    start_page, all_rows = load_checkpoint()
    empty_pages = 0

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        browser_context = browser.new_context(
            user_agent="Mozilla/5.0 (compatible; FlorAccessPublicCatalogueScraper/2.1; +https://github.com/j2grows-cmd/Tower)",
            viewport={"width": 1440, "height": 1000},
        )
        page = browser_context.new_page()

        try:
            for catalogue_page in range(start_page, MAX_PAGES + 1):
                print(f"Scraping catalogue page {catalogue_page}...", flush=True)
                try:
                    rows = parse_rendered_page(page, catalogue_page)
                except PlaywrightTimeoutError as exc:
                    print(f"  browser timeout: {exc}", flush=True)
                    rows = []
                except Exception as exc:
                    print(f"  browser error: {exc}", flush=True)
                    rows = []

                print(f"  found {len(rows)} products", flush=True)
                if not rows:
                    empty_pages += 1
                    save_checkpoint(catalogue_page, all_rows)
                    if empty_pages >= 2:
                        print("Two consecutive empty pages; assuming catalogue end.", flush=True)
                        break
                else:
                    empty_pages = 0
                    all_rows.extend(rows)

                    if catalogue_page % SAVE_EVERY_PAGES == 0:
                        save_checkpoint(catalogue_page + 1, all_rows)

                time.sleep(REQUEST_DELAY_SECONDS)
        finally:
            browser.close()

    df = pd.DataFrame(all_rows)
    if df.empty:
        raise RuntimeError("No products were extracted from the rendered FlorAccess catalogue.")

    df = df.drop_duplicates(subset=["Plant", "Price EUR", "Pot Size", "Height", "Product URL"])
    df = df.sort_values(["Plant", "Pot Size", "Height", "Price EUR"], na_position="last")

    csv_path = OUTPUT_DIR / "floraccess_catalogue.csv"
    xlsx_path = OUTPUT_DIR / "floraccess_catalogue.xlsx"
    df.to_csv(csv_path, index=False)
    df.to_excel(xlsx_path, index=False, sheet_name="FlorAccess Catalogue")

    # Mark the completed run so a future scheduled run starts fresh.
    if CHECKPOINT_PATH.exists():
        CHECKPOINT_PATH.unlink()
    if PARTIAL_CSV_PATH.exists():
        PARTIAL_CSV_PATH.unlink()

    print(f"Saved {len(df):,} listings", flush=True)
    print(f"CSV:  {csv_path}", flush=True)
    print(f"XLSX: {xlsx_path}", flush=True)


if __name__ == "__main__":
    main()
