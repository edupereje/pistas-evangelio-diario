# Pistas del Evangelio — v8.14

Esta versión hace dos cosas:

1. `/api/pistas` intenta leer Google Sheet en vivo como CSV.
2. Si Google Sheet no está accesible públicamente, usa como respaldo `public/data/pistas.json`, actualizado hasta el 5 de julio.

## Fuente configurada por defecto

Hoja:

`https://docs.google.com/spreadsheets/d/1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E/edit?usp=sharing`

CSV por defecto:

`https://docs.google.com/spreadsheets/d/1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E/gviz/tq?tqx=out:csv&sheet=Contenido`

## Variable recomendada en Netlify

Nombre:

`PISTAS_SHEET_CSV_URL`

Valor recomendado si la hoja está compartida como pública:

`https://docs.google.com/spreadsheets/d/1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E/gviz/tq?tqx=out:csv&sheet=Contenido`

Valor ideal si usas Archivo → Compartir → Publicar en la web:

`https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=...&single=true&output=csv`

## Cómo comprobarlo

Abre:

`https://pistas-evangelio-diario.netlify.app/api/pistas?force=1&v=v814-final`

- Si ves `"source":"google-sheet-csv"`, está leyendo Google Sheet en vivo.
- Si ves `"source":"local-json-fallback"`, la app funciona, pero Google Sheet no está accesible como CSV público para Netlify.
- Debe aparecer `"lastFecha":"2026-07-05"`.

Después abre:

`https://pistas-evangelio-diario.netlify.app/?fecha=2026-07-01&leer=1&v=v814-final`
