// Example cases, played step by step. The data is prepared ahead of time
// (engine/scripts/build_examples.py) and saved in data/stories.json, so it opens instantly.

import { findVariable } from "./catalogue.js";
import { showResult } from "./result-view.js";

const BADGE = {
  clear: { tone: "clear", text: "Yes" },
  mixed: { tone: "mixed", text: "Maybe" },
  not_yet: { tone: "not-yet", text: "Not yet" },
  none: { tone: "none", text: "No trend" },
};

let storiesData = null;

// Downloads the examples once. Returns null if they cannot be loaded.
export async function loadStories() {
  if (storiesData) return storiesData;
  try {
    const response = await fetch("data/stories.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`status ${response.status}`);
    storiesData = await response.json();
  } catch {
    storiesData = null;
  }
  return storiesData;
}

function button(text, className, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

function showPanel(container, panel) {
  showResult(container, {
    rows: panel.rows,
    variable: findVariable(panel.variable),
    label: panel.label,
    sourceUrl: panel.source_url,
    cells: panel.cells,
  });
}

function showStep(story, stepNumber, player, onTryIt) {
  const step = story.steps[stepNumber];
  const isLast = stepNumber === story.steps.length - 1;
  player.replaceChildren();

  const top = document.createElement("div");
  top.className = "story-top";
  const title = document.createElement("h3");
  title.textContent = story.title;
  top.append(title, button("Close", "button secondary", () => {
    player.hidden = true;
    document.querySelectorAll(".story-card").forEach((card) => card.setAttribute("aria-pressed", "false"));
  }));
  const label = document.createElement("p");
  label.className = "story-step-label";
  label.textContent = `Step ${stepNumber + 1} of ${story.steps.length}`;
  const text = document.createElement("p");
  text.className = "story-text";
  text.textContent = step.text;
  const grid = document.createElement("div");
  grid.className = step.panels.length > 1 ? "compare-grid two" : "compare-grid";
  player.append(top, label, text, grid);
  step.panels.forEach((panel) => showPanel(grid, panel));

  const back = button("Back", "button secondary", () => showStep(story, stepNumber - 1, player, onTryIt));
  back.disabled = stepNumber === 0;
  const next = button(isLast ? "Try this place yourself" : "Next step", "button primary", () => {
    if (!isLast) {
      showStep(story, stepNumber + 1, player, onTryIt);
      return;
    }
    // Open the explorer on a variable that can be downloaded live.
    const panel = step.panels.find((p) => !findVariable(p.variable).examplesOnly) || step.panels[0];
    const variable = findVariable(panel.variable).examplesOnly ? "T2M" : panel.variable;
    onTryIt({ name: panel.name, lat: panel.lat, lon: panel.lon }, variable);
  });
  const nav = document.createElement("div");
  nav.className = "story-nav";
  nav.append(back, next);
  player.appendChild(nav);
  player.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Fills the list of example cards. onTryIt(place, variableId) opens the explorer.
export async function showStoryList(list, player, onTryIt) {
  const data = await loadStories();
  if (!data) {
    list.closest("section").hidden = true;
    return;
  }
  for (const story of data.stories) {
    const card = button("", "story-card", () => {
      list.querySelectorAll(".story-card").forEach((other) => other.setAttribute("aria-pressed", String(other === card)));
      player.hidden = false;
      showStep(story, 0, player, onTryIt);
    });
    const verdicts = new Set(story.steps.flatMap((step) => step.panels.map((panel) => panel.python_result.verdict)));
    const badges = [...verdicts].filter((v) => BADGE[v]).map((v) => `<span class="badge ${BADGE[v].tone}">${BADGE[v].text}</span>`).join("");
    card.innerHTML = `<strong>${story.title}</strong><span>${story.teaser}</span><span class="badges">${badges}</span>`;
    card.setAttribute("aria-pressed", "false");
    list.appendChild(card);
  }
}

// Three real results for the first screen, one per kind of verdict.
const HERO_PANELS = [
  { story: "jacobabad-heat", step: 1, panel: 1 },
  { story: "hunza-not-yet", step: 0, panel: 0 },
  { story: "jacobabad-heat", step: 0, panel: 0 },
];

// Shows the results in the hero card, changing every few seconds until the visitor takes over.
export async function showHeroCase(container, onOpenExamples) {
  const data = await loadStories();
  if (!data) return;
  const panels = HERO_PANELS
    .map((pick) => data.stories.find((s) => s.id === pick.story)?.steps[pick.step]?.panels[pick.panel])
    .filter(Boolean);
  if (!panels.length) return;

  let current = 0;
  let timer = null;
  const holder = document.createElement("div");
  const foot = document.createElement("div");
  foot.className = "hero-case-foot";
  const dots = document.createElement("div");
  dots.className = "dots";
  const stop = () => clearInterval(timer);

  function show(index) {
    current = index;
    holder.replaceChildren();
    showPanel(holder, panels[index]);
    dots.querySelectorAll(".dot").forEach((dot, i) => dot.setAttribute("aria-pressed", String(i === index)));
  }

  panels.forEach((panel, index) => {
    const dot = button("", "dot", () => {
      stop();
      show(index);
    });
    dot.setAttribute("aria-label", `Show result ${index + 1} of ${panels.length}`);
    dots.appendChild(dot);
  });
  foot.append(dots, button("See how this case was solved", "text-button", onOpenExamples));
  container.append(holder, foot);
  container.hidden = false;
  show(0);

  const calmMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!calmMotion) {
    timer = setInterval(() => show((current + 1) % panels.length), 6000);
    container.addEventListener("pointerenter", stop);
    container.addEventListener("focusin", stop);
  }
}
