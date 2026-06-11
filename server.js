const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 5500);
const PUBLIC_DIR = __dirname;
// Se prueban varias instancias porque Overpass es un servicio publico y puede saturarse.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

// Servidor HTTP sin dependencias: expone APIs privadas y sirve el frontend.
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      return sendJson(response, {
        ok: true,
        skyscannerConfigured: Boolean(process.env.SKYSCANNER_API_KEY),
        rapidApiConfigured: Boolean(process.env.RAPIDAPI_KEY),
      });
    }

    if (url.pathname === "/api/hotels/nearby") {
      return handleNearbyHotels(url, response);
    }

    if (url.pathname === "/api/flights/search") {
      return handleFlightSearch(url, response);
    }

    if (url.pathname === "/api/images/search") {
      return handleImageSearch(url, response);
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    return sendJson(response, { error: error.message }, 500);
  }
});

server.listen(PORT, () => {
  console.log(`Servidor listo en http://localhost:${PORT}`);
});

async function handleNearbyHotels(url, response) {
  const latitude = Number(url.searchParams.get("lat"));
  const longitude = Number(url.searchParams.get("lon"));

  if (!latitude || !longitude) {
    return sendJson(response, { error: "lat y lon son requeridos." }, 400);
  }

  // Busca alojamientos registrados dentro de un radio de 6 km.
  const query = `
    [out:json][timeout:25];
    (
      node["tourism"~"hotel|hostel|motel|guest_house"](around:6000,${latitude},${longitude});
      way["tourism"~"hotel|hostel|motel|guest_house"](around:6000,${latitude},${longitude});
      relation["tourism"~"hotel|hostel|motel|guest_house"](around:6000,${latitude},${longitude});
    );
    out center tags 8;
  `;

  const result = await queryOverpass(query);
  if (!result) {
    return sendJson(response, {
      provider: "openstreetmap-overpass",
      warning: "Las instancias publicas de Overpass no respondieron. Usa la busqueda alternativa.",
      hotels: [],
    });
  }

  const data = result.data;
  const hotels = (data.elements || [])
    .map((item) => ({
      name: item.tags?.name || "Alojamiento cercano",
      type: item.tags?.tourism || "hotel",
      website: item.tags?.website || item.tags?.["contact:website"] || "",
      lat: item.lat || item.center?.lat,
      lon: item.lon || item.center?.lon,
    }))
    .filter((hotel) => hotel.lat && hotel.lon)
    .slice(0, 3);

  return sendJson(response, { provider: result.provider, hotels });
}

async function queryOverpass(query) {
  // Intenta proveedores en orden y continua con el siguiente si uno falla.
  for (const provider of OVERPASS_URLS) {
    try {
      const body = new URLSearchParams({ data: query });
      const overpassResponse = await fetch(provider, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Logio-Mundial-Planner/1.0",
        },
        body,
        signal: AbortSignal.timeout(18000),
      });

      if (!overpassResponse.ok) continue;
      return { provider, data: await overpassResponse.json() };
    } catch (error) {
      console.warn(`Overpass fallo en ${provider}: ${error.message}`);
    }
  }

  return null;
}

async function handleFlightSearch(url, response) {
  const origin = url.searchParams.get("origin") || "GUA";
  const destination = url.searchParams.get("destination") || "";
  const date = url.searchParams.get("date") || "";
  const skyscannerKey = process.env.SKYSCANNER_API_KEY;

  if (!skyscannerKey) {
    // Sin credenciales privadas se conserva una alternativa util y segura.
    return sendJson(response, {
      provider: "google-flights-link",
      configured: false,
      message: "Configura SKYSCANNER_API_KEY o RAPIDAPI_KEY en el servidor para precios reales.",
      flights: [
        {
          label: "Google Flights",
          detail: "Comparar vuelos disponibles",
          url: buildGoogleFlightsUrl(origin, destination, date),
        },
      ],
    });
  }

  return sendJson(response, {
    provider: "skyscanner",
    configured: true,
    message: "Backend listo para Skyscanner. Falta mapear origen/destino a entityId o IATA segun la cuenta aprobada.",
    flights: [
      {
        label: "Skyscanner configurado",
        detail: "Agregar busqueda create/poll con entityId en este endpoint.",
        url: buildGoogleFlightsUrl(origin, destination, date),
      },
    ],
  });
}

async function handleImageSearch(url, response) {
  const query = url.searchParams.get("q") || "football stadium";
  const fallback = "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80";
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "1",
    prop: "imageinfo",
    iiprop: "url",
    format: "json",
    origin: "*",
  });

  try {
    // Wikimedia permite encontrar una imagen relacionada sin guardar archivos locales.
    const commonsResponse = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
      headers: { "User-Agent": "Logio-Mundial-Planner/1.0" },
      signal: AbortSignal.timeout(12000),
    });
    const data = await commonsResponse.json();
    const page = Object.values(data.query?.pages || {})[0];
    const imageUrl = page?.imageinfo?.[0]?.url || fallback;
    response.writeHead(302, { Location: imageUrl, "Cache-Control": "public, max-age=86400" });
    response.end();
  } catch (error) {
    response.writeHead(302, { Location: fallback, "Cache-Control": "public, max-age=3600" });
    response.end();
  }
}

async function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  // Evita que una URL pueda leer archivos fuera de la carpeta del proyecto.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendText(response, "Forbidden", 403);
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    const headers = { "Content-Type": contentType };
    if ([".html", ".css", ".js"].includes(path.extname(filePath))) {
      headers["Cache-Control"] = "no-store";
    }
    response.writeHead(200, headers);
    response.end(file);
  } catch (error) {
    sendText(response, "Not found", 404);
  }
}

function buildGoogleFlightsUrl(origin, destination, date) {
  const query = `vuelos desde ${origin} a ${destination} ${date}`.trim();
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(query)}`;
}

function sendJson(response, payload, statusCode = 200) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendText(response, message, statusCode = 200) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
