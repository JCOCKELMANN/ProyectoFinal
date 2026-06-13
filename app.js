const WORLD_CUP_SOURCE = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";
const FLAG_BASE_URL = "https://flagcdn.com/w80";
const IMAGE_SOURCE_URL = "/api/images/search?q=";

// Completa la informacion que el calendario remoto no siempre incluye.
const WORLD_CUP_2026_VENUES = {
  "atlanta": { name: "Mercedes-Benz Stadium", city: "Atlanta", country: "Estados Unidos", latitude: 33.7554, longitude: -84.4008 },
  "boston (foxborough)": { name: "Gillette Stadium", city: "Foxborough", country: "Estados Unidos", latitude: 42.0909, longitude: -71.2643 },
  "dallas (arlington)": { name: "AT&T Stadium", city: "Arlington", country: "Estados Unidos", latitude: 32.7473, longitude: -97.0945 },
  "guadalajara (zapopan)": { name: "Estadio Akron", city: "Zapopan", country: "Mexico", latitude: 20.6817, longitude: -103.4629 },
  "houston": { name: "NRG Stadium", city: "Houston", country: "Estados Unidos", latitude: 29.6847, longitude: -95.4107 },
  "kansas city": { name: "Arrowhead Stadium", city: "Kansas City", country: "Estados Unidos", latitude: 39.0489, longitude: -94.4839 },
  "los angeles (inglewood)": { name: "SoFi Stadium", city: "Inglewood", country: "Estados Unidos", latitude: 33.9535, longitude: -118.3392 },
  "mexico city": { name: "Estadio Azteca", city: "Mexico City", country: "Mexico", latitude: 19.3029, longitude: -99.1505 },
  "miami (miami gardens)": { name: "Hard Rock Stadium", city: "Miami Gardens", country: "Estados Unidos", latitude: 25.958, longitude: -80.2389 },
  "monterrey (guadalupe)": { name: "Estadio BBVA", city: "Guadalupe", country: "Mexico", latitude: 25.6682, longitude: -100.2448 },
  "new york/new jersey (east rutherford)": { name: "MetLife Stadium", city: "East Rutherford", country: "Estados Unidos", latitude: 40.8135, longitude: -74.0745 },
  "philadelphia": { name: "Lincoln Financial Field", city: "Philadelphia", country: "Estados Unidos", latitude: 39.9008, longitude: -75.1675 },
  "san francisco bay area (santa clara)": { name: "Levi's Stadium", city: "Santa Clara", country: "Estados Unidos", latitude: 37.403, longitude: -121.9702 },
  "seattle": { name: "Lumen Field", city: "Seattle", country: "Estados Unidos", latitude: 47.5952, longitude: -122.3316 },
  "toronto": { name: "BMO Field", city: "Toronto", country: "Canada", latitude: 43.6332, longitude: -79.4186 },
  "vancouver": { name: "BC Place", city: "Vancouver", country: "Canada", latitude: 49.2768, longitude: -123.1119 },
};

const state = {
  matches: [],
  filteredMatches: [],
  selectedMatch: null,
  currentPage: 1,
  pageSize: 12,
};

// Referencias compartidas del DOM para evitar buscarlas en cada renderizado.
const elements = {
  homeView: document.querySelector("#home-view"),
  calendarView: document.querySelector("#calendar-view"),
  detailView: document.querySelector("#detail-view"),
  homeHero: document.querySelector("#home-hero"),
  heroMatch: document.querySelector("#hero-match"),
  navLinks: document.querySelectorAll("[data-route]"),
  searchForm: document.querySelector(".header-search"),
  search: document.querySelector("#search"),
  countryFilter: document.querySelector("#country-filter"),
  groupFilter: document.querySelector("#group-filter"),
  sortFilter: document.querySelector("#sort-filter"),
  reloadBtn: document.querySelector("#reload-btn"),
  statusTitle: document.querySelector("#status-title"),
  homeMatches: document.querySelector("#home-matches"),
  stadiumCards: document.querySelector("#stadium-cards"),
  list: document.querySelector("#matches-list"),
  pagination: document.querySelector("#pagination"),
  details: document.querySelector("#details-content"),
  template: document.querySelector("#match-row-template"),
};

