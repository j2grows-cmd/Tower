import re
import time
from pathlib import Path
from urllib.parse import urljoin

import pandas as pd
import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.floraccess.com/en/search/"
OUTPUT_DIR = Path("data")
REQUEST_DELAY_SECONDS = 1.0
MAX_PAGES = 1000

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; FlorAccessPublicCatalogueScraper/1.1; +https://github.com/j2grows-cmd/Tower)"
}


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


def parse_product_anchor(link) -> dict | None:
    href = link.get("href")
    if not href:
        return None
    if "/product/" not in href.lower() and "/en/product" not in href.lower():
        return None

    name = clean_text(link.get_text(" ", strip=True))
    if not name:
        return None

    text = clean_text(link.get("aria-label")) or name
    price = extract_price(text)
    pot_size, height = extract_dimensions(text)

    node = link
    for _ in range(6):
        node = getattr(node, "parent", None)
        if node is None:
            break
        candidate_text = clean_text(node.get_text(" ", strip=True)) or ""
        if price is None:
            price = extract_price(candidate_text)
        if pot_size is None:
            pot_size, height2 = extract_dimensions(candidate_text)
            if height is None:
                height = height2
        if price is not None and pot_size is not None:
            break

    if price is None:
        return None

    return {
        "Plant": name,
        "Price EUR": price,
        "Pot Size": pot_size,
        "Height": height,
        "Product URL": urljoin(BASE_URL, href),
    }


def scrape_page(session: requests.Session, page: int) -> list[dict]:
    response = session.get(page_url(page), headers=HEADERS, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    products = []
    seen_urls = set()
    for link in soup.find_all("a", href=True):
        product = parse_product_anchor(link)
        if product and product["Product URL"] not in seen_urls:
            products.append(product)
            seen_urls.add(product["Product URL"])

    if not products:
        anchors = len(soup.find_all("a", href=True))
        euro_hits = len(soup.find_all(string=re.compile(r"€")))
        print(f"  diagnostic: {anchors} anchors, {euro_hits} EUR text nodes")

    return products


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    session = requests.Session()
    all_rows: list[dict] = []
    empty_pages = 0

    for page in range(1, MAX_PAGES + 1):
        print(f"Scraping catalogue page {page}...")
        try:
            rows = scrape_page(session, page)
        except requests.RequestException as exc:
            print(f"Request failed on page {page}: {exc}")
            continue

        print(f"  found {len(rows)} products")
        if not rows:
            empty_pages += 1
            if empty_pages >= 2:
                break
        else:
            empty_pages = 0
            for row in rows:
                row["Catalogue Page"] = page
            all_rows.extend(rows)

        time.sleep(REQUEST_DELAY_SECONDS)

    df = pd.DataFrame(all_rows)
    if df.empty:
        raise RuntimeError(
            "No products were extracted. FlorAccess may be serving the catalogue through "
            "a JavaScript/API layer to GitHub Actions, or the public page structure changed."
        )

    df = df.drop_duplicates(subset=["Product URL"], keep="first")
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
