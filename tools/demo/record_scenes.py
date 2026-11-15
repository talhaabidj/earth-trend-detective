"""Record the site being used, one short clip per spoken line, for the demo video.

A headless browser opens the live site, a drawn mouse pointer moves and clicks, and every frame the
browser paints is saved. Each clip is exactly as long as its spoken line (taken from the voice
folder), so make_video.py can drop it in place of the still pictures.

Usage: python tools/demo/record_scenes.py VOICE_FOLDER CLIPS_FOLDER [SITE_URL]
Then:  python tools/demo/make_video.py SCREENSHOT_FOLDER VOICE_FOLDER VIDEO.mp4 CLIPS_FOLDER
"""

import base64
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

from make_video import FADE, MIN_SCENE, PAUSE

SITE = sys.argv[3] if len(sys.argv) > 3 else "https://earth-trend-detective.vercel.app/"
WIDTH, HEIGHT = 1120, 630        # the page size; frames come out at 1920x1080
SCALE = 1920 / WIDTH

# A mouse pointer drawn on the page, because a headless browser has none.
POINTER = """
window.addEventListener("DOMContentLoaded", () => {
  const pointer = document.createElement("div");
  pointer.style.cssText = "position:fixed;left:0;top:0;width:26px;height:26px;z-index:99999;pointer-events:none;transition:filter .12s";
  pointer.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9.5-6.6 1.4 3.9 7.2-2.9 1.5-3.8-7.3L4 19z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.body.appendChild(pointer);
  document.addEventListener("mousemove", (e) => { pointer.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; }, true);
  document.addEventListener("mousedown", () => { pointer.style.filter = "drop-shadow(0 0 7px #2a78d6)"; }, true);
  document.addEventListener("mouseup", () => { pointer.style.filter = ""; }, true);
});
"""


class Camera:
    """Collects the frames the browser paints while recording."""

    def __init__(self, page):
        self.page = page
        self.session = page.context.new_cdp_session(page)
        self.frames = []
        self.session.on("Page.screencastFrame", self.keep)
        self.x, self.y = WIDTH / 2, HEIGHT / 2

    def keep(self, event):
        self.frames.append((event["metadata"]["timestamp"], base64.b64decode(event["data"])))
        self.session.send("Page.screencastFrameAck", {"sessionId": event["sessionId"]})

    def start(self):
        self.frames = []
        self.started = time.monotonic()
        self.session.send("Page.startScreencast", {"format": "jpeg", "quality": 93, "everyNthFrame": 1,
                                                   "maxWidth": 1920, "maxHeight": 1080})

    def wait_until(self, seconds):
        """Wait until this many seconds after the recording started."""
        left = seconds - (time.monotonic() - self.started)
        if left > 0:
            self.page.wait_for_timeout(left * 1000)

    def stop(self):
        self.session.send("Page.stopScreencast")
        self.page.wait_for_timeout(150)
        return self.frames

    def place(self, x, y):
        self.x, self.y = x, y
        self.page.mouse.move(x, y)

    def glide(self, x, y, seconds):
        """Move the pointer smoothly: slow start, slow stop."""
        steps = max(2, round(seconds * 50))
        start_x, start_y = self.x, self.y
        for step in range(1, steps + 1):
            share = step / steps
            eased = share * share * (3 - 2 * share)
            self.page.mouse.move(start_x + (x - start_x) * eased, start_y + (y - start_y) * eased)
            self.page.wait_for_timeout(seconds * 1000 / steps)
        self.x, self.y = x, y

    def glide_to(self, selector, seconds, across=0.5, down=0.5):
        box = self.page.locator(selector).first.bounding_box()
        self.glide(box["x"] + box["width"] * across, box["y"] + box["height"] * down, seconds)

    def click(self):
        self.page.mouse.down()
        self.page.wait_for_timeout(90)
        self.page.mouse.up()


def scroll_to(page, selector, offset=70):
    page.evaluate(
        "([sel, off]) => { const el = document.querySelector(sel); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off); }",
        [selector, offset])
    page.wait_for_timeout(500)


def search_for(page, name, delay):
    page.locator("#place-search").click()
    page.keyboard.type(name, delay=delay)
    page.wait_for_selector('#place-options [role="option"]', timeout=8000)


def open_story(page, number):
    page.goto(SITE)
    page.wait_for_selector(".story-card")
    page.locator(".story-card").nth(number).click()
    page.wait_for_selector("#story-player .verdict")
    page.wait_for_timeout(1500)
    scroll_to(page, "#story-player .result")


# One function per spoken line. Each sets the scene up, starts the camera and acts for `seconds`.

def home(page, camera, seconds):
    page.goto(SITE)
    page.wait_for_selector("#hero-case .verdict")
    page.wait_for_timeout(1200)
    camera.place(520, 560)
    camera.start()
    camera.wait_until(0.5)
    camera.glide_to("#start-button", 1.3)
    camera.wait_until(seconds)