init();

// Registra los eventos principales y carga el calendario inicial.
function init() {
  elements.navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const route = link.dataset.route;
      if (!route) return;
      event.preventDefault();
      showView(route);
    });
  });

  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    showView("calendar");
    applyFilters();
  });

  elements.search.addEventListener("input", applyFilters);
  elements.countryFilter.addEventListener("change", applyFilters);
  elements.groupFilter.addEventListener("change", applyFilters);
  elements.sortFilter.addEventListener("change", applyFilters);
  elements.reloadBtn.addEventListener("click", loadMatches);

  loadMatches();
}

async function loadMatches() {
  setStatus("Cargando partidos...");
  elements.reloadBtn.disabled = true;

  try {
    const response = await fetch(`${WORLD_CUP_SOURCE}?cacheBust=${Date.now()}`);
    if (!response.ok) throw new Error(`La fuente respondio ${response.status}`);

    const data = await response.json();
    const matches = normalizeMatches(data);
    if (!matches.length) throw new Error("No se encontraron partidos.");

    state.matches = sortMatches(matches);
    setStatus(`${matches.length} partidos cargados desde la API`);
  } catch (error) {
    state.matches = [];
    setStatus(`No se pudo cargar la API: ${error.message}`);
  } finally {
    populateGroups(state.matches);
    populateCountries(state.matches);
    applyFilters();
    renderHome();
    elements.reloadBtn.disabled = false;
  }
}

// Convierte los diferentes formatos posibles de la fuente a un modelo comun.
function normalizeMatches(data) {
  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  const directMatches = Array.isArray(data.matches) ? data.matches : [];
  const sourceMatches = directMatches.length
    ? directMatches.map((match) => ({ ...match, round: match.round || data.name || match.round }))
    : rounds.flatMap((round) => (round.matches || []).map((match) => ({ ...match, round: round.name })));

  return sourceMatches.map((match, index) => {
    const team1Raw = match.team1 || match.home_team || match.homeTeam;
    const team2Raw = match.team2 || match.away_team || match.awayTeam;
    const team1 = getTeamName(team1Raw) || "Por definir";
    const team2 = getTeamName(team2Raw) || "Por definir";
    const venue = normalizeVenue(match);
    const kickoff = buildKickoff(match.date, match.time);

    return {
      id: match.num || match.id || index + 1,
      round: match.round || match.stage || "Mundial 2026",
      team1,
      team2,
      team1Code: getTeamCode(team1Raw, team1),
      team2Code: getTeamCode(team2Raw, team2),
      date: match.date || "",
      time: match.time || "",
      kickoff,
      venue,
    };
  });
}

function getTeamName(team) {
  if (!team) return "";
  if (typeof team === "string") return team;
  return team.name || team.country || team.code || team.key || "";
}

function getTeamCode(team, fallbackName) {
  // El nombre es mas confiable porque la fuente usa abreviaturas propias.
  const nameCode = countryCodeFromName(fallbackName);
  if (nameCode) return nameCode;

  if (typeof team === "string") {
    const normalized = normalizeCountryCode(team);
    if (normalized) return normalized;
  }

  if (team && typeof team === "object") {
    const rawCode = team.code || team.fifa_code || team.fifaCode || team.key || team.iso2 || team.country_code;
    const normalized = normalizeCountryCode(rawCode);
    if (normalized) return normalized;
  }
  return countryCodeFromName(fallbackName);
}

