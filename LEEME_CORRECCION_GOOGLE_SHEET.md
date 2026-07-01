# Pistas del Evangelio — corrección Google Sheet en vivo

Esta versión corrige el problema de julio: la app ya no depende solo de `public/data/pistas.json`.

## Qué cambia

- Se añade la función `/.netlify/functions/pistas`.
- Se añade la ruta pública `/api/pistas` en `netlify.toml`.
- La pantalla principal intenta leer primero el respaldo local y después actualiza desde `/api/pistas`.
- Las notificaciones diarias (`send-daily`) leen también desde Google Sheet, no desde el JSON local.
- Se fuerza una versión nueva del service worker (`v=8.11`) para evitar que el móvil se quede con la app antigua.

## Fuente de datos por defecto

La función intenta leer la pestaña `Contenido` de este Google Sheet:

`1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E`

mediante CSV:

`https://docs.google.com/spreadsheets/d/1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E/gviz/tq?tqx=out:csv&sheet=Contenido`

## Recomendado en Netlify

En Netlify, entra en:

Site configuration / Environment variables

Añade esta variable:

`PISTAS_SHEET_CSV_URL`

con el enlace CSV publicado de la pestaña `Contenido`.

Si no la añades, la app usará la URL por defecto anterior.

## Comprobación obligatoria después de desplegar

Abre:

`https://TU-APP.netlify.app/api/pistas?force=1&v=prueba-julio`

Tiene que devolver algo parecido a:

```json
{
  "ok": true,
  "count": 65,
  "firstFecha": "2026-05-01",
  "lastFecha": "2026-07-05",
  "items": [...]
}
```

Busca dentro `2026-07-01`.

Luego prueba:

`https://TU-APP.netlify.app/?fecha=2026-07-01&leer=1&v=prueba-julio`

## Si falla

Si `/api/pistas` devuelve error 403, 404 o 500, casi seguro que Google Sheet no está accesible como CSV público.

Solución:

1. En Google Sheet: Archivo > Compartir > Publicar en la web.
2. Elige la pestaña `Contenido`.
3. Formato: CSV.
4. Copia el enlace.
5. Pégalo en Netlify como variable `PISTAS_SHEET_CSV_URL`.
6. Vuelve a desplegar o a hacer `Clear cache and deploy site`.

