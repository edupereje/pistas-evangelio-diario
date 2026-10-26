# Pistas del Evangelio — v6 con notificaciones reales

Esta versión corrige el archivo para que solo se muestren la Pista de hoy y las anteriores. Las Pistas futuras quedan cargadas internamente y aparecen cuando llega su fecha.

Incluye backend de notificaciones reales con Netlify Functions, Netlify Blobs y función programada cada 15 minutos.

## Despliegue recomendado

1. Crea un repositorio en GitHub.
2. Sube todo el contenido de esta carpeta.
3. Conecta el repositorio con Netlify.
4. En Netlify, configura:

- Build command: `npm test` (Node.js 22)
- Publish directory: `public`
- Functions directory: `netlify/functions`

El archivo `netlify.toml` ya contiene la configuración.

## Variables de entorno

En Netlify añade estas variables desde Site configuration → Environment variables:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

Conserva las claves configuradas en Netlify. No guardes sus valores en el repositorio ni en los registros de pruebas.

## Prueba

1. Abre la app publicada en el móvil.
2. Instálala en pantalla de inicio.
3. Ábrela desde el icono.
4. Ve a Ajustes.
5. Elige hora y pulsa Activar notificaciones.
6. Pulsa Probar notificación.
7. Comprueba que llega.

El envío diario real lo ejecuta `netlify/functions/send-daily.mjs` cada 15 minutos.

## Reparación de notificaciones: validación local

`npm ci --ignore-scripts` instala las versiones fijadas y `npm test` ejecuta las pruebas con Node.js 22. Las pruebas sustituyen el proveedor push y Netlify Blobs por objetos en memoria; no envían avisos ni leen suscripciones reales. El build de Netlify ejecuta estas pruebas antes de publicar.

El envío carga la fuente publicada actual y exige la fecha exacta de Madrid: si falta hoy o falla la fuente, no manda una Pista anterior, futura ni del respaldo local. Usa literalmente M (`notificacionTitulo`) y N (`notificacionTexto`); si N está vacía usa un texto breve con la cita. El JSON editorial de 14 claves no cambia.

Las horas se guardan en el servidor con zona Europe/Madrid. Se admiten de 00:00 a 23:45; el aviso puede llegar en los 15 minutos siguientes, ya que el cron se ejecuta cada cuarto de hora. Se mantienen horas anteriores no alineadas como 08:07 (aviso desde 08:15). Las horas heredadas entre 23:46 y 23:59 no se desplazan ni reciben otro Evangelio: deben corregirse dentro del horario admitido. La app conserva la hora anterior si falla ese guardado y reutiliza la suscripción existente. Al cambiar la hora se conservan `lastSentDate` y `lastSentAt`. En primavera, una hora inexistente se atiende desde el primer minuto válido; en otoño se toma la primera aparición de la hora repetida. La ventana de envío es de 15 minutos reales. Una baja confirmada en el servidor se mantiene aunque falle la limpieza de la suscripción del navegador.

El registro `push-delivery-state` guarda únicamente la última fecha y hora aceptadas por el proveedor, bajo el mismo identificador opaco que la suscripción. Permite deduplicar aunque falle la copia de la marca en las preferencias. Las marcas antiguas en `push-subscriptions` siguen siendo válidas. Desactivar elimina ambos registros; una respuesta 404/410 elimina la suscripción caducada. Un 403 no provoca borrados ni regeneración automática.

La deduplicación cubre repeticiones y ejecuciones solapadas en una misma instancia. Blobs 8.1.2 no ofrece escritura condicional atómica: dos instancias independientes pueden competir, y si el proveedor acepta un aviso pero fallan ambas escrituras de la marca, un reintento puede duplicarlo. El identificador diario de la notificación permite reemplazar el mismo aviso visible cuando el navegador lo admite. Esto no garantiza entrega exactamente una vez. `sent` significa aceptado por el proveedor; no confirma recepción en el móvil. Fuente del límite: [API de escritura de Blobs 8.1.2](https://github.com/netlify/blobs/blob/v8.1.2/src/store.ts).

Estado de esta reparación: preparada y probada localmente, pendiente de revisión y despliegue. Después de publicar falta comprobar en un dispositivo propio el aviso de prueba y un aviso programado, junto con el registro de ejecución. No se requiere regenerar claves si la configuración actual está completa.
