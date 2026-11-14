// SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
// Example investigations: precomputed NASA data in data/stories.json, played step by step.

import { findVariable } from "./catalogue.js";

export async function initStories(list, player, renderAnalysis) {
  let data;
  try {
    const response = await fetch("data/stories.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(String(response.status));
    data = await response.json();
  } catch {
    list.closest("section").hidden = true;
    return;
  }
  for (const story of data.stories) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "story-card";
    card.innerHTML = `<strong>${story.title}</strong><span>${story.teaser}</span>`;
    card.addEventListener("click", () => play(story, player, renderAnalysis));
    list.appendChild(card);
  }
}

function play(story, player, renderAnalysis) {
  let index = 0;
  player.hidden = false;
  const show = () => {
    const step = story.steps[index];
    player.replaceChildren();
    const head = document.createElement("div");
    head.innerHTML = `<p class="story-step-label">${story.title} · step ${index + 1} of ${story.steps.length}</p><p>${step.text}</p>`;
    player.appendChild(head);
    const grid = document.createElement("div");
    grid.className = "compare-grid" + (step.panels.length > 1 ? " two" : "");
    player.appendChild(grid);
    for (const panel of step.panels) {
      renderAnalysis(grid, {
        series: panel.series, variable: findVariable(panel.variable), label: panel.label,
        sourceUrl: panel.source_url, cells: panel.cells, compact: step.panels.length > 1,
      });
    }
    const nav = document.createElement("div");
    nav.className = "story-nav";
    const back = Object.assign(document.createElement("button"), { type: "button", className: "secondary", textContent: "Back" });
    back.disabled = index === 0;
    back.addEventListener("click", () => { index -= 1; show(); });
    const next = Object.assign(document.createElement("button"), { type: "button", className: "primary" });
    next.textContent = index === story.steps.length - 1 ? "Try it yourself" : "Next";
    next.addEventListener("click", () => {
      if (index === story.steps.length - 1) {
        const last = story.steps[index].panels[0];
        location.search = `?lat=${last.lat}&lon=${last.lon}&v=${last.variable}&name=${encodeURIComponent(last.name)}#explore`;
      } else { index += 1; show(); }
    });
    nav.append(back, next);
    player.appendChild(nav);
    player.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  show();
}
