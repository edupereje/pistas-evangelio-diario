# Pistas del Evangelio — v8 Sheet

Versión limpia de la app conectada al Google Sheet mediante Apps Script.

## Qué incluye

- Contenido leído desde `/api/pistas`, que actúa como proxy del Apps Script.
- Archivo: solo muestra hoy y días anteriores.
- Sección `Estoy empezando` cuando la columna `estoyEmpezando` tenga contenido.
- Botón `Imagen del día` cuando `imagenDiaUrl` tenga una URL.
- Sección fija `Cómo rezar con la Palabra` en Ajustes.
- Notificaciones push reales con Netlify Functions + Netlify Blobs.
- Donar, recomendar, compartir, copiar, WhatsApp/correo.

## Fuente de contenidos

El enlace actual del Apps Script está definido en `netlify/functions/_content.mjs`.

Opcionalmente, puedes configurar en Netlify la variable:

```text
CONTENT_API_URL
```

Si esa variable existe, la app usará ese enlace en lugar del enlace incluido en el código.

## Variables de entorno necesarias en Netlify

Configura estas variables en Netlify:

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

Opcional:

```text
CONTENT_API_URL
```

## Deploy

Configuración Netlify:

```text
Build command: vacío
Publish directory: public
Functions directory: netlify/functions
```

El archivo `netlify.toml` ya contiene la configuración.

## Flujo mensual

1. Editar el Google Sheet maestro.
2. Añadir las filas del mes siguiente en `Contenido`.
3. Revisar `publicar = sí`.
4. Añadir `estoyEmpezando` cuando esté preparado.
5. Añadir `imagenDiaUrl` solo en los días con imagen.
6. La app se actualiza sin tocar GitHub ni Netlify.
