# Mundial Planner

Aplicación web estática en HTML, CSS y JavaScript para consultar dinámicamente partidos del Mundial 2026 y planificar el viaje a un partido seleccionado.

## Fuentes dinámicas usadas

- **Calendario de partidos:** se descarga en tiempo real desde `openfootball/worldcup.json` en GitHub Raw.
- **Ubicación de estadios:** se consulta con Nominatim/OpenStreetMap cuando la fuente del partido no incluye coordenadas.
- **Hoteles cercanos:** se consultan en Overpass API usando datos de OpenStreetMap alrededor del estadio.
- **Vuelos y comparación de precios:** la app genera una búsqueda dinámica hacia Google Flights con el origen configurado por el usuario, el destino y la fecha del partido.

## Cómo ejecutar

Como usa módulos ES y llamadas `fetch`, abre la carpeta con un servidor local:

```bash
python3 -m http.server 8080
```

Luego entra a `http://localhost:8080`.

## Nota importante sobre Google y precios de vuelos

Google Flights y Google Hotels no ofrecen una API pública gratuita para leer precios directamente desde JavaScript del navegador. Por eso esta versión evita scraping y, en su lugar, genera enlaces de búsqueda en tiempo real. Para mostrar precios dentro de la página se recomienda añadir un backend/proxy con una API autorizada de viajes, por ejemplo Amadeus, SerpApi, Skyscanner/RapidAPI o Travelpayouts.