def explorer(page, camera, seconds):
    page.goto(SITE + "?lat=28.28&lon=68.44&v=T2M&name=Jacobabad")
    page.wait_for_selector("#results .second-opinion", timeout=60000)
    # Ask for London once off camera, so NASA's answer is already downloaded when the camera runs.
    search_for(page, "London", delay=0)
    page.locator('#place-options [role="option"]').first.click()
    page.wait_for_function("document.querySelector('#results h3').textContent.includes('London')", timeout=60000)
    page.locator("#presets .chip", has_text="Jacobabad").click()
    page.wait_for_function("document.querySelector('#results h3').textContent.includes('Jacobabad')", timeout=60000)
    page.fill("#place-search", "")
    scroll_to(page, "#explore .workspace")
    page.wait_for_timeout(800)
    camera.glide_to("#place-search", 0.1, across=0.3)
    camera.start()
    camera.wait_until(0.25)
    camera.click()
    search_for(page, "London", delay=60)
    camera.glide_to('#place-options [role="option"]', 0.35, across=0.3)
    camera.click()
    page.wait_for_function("document.querySelector('#results h3').textContent.includes('London')", timeout=60000)
    camera.glide_to("#results .verdict h4", 0.7, across=0.4)
    page.wait_for_timeout(500)
    camera.glide_to("#results .second-opinion-title", 0.7, across=0.3)
    camera.wait_until(seconds)


def jacobabad(page, camera, seconds):
    open_story(page, 0)
    camera.place(900, 150)
    camera.start()
    camera.glide_to("#story-player .second-opinion-title", 1.2, across=0.25)
    camera.wait_until(seconds * 0.5)
    page.locator("#story-player .story-nav .primary").evaluate("button => button.click()")
    page.wait_for_selector("#story-player .result:nth-child(2) .verdict")
    camera.glide_to("#story-player .result:nth-child(2) .verdict h4", 1.0, across=0.4)
    camera.wait_until(seconds)


def hunza(page, camera, seconds):
    open_story(page, 2)
    camera.place(250, 480)
    camera.start()
    camera.wait_until(0.4)
    camera.glide_to("#story-player .verdict h4", 0.9, across=0.3)
    camera.wait_until(1.7)
    camera.glide_to("#story-player .tile:nth-child(3) .tile-value", 0.9)
    camera.wait_until(seconds)


def trend_map(page, camera, seconds):
    page.goto(SITE + "?lat=31.55&lon=74.34&v=T2M_MAX&name=Lahore")
    page.wait_for_selector("#results .verdict", timeout=60000)
    page.select_option("#map-size", "10")
    page.click("#map-run")
    page.wait_for_function("document.getElementById('map-summary').textContent.length > 0", timeout=90000)
    page.wait_for_timeout(2000)
    scroll_to(page, "#map-question", 110)
    camera.place(300, 330)
    camera.start()
    camera.glide_to("#trend-map", 1.2, across=0.55, down=0.42)
    camera.glide_to("#trend-map", 0.9, across=0.62, down=0.6)
    camera.wait_until(seconds)


def greener(page, camera, seconds):
    open_story(page, 3)
    camera.place(200, 500)
    camera.start()
    camera.glide_to("#story-player .result:nth-child(1) .verdict h4", 1.0, across=0.4)
    camera.wait_until(1.9)
    camera.glide_to("#story-player .result:nth-child(2) .verdict h4", 1.0, across=0.4)
    camera.wait_until(3.6)
    camera.glide_to("#story-player .result:nth-child(2) .stripe-box", 1.1, across=0.8)
    camera.wait_until(seconds)


SCENES = {2: home, 3: explorer, 4: jacobabad, 5: hunza, 6: trend_map, 7: greener}


def save_clip(frames, seconds, file):
    """Turn the saved frames into a 30 frames-per-second clip that lasts `seconds`."""
    first_time = frames[0][0]
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        lines = []
        for number, (when, picture) in enumerate(frames):
            later = frames[number + 1][0] if number + 1 < len(frames) else first_time + seconds
            (temp / f"{number:05d}.jpg").write_bytes(picture)
            lines += [f"file '{number:05d}.jpg'", f"duration {max(later - when, 0.001):.4f}"]
        lines.append(f"file '{len(frames) - 1:05d}.jpg'")
        (temp / "frames.txt").write_text("\n".join(lines) + "\n")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(temp / "frames.txt"),
                        "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-t", f"{seconds:.2f}",
                        "-c:v", "libx264", "-preset", "medium", "-crf", "12", "-map_metadata", "-1", str(file)], check=True)


def main():
    voice_folder, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    clips = json.loads((voice_folder / "lines.json").read_text())["clips"]
    only = [int(n) for n in sys.argv[4].split(",")] if len(sys.argv) > 4 else list(SCENES)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=[f"--force-device-scale-factor={SCALE:.4f}", f"--window-size={WIDTH},{HEIGHT}"])
        context = browser.new_context(no_viewport=True, color_scheme="light")
        context.add_init_script(POINTER)
        for number in only:
            seconds = max(clips[number - 1]["seconds"] + PAUSE, MIN_SCENE) + FADE
            page = context.new_page()
            camera = Camera(page)
            SCENES[number](page, camera, seconds + 0.2)
            frames = camera.stop()
            save_clip(frames, seconds, out / f"scene-{number}.mp4")
            print(f"scene {number}: {len(frames)} frames, {seconds:.2f} s")
            page.close()
        browser.close()


if __name__ == "__main__":
    main()
