// Small motion helpers: reveal on scroll, counting numbers, and the menu's "you are here" mark.
// Everything is skipped when the visitor has asked their device for less motion.

export const calmMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Elements with data-reveal fade up when they scroll into view. Children of data-reveal="group"
// follow one after another.
export function revealOnScroll() {
  if (calmMotion || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("motion");
  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("shown");
      watcher.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  for (const element of document.querySelectorAll("[data-reveal]")) {
    if (element.dataset.reveal === "group") {
      [...element.children].forEach((child, index) => child.style.setProperty("--order", index));
    }
    watcher.observe(element);
  }
}

// Counts from 0 to `value` in about a second. `format` turns each number into text.
export function countUp(element, value, format) {
  if (calmMotion || !Number.isFinite(value)) {
    element.textContent = format(value);
    return;
  }
  const start = performance.now();
  const length = 900;
  function step(now) {
    const progress = Math.min(1, (now - start) / length);
    const eased = 1 - (1 - progress) ** 3;
    element.textContent = format(value * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Numbers written as <span data-count="45">45</span> count up when they come into view.
export function countWhenSeen() {
  const numbers = document.querySelectorAll("[data-count]");
  if (calmMotion || !("IntersectionObserver" in window)) return;
  const watcher = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      countUp(entry.target, Number(entry.target.dataset.count), (n) => String(Math.round(n)));
      watcher.unobserve(entry.target);
    }
  }, { threshold: 0.6 });
  numbers.forEach((number) => watcher.observe(number));
}

// Marks the menu link of the section now on screen, and gives the top bar a shadow once scrolled.
export function followScroll(bar, links) {
  const sections = links.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  function update() {
    bar.classList.toggle("scrolled", window.scrollY > 8);
    const line = window.innerHeight * 0.35;
    let current = null;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= line) current = section;
    }
    for (const link of links) {
      const here = current && link.getAttribute("href") === `#${current.id}`;
      if (here) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  }
  window.addEventListener("scroll", update, { passive: true });
  update();
}
