import re
import time
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

BASE_URL = "https://www.floraccess.com/en/search/"
OUTPUT_DIR = Path("data")
REQUEST_DELAY_SECONDS = 1.0
MAX_PAGES = 700


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
    # FlorAccess renders the product catalogue client-side for ordinary HTTP
    # requests. Playwright gives us the same rendered DOM a normal browser sees.
    page.goto(page_url(catalogue_page), wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2500)

    body_text = clean_text(page.locator("body").inner_text()) or ""
    euro_count = len(re.findall(r"€\s*[0-9]", body_text))
    anchors = page.locator("a").count()
    print(f"  diagnostic: {anchors} anchors, {euro_count} rendered EUR prices")

    products: list[dict] = []
    seen = set()

    # Product cards are identified from their visible text. We don't rely on
    # a fragile CSS class name because FlorAccess can change presentation markup.
    for link in page.locator("a").all():
        try:
            text = clean_text(link.inner_text()) or ""
            href = link.get_attribute("href") or ""
        except Exception:
            continue

        price = extract_price(text)
        if price is None:
            continue

        # A product link generally contains the product name. If the anchor
        # itself only contains an image, inspect its nearest useful ancestor.
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

    # Fallback: parse visible body lines when price and product text aren't in
    # the same anchor. The public FlorAccess cards follow: name €price pot height.
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


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    all_rows: list[dict] = []
    empty_pages = 0

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        browser_context = browser.new_context(
            user_agent="Mozilla/5.0 (compatible; FlorAccessPublicCatalogueScraper/2.0; +https://github.com/j2grows-cmd/Tower)",
            viewport={"width": 1440, "height": 1000},
        )
        page = browser_context.new_page()

        for catalogue_page in range(1, MAX_PAGES + 1):
            print(f"Scraping catalogue page {catalogue_page}...")
            try:
                rows = parse_rendered_page(page, catalogue_page)
            except PlaywrightTimeoutError as exc:
                print(f"  browser timeout: {exc}")
                rows = []
            except Exception as exc:
                print(f"  browser error: {exc}")
                rows = []

            print(f"  found {len(rows)} products")
            if not rows:
                empty_pages += 1
                if empty_pages >= 2:
                    break
            else:
                empty_pages = 0
                all_rows.extend(rows)

            time.sleep(REQUEST_DELAY_SECONDS)

        browser.close()

    df = pd.DataFrame(all_rows)
    if df.empty:
        raise RuntimeError(
            "No products were extracted from the rendered FlorAccess catalogue. "
            "The site may be blocking automated browsers or its catalogue markup changed."
        )

    # Keep distinct listings when pot/height/price differs. Exact duplicate rows
    # from repeated DOM elements are removed.
    df = df.drop_duplicates(subset=["Plant", "Price EUR", "Pot Size", "Height", "Product URL"])
    df = df.sort_values(["Plant", "Pot Size", "Height", "Price EUR"], na_position="last")

    csv_path = OUTPUT_DIR / "floraccess_catalogue.csv"
    xlsx_path = OUTPUT_DIR / "floraccess_catalogue.xlsx"
    df.to_csv(csv_path, index=False)
    df.to_excel(xlsx_path, index=False, sheet_name="FlorAccess Catalogue")

    print(f"Saved {len(df):,} listings")
    print(f"CSV:  {csv_path}")
    print(f"XLSX: {xlsx_path}")


if __name__ == "__main__":
    main()
