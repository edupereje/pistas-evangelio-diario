# Pistas del Evangelio — v6 con notificaciones reales

Esta versión corrige el archivo para que solo se muestren la Pista de hoy y las anteriores. Las Pistas futuras quedan cargadas internamente y aparecen cuando llega su fecha.

Incluye backend de notificaciones reales con Netlify Functions, Netlify Blobs y función programada cada 15 minutos.

## Despliegue recomendado

1. Crea un repositorio en GitHub.
2. Sube todo el contenido de esta carpeta.
3. Conecta el repositorio con Netlify.
4. En Netlify, configura:

- Build command: dejar vacío
- Publish directory: `public`
- Functions directory: `netlify/functions`

El archivo `netlify.toml` ya contiene la configuración.

## Variables de entorno

En Netlify añade estas variables desde Site configuration → Environment variables:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Las claves están en `docs/VAPID_KEYS_NETLIFY_ENV.txt`. No publiques la clave privada.

## Prueba

1. Abre la app publicada en el móvil.
2. Instálala en pantalla de inicio.
3. Ábrela desde el icono.
4. Ve a Ajustes.
5. Elige hora y pulsa Activar notificaciones.
6. Pulsa Probar notificación.
7. Comprueba que llega.

El envío diario real lo ejecuta `netlify/functions/send-daily.mjs` cada 15 minutos.
