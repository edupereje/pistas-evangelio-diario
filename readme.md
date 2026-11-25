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

El importador de producción acepta el perfil extendido. Guarda A en el libro privado y exporta únicamente estudios aprobados para fechas que ya han llegado. El 25 de noviembre de 2026 se comprobó una reparación real por fecha: 0 días añadidos, 1 actualizado y 30 estudios aprobados exportados. La lectura completa del estudio del día se verificó en la app.

La app publicada sirve la versión 8.20.0. El diseño del servicio independiente está documentado en [docs/ESTUDIOS_API.md](docs/ESTUDIOS_API.md); su apartado de estado conserva la situación histórica del 27 de octubre. Se conserva el contrato de Pistas.

Antes de entregar o importar cada JSON, ejecutar `npm run validar:entrega -- /ruta/entrega.json` y comprobar los enlaces nuevos. Después de importar, verificar la A publicada con `--app https://pistas-evangelio-diario.netlify.app` y abrirla en la interfaz. El procedimiento completo y los límites de cada comprobación están en [docs/VALIDACION_ENTREGAS.md](docs/VALIDACION_ENTREGAS.md). El validador reutiliza el contrato del importador y el lector real de la app; no publica ni modifica datos.
