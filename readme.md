# Pistas del Evangelio — v6 con notificaciones reales

Esta versión corrige el archivo para que solo se muestren la Pista de hoy y las anteriores. Las Pistas futuras quedan cargadas internamente y aparecen cuando llega su fecha.

Incluye backend de notificaciones reales con Netlify Functions, Netlify Blobs y función programada cada 15 minutos.

## Despliegue recomendado

1. Crea un repositorio en GitHub.
2. Sube todo el contenido de esta carpeta.
3. Conecta el repositorio con Netlify.
4. En Netlify, configura:

- Build command: `npm test` con Node.js 22
- Publish directory: `public`
- Functions directory: `netlify/functions`

El archivo `netlify.toml` ya contiene la configuración.

## Variables de entorno

En Netlify añade estas variables desde Site configuration → Environment variables:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Conserva las claves configuradas en Netlify; no incluyas sus valores en el repositorio.

## Prueba

1. Abre la app publicada en el móvil.
2. Instálala en pantalla de inicio.
3. Ábrela desde el icono.
4. Ve a Ajustes.
5. Elige hora y pulsa Activar notificaciones.
6. Pulsa Probar notificación.
7. Comprueba que llega.

El envío diario real lo ejecuta `netlify/functions/send-daily.mjs` cada 15 minutos.

## Estudios bíblicos

El importador de producción ya acepta el perfil extendido y se probó desde la interfaz de Eduardo. Guarda A en el libro privado y exporta únicamente estudios aprobados para fechas que ya han llegado. La A del día 27 sigue privada con `publicar=no`; la exportación pública solo tiene la cabecera.

La app 8.20.0 de esta rama está preparada y probada localmente, pendiente de despliegue y configuración de `PISTAS_ESTUDIOS_CSV_URL`. Su servicio independiente y las condiciones de activación están documentados en [docs/ESTUDIOS_API.md](docs/ESTUDIOS_API.md). Se conserva el contrato de Pistas. Esta rama no integra la reparación de notificaciones.
