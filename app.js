const WORLD_CUP_SOURCE = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const state = {
  matches: [],
  filteredMatches: [],
  preferences: JSON.parse(localStorage.getItem("mundial-preferences") || "{}"),
};

const elements = {
  statusTitle: document.querySelector("#status-title"),
  statusMessage: document.querySelector("#status-message"),
  reloadBtn: document.querySelector("#reload-btn"),
  list: document.querySelector("#matches-list"),
  count: document.querySelector("#match-count"),
  search: document.querySelector("#search"),
  countryFilter: document.querySelector("#country-filter"),
  sortFilter: document.querySelector("#sort-filter"),
  form: document.querySelector("#travel-form"),
  origin: document.querySelector("#origin"),
  originAirport: document.querySelector("#origin-airport"),
  passengers: document.querySelector("#passengers"),
  dialog: document.querySelector("#details-dialog"),
  details: document.querySelector("#details-content"),
  closeDialog: document.querySelector("#close-dialog"),
  template: document.querySelector("#match-card-template"),
};

init();

function init() {
  hydratePreferences();
  elements.reloadBtn.addEventListener("click", loadMatches);
  elements.search.addEventListener("input", applyFilters);
  elements.countryFilter.addEventListener("change", applyFilters);
  elements.sortFilter.addEventListener("change", applyFilters);
  elements.closeDialog.addEventListener("click", () => elements.dialog.close());
  elements.form.addEventListener("submit", savePreferences);
  loadMatches();
}

function hydratePreferences() {
  elements.origin.value = state.preferences.origin || "";
  elements.originAirport.value = state.preferences.originAirport || "";
  elements.passengers.value = state.preferences.passengers || 1;
}

function savePreferences(event) {
  event.preventDefault();
  state.preferences = {
    origin: elements.origin.value.trim(),
    originAirport: elements.originAirport.value.trim().toUpperCase(),
    passengers: Number(elements.passengers.value || 1),
  };
  localStorage.setItem("mundial-preferences", JSON.stringify(state.preferences));
  setStatus("Preferencias guardadas", "Selecciona cualquier partido para generar hoteles y búsqueda de vuelos con tu origen.");
}

async function loadMatches() {
  setStatus("Cargando partidos…", "Consultando el calendario público del Mundial desde Internet.");
  elements.reloadBtn.disabled = true;

  try {
    const response = await fetch(`${WORLD_CUP_SOURCE}?cacheBust=${Date.now()}`);
    if (!response.ok) throw new Error(`La fuente respondió ${response.status}`);

    const data = await response.json();
    const matches = normalizeMatches(data);
    if (!matches.length) throw new Error("No se encontraron partidos en el JSON recibido.");

    state.matches = matches;
    populateCountries(matches);
    applyFilters();
    setStatus("Partidos actualizados", `Se cargaron ${matches.length} partidos dinámicos desde openfootball/worldcup.json.`);
  } catch (error) {
    state.matches = [];
    state.filteredMatches = [];
    renderMatches();
    setStatus("No se pudo cargar el calendario", `${error.message}. Revisa tu conexión o intenta actualizar de nuevo.`, "error");
  } finally {
    elements.reloadBtn.disabled = false;
  }
}

function normalizeMatches(data) {
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  const directMatches = Array.isArray(data.matches) ? data.matches : [];
  const sourceMatches = directMatches.length
    ? directMatches.map((match) => ({ ...match, round: match.round || data.name }))
    : rounds.flatMap((round) => (round.matches || []).map((match) => ({ ...match, round: round.name })));

  return sourceMatches.map((match, index) => {
    const team1 = getTeamName(match.team1 || match.home_team || match.homeTeam);
    const team2 = getTeamName(match.team2 || match.away_team || match.awayTeam);
    const venue = normalizeVenue(match);
    const kickoff = buildKickoff(match.date, match.time);

    return {
      id: match.num || match.id || index + 1,
      round: match.round || match.stage || "Mundial 2026",
      title: team1 && team2 ? `${team1} vs ${team2}` : match.name || match.title || `Partido ${match.num || index + 1}`,
      team1,
      team2,
      date: match.date || "",
      time: match.time || "",
      kickoff,
      venue,
      raw: match,
    };
  });
}

function getTeamName(team) {
  if (!team) return "";
  if (typeof team === "string") return team;
  return team.name || team.code || team.key || "";
}