function normalizeCountryCode(code = "") {
  const value = String(code).trim().toLowerCase();
  if (!value) return "";
  // Traduce codigos FIFA y abreviaturas particulares del JSON a ISO/FlagCDN.
  const aliases = {
    tu: "tn",
    ne: "nz",
    sw: "ch",
    al: "dz",
    dr: "cd",
    ha: "ht",
    sc: "gb-sct",
    cu: "cw",
    eg: "eg",
    no: "no",
    irq: "iq",
    swe: "se",
    cap: "cv",
    eng: "gb-eng",
    sco: "gb-sct",
    wal: "gb-wls",
    nir: "gb-nir",
    usa: "us",
    bra: "br",
    arg: "ar",
    mex: "mx",
    ger: "de",
    deu: "de",
    esp: "es",
    fra: "fr",
    can: "ca",
    qat: "qa",
    por: "pt",
    kor: "kr",
    cro: "hr",
    cze: "cz",
    sui: "ch",
    bih: "ba",
    rsa: "za",
    mar: "ma",
    tun: "tn",
    sen: "sn",
    nga: "ng",
    gha: "gh",
    jpn: "jp",
    irn: "ir",
    ksa: "sa",
    aus: "au",
    uru: "uy",
    col: "co",
    ecu: "ec",
    chi: "cl",
    par: "py",
    per: "pe",
  };
  if (aliases[value]) return aliases[value];
  if (/^[a-z]{2}$/.test(value)) return value;
  return "";
}

function countryCodeFromName(team = "") {
  const key = normalizeText(team);
  const codes = {
    argentina: "ar",
    brasil: "br",
    brazil: "br",
    canada: "ca",
    espana: "es",
    spain: "es",
    france: "fr",
    francia: "fr",
    germany: "de",
    alemania: "de",
    england: "gb-eng",
    inglaterra: "gb-eng",
    mexico: "mx",
    portugal: "pt",
    qatar: "qa",
    usa: "us",
    "united states": "us",
    "estados unidos": "us",
    austria: "at",
    belgica: "be",
    belgium: "be",
    "bosnia & herzegovina": "ba",
    "bosnia and herzegovina": "ba",
    bosnia: "ba",
    chile: "cl",
    colombia: "co",
    croacia: "hr",
    croatia: "hr",
    curacao: "cw",
    "cape verde": "cv",
    "cabo verde": "cv",
    "czech republic": "cz",
    chequia: "cz",
    ecuador: "ec",
    egypt: "eg",
    egipto: "eg",
    ghana: "gh",
    haiti: "ht",
    iran: "ir",
    iraq: "iq",
    irak: "iq",
    "ivory coast": "ci",
    "cote d ivoire": "ci",
    "costa de marfil": "ci",
    japon: "jp",
    japan: "jp",
    "korea republic": "kr",
    marruecos: "ma",
    morocco: "ma",
    "new zealand": "nz",
    "nueva zelanda": "nz",
    netherlands: "nl",
    holanda: "nl",
    nigeria: "ng",
    norway: "no",
    noruega: "no",
    paraguay: "py",
    peru: "pe",
    "saudi arabia": "sa",
    "arabia saudita": "sa",
    senegal: "sn",
    sweden: "se",
    suecia: "se",
    "south africa": "za",
    sudafrica: "za",
    "south korea": "kr",
    "corea del sur": "kr",
    scotland: "gb-sct",
    escocia: "gb-sct",
    switzerland: "ch",
    suiza: "ch",
    tunez: "tn",
    tunisia: "tn",
    turkiye: "tr",
    turkey: "tr",
    turquia: "tr",
    algeria: "dz",
    argelia: "dz",
    jordan: "jo",
    jordania: "jo",
    "dr congo": "cd",
    "congo dr": "cd",
    "republica democratica del congo": "cd",
    uzbekistan: "uz",
    panama: "pa",
    australia: "au",
    uruguay: "uy",
  };
  return codes[key] || "";
}

