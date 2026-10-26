# Servicio de estudios bíblicos

El estudio A se consulta por separado de las Pistas. `/api/pistas` conserva su contrato y el importador conserva el JSON de 14 campos y las columnas A:O.

## Estado y activación

Estado al 27 de octubre de 2026: la API y la app de esta rama están preparadas y probadas localmente, pendientes de despliegue. El importador de Apps Script ya está aplicado y habilitado; Eduardo completó una importación real desde su interfaz (0 días añadidos, 1 actualizado). La A del día 27 quedó completa en el libro privado con `publicar=no`, y la pestaña pública Estudios solo tiene la cabecera. Esto no constituye todavía una prueba de publicación ni de lectura de A en la app.

La reparación de notificaciones se mantiene en otra rama. Esta rama de estudios conserva el código de avisos de `main` sin incorporar esa reparación.

El servicio permanece desactivado mientras no exista la variable de entorno `PISTAS_ESTUDIOS_CSV_URL`. No utiliza otras variables, el libro privado, la pestaña Contenido ni una copia local como respaldo.

La variable debe contener una URL HTTPS de exportación CSV de la pestaña pública Estudios, con esta cabecera exacta y únicamente estas cinco columnas, en este orden:

```csv
fecha,cita,titulo,contenidoMarkdown,publicar
```

Antes de activarla, el publicador de Apps Script debe copiar al libro público únicamente estudios aprobados y con fecha no posterior al día actual en Europe/Madrid. Los borradores completos y las referencias al original permanecen en el libro privado. La URL no debe apuntar a ese libro privado.

No se incluye una URL real ni contenido editorial real en las pruebas o en esta documentación.

## Consultas

`GET /api/estudios?fecha=2026-10-26&resumen=1` comprueba la disponibilidad del día visible sin enviar el estudio al navegador:

```json
{"ok":true,"item":{"fecha":"2026-10-26","cita":"Lc 13,18-21","titulo":"Estudio de prueba"}}
```

El objeto `item` del resumen tiene exactamente esas tres claves. La lectura completa se pide únicamente al abrir el estudio, mediante `GET /api/estudios?fecha=2026-10-26`:

```json
{"ok":true,"item":{"fecha":"2026-10-26","cita":"Lc 13,18-21","titulo":"Estudio de prueba","contenidoMarkdown":"Texto sintético del estudio completo."}}
```

`resumen=0` equivale a la lectura completa. Otros valores o parámetros `resumen` repetidos devuelven 400. El parámetro `fecha` debe aparecer una sola vez y ser una fecha de calendario válida con formato YYYY-MM-DD. La selección es exacta: nunca se sustituye por el estudio de otro día.

| HTTP | Respuesta | Motivo |
|---|---|---|
| 200 | `{"ok":true,"item":{...}}` | Estudio disponible |
| 400 | `{"ok":false,"error":"invalid_date"}` | Fecha ausente, repetida o inválida |
| 400 | `{"ok":false,"error":"invalid_request"}` | Parámetro resumen inválido |
| 404 | `{"ok":false,"error":"not_found"}` | No hay estudio publicado para ese día, o es futuro |
| 503 | `{"ok":false,"error":"unavailable"}` | Servicio desactivado o fuente no utilizable |
| 405 | `{"ok":false,"error":"method_not_allowed"}` | Método distinto de GET/OPTIONS |

OPTIONS devuelve 204. Las respuestas usan `Cache-Control: no-store`. El servicio no devuelve la URL de origen, errores del proveedor, referencias internas ni registros descartados.

## Validación y límites

El lector admite CSV con comillas escapadas, comas y saltos de línea dentro de los campos; preserva el contenido de A carácter por carácter. No lo recorta, resume ni limpia como texto de Pistas. Se rechaza un estudio de más de 50.000 caracteres, en vez de devolverlo cortado.

Solo `sí` o `si` explícitos, sin distinguir mayúsculas y con espacios exteriores permitidos, autorizan publicación. Las fechas futuras no se sirven. Cabeceras o filas con columnas adicionales, fechas publicadas duplicadas, fechas imposibles, campos requeridos vacíos y CSV roto producen 503.

Como segunda barrera se rechazan rótulos de Parte B/taller, los identificadores de campos internos y los enlaces conocidos de originales en Drive/Docs. Las comprobaciones son estructurales: no pueden reconocer notas privadas sin rótulo ni determinar si una afirmación editorial está aprobada. Por eso la selección de lo que se copia al libro público sigue siendo responsabilidad del publicador. Los enlaces Drive/Docs se rechazan conservadoramente incluso si algún enlace fuese público; se devuelve 503 sin modificar el texto.

La lectura de la fuente tiene un tiempo de espera de diez segundos. Los fallos, documentos HTML de acceso y respuestas JSON de un proveedor se convierten en un error genérico. No existe respaldo local de los estudios ni se incorpora A a `/api/pistas`.

## Pruebas locales

Con Node 22 y las dependencias del proyecto instaladas:

```console
node --test tests/estudios.test.mjs
npm test
```

Las pruebas del servicio usan exclusivamente CSV sintético y respuestas de red simuladas. Cubren publicación, fecha de Madrid, resumen, fidelidad del texto, esquema, duplicados, Parte B, referencias internas, errores y compatibilidad del parser vigente de Pistas.

Para ensayos locales sin modificar código de producción, `createEstudiosHandler({readEnv, fetchImpl, now})` permite inyectar el origen, una respuesta CSV simulada y un reloj. `readEnv` recibe únicamente `PISTAS_ESTUDIOS_CSV_URL`; `now` es una función que devuelve un objeto Date. La exportación por defecto usa el entorno, la red y el reloj normales.

La comprobación visual en un navegador real, la lectura de una exportación pública real y la activación de la variable de entorno son pasos de validación posteriores; las pruebas locales no los sustituyen.
