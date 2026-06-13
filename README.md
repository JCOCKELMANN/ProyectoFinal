#  Mundial

Aplicacion web en HTML, CSS y JavaScript para consultar partidos del Mundial 2026 y planificar vuelos/hoteles desde Guatemala.

## Fuentes dinamicas

- Calendario: `openfootball/worldcup.json`.
- Banderas: `flagcdn.com`, resueltas por nombre/codigo de pais.
- Estadios: datos de sede del calendario mas coordenadas conocidas del Mundial 2026.
- Hoteles cercanos: backend local consultando Overpass/OpenStreetMap.
- Vuelos: endpoint backend preparado para Skyscanner/RapidAPI; sin llave, devuelve enlace dinamico a Google Flights.

## Ejecutar

Requiere Node 22 o superior.

```powershell
node server.js
```

Luego abre:

```text
http://localhost:5500
```

Tambien puedes cambiar el puerto:

```powershell
$env:PORT=8080
node server.js
```

## API keys

No pongas llaves privadas en `app.js`. Configuralas como variables de entorno antes de levantar el servidor:

```powershell
$env:SKYSCANNER_API_KEY="tu_api_key"
$env:RAPIDAPI_KEY="tu_rapidapi_key"
node server.js
```

Skyscanner requiere aprobacion de Partnerships y usa `x-api-key` en llamadas de servidor. RapidAPI tambien debe llamarse desde backend para no exponer la llave en el navegador.

## Endpoints locales

- `GET /api/health`
- `GET /api/hotels/nearby?lat=...&lon=...`
- `GET /api/flights/search?origin=GUA&destination=...&date=YYYY-MM-DD`

El endpoint de vuelos queda listo para completar el adaptador real de Skyscanner/RapidAPI cuando tengas credenciales y el proveedor definitivo.