function normalizeVenue(match) {
  const venueObject = typeof match.stadium === "object" ? match.stadium : typeof match.venue === "object" ? match.venue : {};
  const groundVenue = findWorldCup2026Venue(match.ground);
  const name = venueObject.name || match.stadium || match.venue || match.location || groundVenue?.name || match.ground || "Estadio por confirmar";
  const city = venueObject.city || match.city || match.host_city || groundVenue?.city || parseGroundCity(match.ground) || "Ciudad por confirmar";
  const country = venueObject.country || match.country || groundVenue?.country || inferCountry(city);

  return {
    name,
    city,
    country,
    latitude: Number(venueObject.lat || venueObject.latitude || match.lat || match.latitude || groundVenue?.latitude) || null,
    longitude: Number(venueObject.lon || venueObject.lng || venueObject.longitude || match.lon || match.longitude || groundVenue?.longitude) || null,
    image: buildStadiumImageUrl(name, city),
  };
}

function findWorldCup2026Venue(ground = "") {
  return WORLD_CUP_2026_VENUES[normalizeGroundKey(ground)] || null;
}

function normalizeGroundKey(value = "") {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function parseGroundCity(ground = "") {
  return String(ground).replace(/\s*\(([^)]+)\)\s*/g, " $1").trim();
}

function inferCountry(city = "") {
  const value = normalizeText(city);
  if (["toronto", "vancouver"].some((item) => value.includes(item))) return "Canada";
  if (["guadalajara", "monterrey", "mexico", "ciudad de mexico"].some((item) => value.includes(item))) return "Mexico";
  if (city && city !== "Ciudad por confirmar") return "Estados Unidos";
  return "Pais por confirmar";
}

