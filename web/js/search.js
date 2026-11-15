// Find a place by name with the free Open-Meteo geocoding service (place names from GeoNames).
// Only the typed name is sent. Docs: https://open-meteo.com/en/docs/geocoding-api

const SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search";

// Returns up to 6 places: [{name, detail, lat, lon}].
export async function findPlaces(text) {
  const response = await fetch(`${SEARCH_URL}?name=${encodeURIComponent(text)}&count=6&language=en&format=json`);
  if (!response.ok) throw new Error("The place search is not answering.");
  const data = await response.json();
  return (data.results || []).map((place) => ({
    name: place.name,
    detail: [place.admin1, place.country].filter(Boolean).join(", "),
    lat: place.latitude,
    lon: place.longitude,
  }));
}

// "31.5, 74.3" or "31.5 74.3" typed into the search box -> {lat, lon}, or null.
export function readCoordinates(text) {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

// A search box with a list of suggestions. onPick({name, lat, lon}) is called for the chosen place.
export function setUpPlaceSearch(input, list, onPick) {
  let places = [];
  let highlighted = -1;
  let latestSearch = 0;
  let waiting = null;

  function close() {
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
    highlighted = -1;
  }

  function pick(place) {
    input.value = place.name;
    close();
    onPick(place);
  }

  function show(items, message = "") {
    places = items;
    list.replaceChildren();
    if (message) {
      const note = document.createElement("li");
      note.className = "search-note";
      note.textContent = message;
      list.appendChild(note);
    }
    items.forEach((place, index) => {
      const option = document.createElement("li");
      option.setAttribute("role", "option");
      option.id = `place-option-${index}`;
      option.innerHTML = "<strong></strong><span></span>";
      option.querySelector("strong").textContent = place.name;
      option.querySelector("span").textContent = place.detail;
      option.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        pick(place);
      });
      list.appendChild(option);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    highlighted = -1;
  }

  async function search() {
    const text = input.value.trim();
    const coordinates = readCoordinates(text);
    if (coordinates) {
      show([{ name: `${coordinates.lat}, ${coordinates.lon}`, detail: "Use these coordinates", ...coordinates }]);
      return;
    }
    if (text.length < 3) {
      close();
      return;
    }
    const thisSearch = ++latestSearch;
    try {
      const found = await findPlaces(text);
      if (thisSearch !== latestSearch) return; // a newer search has started
      show(found, found.length ? "" : "No place found. Check the spelling, or click the map.");
    } catch {
      if (thisSearch === latestSearch) show([], "The place search is not answering. Click the map instead.");
    }
  }

  function highlight(index) {
    const options = list.querySelectorAll('[role="option"]');
    options.forEach((option, i) => option.setAttribute("aria-selected", String(i === index)));
    highlighted = index;
    input.setAttribute("aria-activedescendant", index >= 0 ? `place-option-${index}` : "");
  }

  input.addEventListener("input", () => {
    clearTimeout(waiting);
    waiting = setTimeout(search, 350);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && places.length) {
      event.preventDefault();
      highlight((highlighted + 1) % places.length);
    } else if (event.key === "ArrowUp" && places.length) {
      event.preventDefault();
      highlight((highlighted - 1 + places.length) % places.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (places.length) pick(places[Math.max(highlighted, 0)]);
      else search();
    } else if (event.key === "Escape") {
      close();
    }
  });
  input.addEventListener("blur", () => setTimeout(close, 150));
}
