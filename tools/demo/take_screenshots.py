"""Take screenshots of the site for the README, the project page and the demo video.

Uses Playwright's own headless browser. Output: 1920x1080 PNGs (a 1280x720 page at 1.5x).
Usage: python tools/demo/take_screenshots.py OUTPUT_FOLDER [SITE_URL]
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

SITE = sys.argv[2] if len(sys.argv) > 2 else "https://earth-trend-detective.vercel.app/"


def scroll_to(page, selector, offset=72):
    page.evaluate(
        "([sel, off]) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off); }",
        [selector, offset],
    )
    page.wait_for_timeout(700)


def open_story(page, story_number, step_number=1):
    page.goto(SITE)
    page.wait_for_selector(".story-card")
    page.locator(".story-card").nth(story_number).click()
    for _ in range(step_number - 1):
        page.locator("#story-player .story-nav .primary").click()
    page.wait_for_timeout(900)
    scroll_to(page, "#story-player")


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1.5, color_scheme="light",
                                reduced_motion="reduce")

        page.goto(SITE)
        page.wait_for_selector("#hero-case .verdict")
        page.wait_for_timeout(1500)
        page.screenshot(path=out / "01-home.png")

        # The average, scrolled so the second opinion from the weather station is in view.
        open_story(page, 0, 1)
        page.wait_for_selector("#story-player .second-opinion")
        scroll_to(page, "#story-player .result")
        page.screenshot(path=out / "02a-jacobabad-average.png")
        open_story(page, 0, 2)
        page.screenshot(path=out / "02-jacobabad-day-night.png")
        open_story(page, 1, 1)
        page.screenshot(path=out / "03-lahore-phoenix.png")
        open_story(page, 2, 1)
        page.screenshot(path=out / "04-hunza-not-yet.png")
        open_story(page, 3, 1)
        page.screenshot(path=out / "05-greener-from-space.png")

        # The explorer with a live result, then the trend map around the same place.
        page.goto(SITE + "?lat=31.55&lon=74.34&v=T2M_MAX&name=Lahore")
        page.wait_for_selector("#results .verdict", timeout=60000)
        page.wait_for_timeout(1500)
        scroll_to(page, "#explore .workspace")
        page.screenshot(path=out / "06-explorer.png")
        page.select_option("#map-size", "10")
        page.click("#map-run")
        page.wait_for_function("document.getElementById('map-summary').textContent.length > 0", timeout=90000)
        page.wait_for_timeout(2500)
        scroll_to(page, "#map-question", 120)
        page.screenshot(path=out / "07-trend-map.png")
        browser.close()
    print("saved", sorted(f.name for f in out.glob("*.png")))


if __name__ == "__main__":
    main()