function buildKickoff(date, time) {
  if (!date) return null;

  const timeValue = String(time || "00:00").trim();
  const timeMatch = timeValue.match(/(\d{1,2}):(\d{2})/);
  const offsetMatch = timeValue.match(/UTC([+-]\d{1,2})(?::(\d{2}))?/i);
  const hours = timeMatch ? Number(timeMatch[1]) : 0;
  const minutes = timeMatch ? Number(timeMatch[2]) : 0;

  if (offsetMatch) {
    const offsetHours = Number(offsetMatch[1]);
    const offsetMinutes = Number(offsetMatch[2] || 0) * Math.sign(offsetHours);
    const localAsUtc = Date.parse(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`);
    return new Date(localAsUtc - ((offsetHours * 60) + offsetMinutes) * 60_000);
  }

  const parsed = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sortMatches(matches) {
  return [...matches].sort((a, b) => (a.kickoff?.getTime() || Number.MAX_SAFE_INTEGER) - (b.kickoff?.getTime() || Number.MAX_SAFE_INTEGER));
}

function populateGroups(matches) {
  const groups = [...new Set(matches.map((match) => match.round).filter(Boolean))].sort();
  elements.groupFilter.innerHTML = '<option value="">Grupo</option>';
  groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = group;
    elements.groupFilter.append(option);
  });
}

function populateCountries(matches) {
  const countries = [...new Set(matches.map((match) => match.venue.country).filter(Boolean))].sort();
  elements.countryFilter.innerHTML = '<option value="">Seleccionar Pais</option>';
  countries.forEach((country) => {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    elements.countryFilter.append(option);
  });
}

function applyFilters() {
  const query = normalizeText(elements.search.value);
  const country = elements.countryFilter.value;
  const group = elements.groupFilter.value;
  const sortBy = elements.sortFilter.value;

  state.filteredMatches = state.matches
    .filter((match) => {
      const haystack = normalizeText([match.team1, match.team2, match.round, match.venue.name, match.venue.city, match.venue.country].join(" "));
      return (!query || haystack.includes(query)) && (!country || match.venue.country === country) && (!group || match.round === group);
    })
    .sort((a, b) => {
      if (sortBy === "city") return a.venue.city.localeCompare(b.venue.city);
      if (sortBy === "stadium") return a.venue.name.localeCompare(b.venue.name);
      return (a.kickoff?.getTime() || 0) - (b.kickoff?.getTime() || 0);
    });

  state.currentPage = 1;
  renderMatches();
}

// El inicio muestra automaticamente el siguiente partido aun pendiente.
function renderHome() {
  const nextMatches = getUpcomingMatches();
  const featuredMatch = nextMatches[0] || state.matches[0];

  renderHeroMatch(featuredMatch);
  renderHomeMatches(nextMatches.slice(0, 4));
  renderStadiumCards(nextMatches.length ? nextMatches : state.matches);

  if (featuredMatch) {
    setElementBackground(elements.homeHero, buildStadiumImageUrl(featuredMatch.venue.name, featuredMatch.venue.city, "soccer stadium field"));
  }
}

function getUpcomingMatches() {
  const now = new Date();
  const upcoming = state.matches.filter((match) => match.kickoff && match.kickoff >= now);
  if (upcoming.length) return upcoming;

  // Si el calendario ya termino, muestra primero el partido jugado mas recientemente.
  return [...state.matches].sort((a, b) => (b.kickoff?.getTime() || 0) - (a.kickoff?.getTime() || 0));
}

function renderHeroMatch(match) {
  if (!match) {
    elements.heroMatch.innerHTML = '<p class="notice">Cargando proximo partido...</p>';
    return;
  }

  elements.heroMatch.innerHTML = `
    <div class="score-date">
      <strong>${escapeHtml(formatShortDate(match).toUpperCase())}</strong>
      <span>${escapeHtml(match.team1)} vs ${escapeHtml(match.team2)}</span>
    </div>
    <div class="score-team">
      ${renderFlag(match.team1Code, match.team1)}
      <strong>${escapeHtml(shortTeamCode(match.team1Code, match.team1))}</strong>
      <span>${escapeHtml(match.team1)}</span>
    </div>
    <div class="score-time">
      <span>${escapeHtml(match.time || "Por definir")}</span>
    </div>
    <div class="score-team score-team-right">
      ${renderFlag(match.team2Code, match.team2)}
      <strong>${escapeHtml(shortTeamCode(match.team2Code, match.team2))}</strong>
      <span>${escapeHtml(match.team2)}</span>
    </div>
  `;
}

function renderHomeMatches(matches) {
  if (!elements.homeMatches) return;

  elements.homeMatches.innerHTML = matches.map((match) => `
    <button class="mini-match" type="button" data-match-id="${escapeHtml(match.id)}">
      <img class="mini-match-image" src="${match.venue.image}" alt="${escapeHtml(match.venue.name)}" loading="lazy" />
      <span class="mini-match-content">
        <strong class="mini-match-teams">
          <span>${renderFlag(match.team1Code, match.team1)} ${escapeHtml(match.team1)}</span>
          <small>vs</small>
          <span>${renderFlag(match.team2Code, match.team2)} ${escapeHtml(match.team2)}</span>
        </strong>
        <span class="mini-match-meta">${escapeHtml(formatShortDate(match))} | ${escapeHtml(match.time || "Por definir")}</span>
        <span class="mini-match-venue">${escapeHtml(match.venue.name)}</span>
      </span>
    </button>
  `).join("");

  elements.homeMatches.querySelectorAll(".mini-match").forEach((card) => {
    card.addEventListener("click", () => {
      const match = matches.find((item) => String(item.id) === card.dataset.matchId);
      if (match) openDetails(match);
    });
  });
}

function renderStadiumCards(matches) {
  // La seccion de estadios es opcional; puede eliminarse del HTML sin romper la app.
  if (!elements.stadiumCards) return;

  const uniqueVenues = [];
  const seen = new Set();

  matches.forEach((match) => {
    const key = normalizeText(`${match.venue.name}-${match.venue.city}`);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueVenues.push(match.venue);
    }
  });

  elements.stadiumCards.innerHTML = uniqueVenues.slice(0, 2).map((venue) => `
    <article>
      <img src="${venue.image}" alt="${escapeHtml(venue.name)}" loading="lazy" />
      <strong>${escapeHtml(venue.name)}</strong>
      <span>${escapeHtml(venue.city)}</span>
    </article>
  `).join("");
}

// Renderiza solo la pagina activa de resultados.
function renderMatches() {
  elements.list.innerHTML = "";

  if (!state.filteredMatches.length) {
    elements.list.innerHTML = '<tr><td colspan="5"><p class="notice">No hay partidos que coincidan con la busqueda.</p></td></tr>';
    elements.pagination.innerHTML = '<button type="button" disabled>&lt; Anterior</button><button class="is-current" type="button" disabled>1</button><button type="button" disabled>Siguiente &gt;</button>';
    return;
  }

  const fragment = document.createDocumentFragment();
  const start = (state.currentPage - 1) * state.pageSize;
  const pageMatches = state.filteredMatches.slice(start, start + state.pageSize);

  pageMatches.forEach((match) => {
    const node = elements.template.content.cloneNode(true);
    const row = node.querySelector("tr");
    row.querySelector(".match-date").textContent = formatTableDate(match);
    row.querySelector(".match-title").innerHTML = renderMatchName(match);
    row.querySelector(".match-time").textContent = match.time || "Por definir";
    row.querySelector(".match-venue").textContent = match.venue.name;
    row.querySelector(".row-action").addEventListener("click", () => openDetails(match));
    fragment.append(node);
  });

  elements.list.append(fragment);
  renderPagination();
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(state.filteredMatches.length / state.pageSize));
  state.currentPage = Math.min(state.currentPage, totalPages);

  const pages = buildPaginationItems(totalPages, state.currentPage);
  elements.pagination.innerHTML = `
    <button type="button" data-page="${state.currentPage - 1}" ${state.currentPage === 1 ? "disabled" : ""}>&lt; Anterior</button>
    ${pages.map((page) => page === "..."
      ? '<span>...</span>'
      : `<button class="${page === state.currentPage ? "is-current" : ""}" type="button" data-page="${page}">${page}</button>`
    ).join("")}
    <button type="button" data-page="${state.currentPage + 1}" ${state.currentPage === totalPages ? "disabled" : ""}>Siguiente &gt;</button>
  `;

  elements.pagination.querySelectorAll("button[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.page);
      if (!page || page === state.currentPage || page < 1 || page > totalPages) return;
      state.currentPage = page;
      renderMatches();
    });
  });
}

// Produce una paginacion compacta: 1 2 ... 5 6.
function buildPaginationItems(totalPages, currentPage) {
  if (totalPages <= 6) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  return [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)
    .reduce((items, page, index, sorted) => {
      if (index > 0 && page - sorted[index - 1] > 1) items.push("...");
      items.push(page);
      return items;
    }, []);
}

function openDetails(match) {
  state.selectedMatch = match;
  showView("detail");
  renderDetails(match, { loadingFlights: true, loadingHotels: true });

  // Vuelos y hoteles cargan en paralelo; si uno falla, el otro puede mostrarse.
  Promise.allSettled([findFlightOffers(match), findNearbyHotels(match.venue)])
    .then(([flightsResult, hotelsResult]) => {
      renderDetails(match, {
        flights: flightsResult.status === "fulfilled" ? flightsResult.value : [],
        hotels: hotelsResult.status === "fulfilled" ? hotelsResult.value : [],
        flightError: flightsResult.status === "rejected" ? flightsResult.reason.message : "",
        hotelError: hotelsResult.status === "rejected" ? hotelsResult.reason.message : "",
      });
    });
}

function renderDetails(match, options = {}) {
  const mapsUrl = buildMapsUrl(match.venue);
  const flightUrl = buildFlightUrl(match);
  const hotelUrl = buildHotelUrl(match);
  const flights = options.flights || [];
  const hotels = options.hotels || [];

  elements.details.innerHTML = `
    <section class="detail-score" style="background-image: linear-gradient(rgba(5, 57, 121, 0.92), rgba(2, 39, 91, 0.94)), url('${match.venue.image}')">
      <div class="detail-team">
        ${renderFlag(match.team1Code, match.team1)}
        <span>${escapeHtml(match.team1)}</span>
      </div>
      <div>
        <div class="versus">VS</div>
        <div class="detail-meta">${escapeHtml(formatLongDate(match))}</div>
      </div>
      <div class="detail-team">
        ${renderFlag(match.team2Code, match.team2)}
        <span>${escapeHtml(match.team2)}</span>
      </div>
    </section>

    <section class="map-section">
      <div class="stadium-photo" style="background-image: url('${match.venue.image}')" role="img" aria-label="${escapeHtml(match.venue.name)}"></div>
      <div class="map-card">
        <div>
          <span class="map-pin">PIN</span>
          <strong>${escapeHtml(match.venue.name)}</strong>
          <p>${escapeHtml(match.venue.city)}, ${escapeHtml(match.venue.country)}</p>
          <a href="${mapsUrl}" target="_blank" rel="noreferrer">Ver en Google Maps</a>
        </div>
      </div>
    </section>

    <table class="info-table">
      <tbody>
        <tr><th>Estadio:</th><td>${escapeHtml(match.venue.name)}</td></tr>
        <tr><th>Ciudad:</th><td>${escapeHtml(match.venue.city)}, ${escapeHtml(match.venue.country)}</td></tr>
        <tr><th>Capacidad:</th><td>${estimateCapacity(match.venue.name)} Espectadores</td></tr>
      </tbody>
    </table>

    <section class="travel-grid">
      <article class="travel-panel">
        <h2>Vuelos desde Guatemala</h2>
        ${options.loadingFlights ? '<p class="notice">Buscando vuelos...</p>' : ""}
        ${options.flightError ? `<p class="notice">${escapeHtml(options.flightError)}</p>` : ""}
        ${renderFlights(flightUrl, flights)}
      </article>
      <article class="travel-panel hotel-panel">
        <h2>Hoteles Cercanos</h2>
        ${options.loadingHotels ? '<p class="notice">Buscando hoteles cercanos...</p>' : ""}
        ${options.hotelError ? `<p class="notice">${escapeHtml(options.hotelError)}</p>` : ""}
        ${renderHotels(hotelUrl, match, hotels)}
      </article>
    </section>
  `;
}

async function findFlightOffers(match) {
  const params = new URLSearchParams({
    origin: "GUA",
    destination: `${match.venue.city} ${match.venue.country}`,
    date: match.date || "",
  });
  const response = await fetch(`/api/flights/search?${params}`);
  if (!response.ok) throw new Error("No se pudo consultar el backend de vuelos.");
  const data = await response.json();
  return data.flights || [];
}

function renderFlights(flightUrl, flights) {
  const offers = flights.length ? flights : [
    { label: "Google Flights", detail: "Comparar vuelos disponibles", url: flightUrl },
  ];

  return offers.map((flight) => `
    <div class="offer">
      <span>${escapeHtml(flight.label)}</span>
      <small>${escapeHtml(flight.detail)}</small>
      <a href="${flight.url || flightUrl}" target="_blank" rel="noreferrer">Ver Vuelos</a>
    </div>
  `).join("");
}

async function findNearbyHotels(venue) {
  if (!venue.latitude || !venue.longitude) {
    throw new Error("El estadio no tiene coordenadas para buscar hoteles cercanos.");
  }

  const params = new URLSearchParams({ lat: venue.latitude, lon: venue.longitude });
  const response = await fetch(`/api/hotels/nearby?${params}`);
  if (!response.ok) throw new Error("No se pudo consultar el backend de hoteles.");
  const data = await response.json();
  return data.hotels || [];
}

function renderHotels(hotelUrl, match, hotels) {
  if (!hotels.length) {
    return `<div class="offer">
      <span>Busqueda de hoteles</span>
      <small>Cerca de ${escapeHtml(match.venue.name)}</small>
      <a href="${hotelUrl}" target="_blank" rel="noreferrer">Ver Hoteles</a>
    </div>`;
  }

  return hotels.map((hotel) => `
    <div class="offer hotel-offer">
      <img src="${buildHotelImageUrl(hotel.name, match.venue.city)}" alt="${escapeHtml(hotel.name)}" loading="lazy" />
      <div>
        <strong>${escapeHtml(hotel.name)}</strong>
        <span>${escapeHtml(hotel.type)}</span>
        <small>Cerca de ${escapeHtml(match.venue.name)}</small>
      </div>
      <a href="${hotel.website || buildMapsUrl({ latitude: hotel.lat, longitude: hotel.lon, name: hotel.name })}" target="_blank" rel="noreferrer">Ver Hoteles</a>
    </div>
  `).join("");
}

function showView(route) {
  const target = route === "detail" ? "detail" : route === "calendar" ? "calendar" : "home";

  elements.homeView.classList.toggle("is-visible", target === "home");
  elements.calendarView.classList.toggle("is-visible", target === "calendar");
  elements.detailView.classList.toggle("is-visible", target === "detail");

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.classList.toggle("is-active", link.dataset.route === target || (target === "detail" && link.dataset.route === "calendar"));
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderMatchName(match) {
  return `${renderFlag(match.team1Code, match.team1)} ${escapeHtml(match.team1)} <span>vs</span> ${renderFlag(match.team2Code, match.team2)} ${escapeHtml(match.team2)}`;
}

function renderFlag(code, team) {
  // Si no existe un codigo conocido, muestra iniciales en lugar de una imagen rota.
  if (!code) return `<span class="flag-code">${escapeHtml(shortTeamCode("", team))}</span>`;
  return `<img class="flag-img" src="${FLAG_BASE_URL}/${code}.png" alt="${escapeHtml(team)}" loading="lazy" />`;
}

function shortTeamCode(code, team = "") {
  if (code && code.startsWith("gb-")) return code.slice(3).toUpperCase();
  if (code) return code.toUpperCase();
  return String(team).slice(0, 2).toUpperCase() || "NA";
}

function formatTableDate(match) {
  if (!match.kickoff) return match.date || "Por definir";
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(match.kickoff).replace(".", "");
}

function formatShortDate(match) {
  if (!match.kickoff) return match.date || "Por definir";
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(match.kickoff).replace(".", "");
}

function formatLongDate(match) {
  const date = match.kickoff
    ? new Intl.DateTimeFormat("es", { day: "2-digit", month: "long", year: "numeric" }).format(match.kickoff)
    : match.date || "Fecha por confirmar";
  return `${date} | ${match.time || "Hora por confirmar"} Hrs`;
}

function estimateCapacity(stadium = "") {
  const value = normalizeText(stadium);
  if (value.includes("lusail")) return "80,000";
  if (value.includes("azteca")) return "87,000";
  if (value.includes("metlife")) return "82,500";
  if (value.includes("sofi")) return "70,000";
  return "65,000";
}

function buildMapsUrl(venue) {
  const query = venue.latitude && venue.longitude ? `${venue.latitude},${venue.longitude}` : `${venue.name} ${venue.city} ${venue.country}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildFlightUrl(match) {
  const query = `vuelos desde Guatemala a ${match.venue.city} ${match.venue.country} ${match.date}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

function buildHotelUrl(match) {
  const query = `hoteles cerca de ${match.venue.name} ${match.venue.city}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildStadiumImageUrl(stadium, city, extra = "football stadium") {
  return `${IMAGE_SOURCE_URL}${encodeURIComponent(`${stadium} ${city} ${extra}`)}`;
}

function buildHotelImageUrl(hotel, city) {
  return `${IMAGE_SOURCE_URL}${encodeURIComponent(`${hotel} ${city} hotel`)}`;
}

function setElementBackground(element, imageUrl) {
  if (!element) return;
  element.style.backgroundImage = `linear-gradient(rgba(4, 31, 72, 0.25), rgba(4, 31, 72, 0.08)), url('${imageUrl}')`;
}

function setStatus(message) {
  elements.statusTitle.textContent = message;
}

function normalizeText(value = "") {
  // Facilita busquedas y comparaciones ignorando mayusculas y tildes.
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function escapeHtml(value = "") {
  // Evita insertar contenido HTML no confiable recibido desde APIs externas.
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}