function normalizeVenue(match) {
  const venueObject = typeof match.stadium === "object" ? match.stadium : typeof match.venue === "object" ? match.venue : {};
  const name = venueObject.name || match.stadium || match.venue || match.location || "Estadio por confirmar";
  const city = venueObject.city || match.city || match.host_city || "Ciudad por confirmar";
  const country = venueObject.country || match.country || inferCountry(city);

  return {
    name,
    city,
    country,
    latitude: Number(venueObject.lat || venueObject.latitude || match.lat || match.latitude) || null,
    longitude: Number(venueObject.lon || venueObject.lng || venueObject.longitude || match.lon || match.longitude) || null,
  };
}

function inferCountry(city = "") {
  const value = city.toLowerCase();
  if (["toronto", "vancouver"].some((item) => value.includes(item))) return "Canadá";
  if (["guadalajara", "monterrey", "mexico", "ciudad de méxico"].some((item) => value.includes(item))) return "México";
  if (city && city !== "Ciudad por confirmar") return "Estados Unidos";
  return "País por confirmar";
}

function buildKickoff(date, time) {
  if (!date) return null;
  const normalizedTime = time ? time.padStart(5, "0") : "00:00";
  const parsed = new Date(`${date}T${normalizedTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function populateCountries(matches) {
  const countries = [...new Set(matches.map((match) => match.venue.country).filter(Boolean))].sort();
  elements.countryFilter.innerHTML = '<option value="">Todos</option>';
  countries.forEach((country) => {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    elements.countryFilter.append(option);
  });
}

function applyFilters() {
  const query = elements.search.value.trim().toLowerCase();
  const country = elements.countryFilter.value;
  const sortBy = elements.sortFilter.value;

  state.filteredMatches = state.matches
    .filter((match) => {
      const haystack = [match.title, match.round, match.venue.name, match.venue.city, match.venue.country].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (!country || match.venue.country === country);
    })
    .sort((a, b) => {
      if (sortBy === "city") return a.venue.city.localeCompare(b.venue.city);
      if (sortBy === "country") return a.venue.country.localeCompare(b.venue.country);
      return (a.kickoff?.getTime() || 0) - (b.kickoff?.getTime() || 0);
    });

  renderMatches();
}

function renderMatches() {
  elements.list.innerHTML = "";
  elements.count.textContent = `${state.filteredMatches.length} partidos`;

  if (!state.filteredMatches.length) {
    elements.list.innerHTML = '<p class="notice warning">No hay partidos que coincidan con los filtros actuales.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filteredMatches.forEach((match) => {
    const node = elements.template.content.cloneNode(true);
    const card = node.querySelector(".match-card");
    card.querySelector(".match-date").textContent = formatDate(match.kickoff, match.date, match.time);
    card.querySelector(".match-title").textContent = match.title;
    card.querySelector(".match-meta").textContent = match.round;
    card.querySelector(".match-venue").textContent = `${match.venue.name} · ${match.venue.city}, ${match.venue.country}`;
    card.addEventListener("click", () => openDetails(match));
    fragment.append(node);
  });

  elements.list.append(fragment);
}

async function openDetails(match) {
  renderDetails(match, { loading: true });
  elements.dialog.showModal();

  try {
    const venue = match.venue.latitude && match.venue.longitude ? match.venue : await geocodeVenue(match.venue);
    const hotels = venue.latitude && venue.longitude ? await findNearbyHotels(venue) : [];
    renderDetails(match, { venue, hotels });
  } catch (error) {
    renderDetails(match, { error: error.message });
  }
}

async function geocodeVenue(venue) {
  const params = new URLSearchParams({
    q: `${venue.name} ${venue.city} ${venue.country}`,
    format: "jsonv2",
    limit: "1",
  });
  const response = await fetch(`${NOMINATIM_URL}?${params}`);
  if (!response.ok) throw new Error("No se pudo ubicar el estadio con Nominatim.");
  const [place] = await response.json();
  if (!place) return venue;
  return { ...venue, latitude: Number(place.lat), longitude: Number(place.lon) };
}

async function findNearbyHotels(venue) {
  const query = `
    [out:json][timeout:25];
    (
      node["tourism"~"hotel|hostel|motel|guest_house"](around:6000,${venue.latitude},${venue.longitude});
      way["tourism"~"hotel|hostel|motel|guest_house"](around:6000,${venue.latitude},${venue.longitude});
      relation["tourism"~"hotel|hostel|motel|guest_house"](around:6000,${venue.latitude},${venue.longitude});
    );
    out center tags 12;
  `;
  const response = await fetch(OVERPASS_URL, { method: "POST", body: query });
  if (!response.ok) throw new Error("Overpass no pudo responder la búsqueda de hoteles cercanos.");
  const data = await response.json();
  return (data.elements || [])
    .map((item) => ({
      name: item.tags?.name || "Alojamiento sin nombre publicado",
      type: item.tags?.tourism || "hotel",
      website: item.tags?.website || item.tags?.["contact:website"] || "",
      phone: item.tags?.phone || item.tags?.["contact:phone"] || "",
      lat: item.lat || item.center?.lat,
      lon: item.lon || item.center?.lon,
    }))
    .filter((hotel) => hotel.lat && hotel.lon)
    .slice(0, 12);
}

function renderDetails(match, options = {}) {
  const venue = options.venue || match.venue;
  const hotels = options.hotels || [];
  const mapsUrl = buildMapsUrl(venue);
  const flightUrl = buildGoogleFlightsUrl(match, venue);
  const hotelSearchUrl = buildHotelSearchUrl(match, venue);

  elements.details.innerHTML = `
    <div class="details-body">
      <div class="details-hero">
        <p class="eyebrow">${escapeHtml(match.round)}</p>
        <h2>${escapeHtml(match.title)}</h2>
        <p class="muted">${escapeHtml(formatDate(match.kickoff, match.date, match.time))}</p>
      </div>

      <div class="details-grid">
        <div class="info-box"><span>País anfitrión</span><strong>${escapeHtml(venue.country)}</strong></div>
        <div class="info-box"><span>Ciudad</span><strong>${escapeHtml(venue.city)}</strong></div>
        <div class="info-box"><span>Estadio</span><strong>${escapeHtml(venue.name)}</strong></div>
      </div>

      <div class="actions">
        <a class="link-button" href="${mapsUrl}" target="_blank" rel="noreferrer">Ver estadio en Google Maps</a>
        <a class="link-button" href="${flightUrl}" target="_blank" rel="noreferrer">Consultar precio de vuelo en Google Flights</a>
        <a class="link-button" href="${hotelSearchUrl}" target="_blank" rel="noreferrer">Comparar hoteles en Google</a>
      </div>

      ${renderPreferenceNotice()}
      ${options.loading ? '<p class="notice warning">Buscando hoteles cercanos en OpenStreetMap/Overpass…</p>' : ""}
      ${options.error ? `<p class="notice error">${escapeHtml(options.error)}</p>` : ""}

      <h3>Hoteles y alojamientos cercanos</h3>
      ${renderHotels(hotels)}
    </div>
  `;
}

function renderPreferenceNotice() {
  if (state.preferences.origin) {
    return `<p class="notice">Salida configurada: <strong>${escapeHtml(state.preferences.origin)}</strong>${state.preferences.originAirport ? ` · Aeropuerto: <strong>${escapeHtml(state.preferences.originAirport)}</strong>` : ""}</p>`;
  }
  return '<p class="notice warning">Para que la búsqueda de vuelos sea más precisa, guarda primero tu ciudad/país de origen.</p>';
}

function renderHotels(hotels) {
  if (!hotels.length) {
    return '<p class="notice warning">Todavía no encontramos alojamientos cercanos publicados en OpenStreetMap para este estadio. Usa el botón de Google para ampliar la búsqueda.</p>';
  }

  return `<div class="hotel-list">${hotels.map((hotel) => `
    <article class="hotel-card">
      <span>${escapeHtml(hotel.type)}</span>
      <strong>${escapeHtml(hotel.name)}</strong>
      <p class="muted">${hotel.phone ? `Tel: ${escapeHtml(hotel.phone)}` : "Contacto no publicado"}</p>
      <a href="${hotel.website || buildMapsUrl({ latitude: hotel.lat, longitude: hotel.lon, name: hotel.name })}" target="_blank" rel="noreferrer">Ver información</a>
    </article>
  `).join("")}</div>`;
}

function buildMapsUrl(venue) {
  const query = venue.latitude && venue.longitude ? `${venue.latitude},${venue.longitude}` : `${venue.name} ${venue.city} ${venue.country}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildGoogleFlightsUrl(match, venue) {
  const origin = state.preferences.originAirport || state.preferences.origin || "mi ubicación";
  const query = `vuelos desde ${origin} a ${venue.city} ${venue.country} para ${match.date || "la fecha del partido"} ${state.preferences.passengers || 1} pasajero(s)`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

function buildHotelSearchUrl(match, venue) {
  const query = `hoteles cerca de ${venue.name} ${venue.city} ${venue.country} ${match.date || ""}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function formatDate(date, fallbackDate, fallbackTime) {
  if (!date) return [fallbackDate, fallbackTime].filter(Boolean).join(" ") || "Fecha por confirmar";
  return new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function setStatus(title, message, type = "info") {
  elements.statusTitle.textContent = title;
  elements.statusMessage.textContent = message;
  elements.statusTitle.style.color = type === "error" ? "var(--danger)" : "var(--text)";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}
