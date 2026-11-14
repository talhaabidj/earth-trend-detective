// Example investigations, played step by step. The data is prepared ahead of time
// (engine/scripts/build_examples.py) and saved in data/stories.json, so it loads instantly.

import { findVariable } from "./catalogue.js";
import { showResult } from "./result-view.js";

function button(text, className, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.textContent = text;
  element.addEventListener("click", onClick);
  return element;
}

function showStep(story, stepNumber, player) {
  const step = story.steps[stepNumber];
  const isLast = stepNumber === story.steps.length - 1;
  player.replaceChildren();

  const intro = document.createElement("div");
  intro.innerHTML = `<p class="story-step-label">${story.title} · step ${stepNumber + 1} of ${story.steps.length}</p><p>${step.text}</p>`;
  player.appendChild(intro);

  const grid = document.createElement("div");
  grid.className = step.panels.length > 1 ? "compare-grid two" : "compare-grid";
  player.appendChild(grid);
  for (const panel of step.panels) {
    showResult(grid, {
      rows: panel.rows,
      variable: findVariable(panel.variable),
      label: panel.label,
      sourceUrl: panel.source_url,
      cells: panel.cells,
      compact: step.panels.length > 1,
    });
  }

  const back = button("Back", "secondary", () => showStep(story, stepNumber - 1, player));
  back.disabled = stepNumber === 0;
  const next = button(isLast ? "Try it yourself" : "Next", "primary", () => {
    if (!isLast) {
      showStep(story, stepNumber + 1, player);
      return;
    }
    const panel = step.panels.find((p) => !findVariable(p.variable).examplesOnly) || step.panels[0];
    const variable = findVariable(panel.variable).examplesOnly ? "T2M" : panel.variable;
    location.href = `?lat=${panel.lat}&lon=${panel.lon}&v=${variable}&name=${encodeURIComponent(panel.name)}#explore`;
  });
  const nav = document.createElement("div");
  nav.className = "story-nav";
  nav.append(back, next);
  player.appendChild(nav);
  player.scrollIntoView({ behavior: "smooth", block: "start" });
}

export async function showStoryList(list, player) {
  const section = list.closest("section");
  let data;
  try {
    const response = await fetch("data/stories.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`status ${response.status}`);
    data = await response.json();
  } catch {
    // No examples built yet: hide the section and its menu link.
    section.hidden = true;
    document.querySelector('a[href="#examples"]')?.remove();
    return;
  }
  for (const story of data.stories) {
    const card = button("", "story-card", () => {
      player.hidden = false;
      showStep(story, 0, player);
    });
    card.innerHTML = `<strong>${story.title}</strong><span>${story.teaser}</span>`;
    list.appendChild(card);
  }
}
