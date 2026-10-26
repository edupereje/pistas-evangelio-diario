# Importador aplicado; app pendiente de despliegue

Estado comprobado el 27 de octubre de 2026: este mismo importador está aplicado y habilitado en el proyecto de producción. La cuenta de Eduardo completó una importación desde el cuadro existente con el perfil extendido; el resultado fue 0 días añadidos y 1 actualizado. La A del día 27 se conserva completa en el libro privado con `publicar=no`; la exportación pública de Estudios contiene solo la cabecera. Esto acredita la importación real, sin afirmar que la app esté ya desplegada ni que esa A esté publicada.

`Code.gs` coincide con el código aplicado: SHA-256 `8ab426a519f1267c92fea18c09b449794f44681ca62c8b3e9279d5fbc7de83ea`. Se conservan el menú y el cuadro de importación existentes. La rama de esta app excluye la reparación de notificaciones, que sigue separada. Incorporar los archivos al repositorio no reinstala el proyecto de Google.

El array actual de 14 claves sigue siendo aceptado. Las correcciones actualizan por fecha; conservan B y los medios existentes cuando llegan vacíos. Las fechas nuevas mantienen B=`sí`. La frase de M sigue recibiendo `notificacionTitulo`.

La exégesis A completa se almacena en un libro editorial privado separado. Su `Estudios` tiene cinco columnas: `fecha`, `cita`, `titulo`, `contenidoMarkdown`, `publicar`. B y el original A+B siguen en Drive privado. El ID del original solo se escribe en Script Properties.

El maestro recibe únicamente una exportación de estudios aprobados (`publicar=sí`) cuya fecha ya ha llegado en `Europe/Madrid`. La publicación del estudio es independiente de B de `Contenido`. No se exportan borradores, futuros, talleres o referencias privadas conocidas.

## Configuración y permisos

La configuración y habilitación necesarias para la importación real ya se completaron. Los respaldos y las referencias privadas permanecen fuera de este repositorio. Para cualquier reinstalación futura se deben comprobar primero el código, el manifiesto, las propiedades, los datos y los activadores existentes.

Propiedades del proyecto:

| Propiedad | Valor requerido |
| --- | --- |
| `PISTAS_PROD_ENABLED` | `true` en la instalación ya probada; ausente o `false` desactiva las escrituras. |
| `PISTAS_ESTUDIOS_PRIVADOS_ID` | ID del libro editorial privado, distinto del maestro. No guardar este ID en el repositorio público. |
| `PISTAS_LAB_SHEET_ID` | Referencia opcional al laboratorio, que también se excluye como destino privado. |
| `PISTAS_PROD_TRIGGERS_ENABLED` | Ausente o `false` hasta autorizar por separado la creación del activador. |

`appsscript.json` es un manifiesto propuesto, no una copia del manifiesto real. Requiere `spreadsheets`, `script.container.ui`, `drive.readonly` y `script.scriptapp`.

`drive.readonly` es un permiso adicional de lectura de Drive para comprobar el acceso general del libro privado en cada operación. El alcance OAuth cubre archivos accesibles a la cuenta; el código consulta únicamente el ID configurado. No modifica permisos. `DriveApp.Access.PRIVATE` no sustituye la revisión de permisos individuales.

Se necesita una cuenta con edición en ambos libros. La importación real se probó con la cuenta de Eduardo; una sesión abierta con otra cuenta no acredita esa capacidad. El manifiesto incluido describe los ámbitos del código, pero esta actualización de la rama no modifica permisos ni configuración en Google.

## Sincronización

`sincronizarEstudiosPublicados` recompone la exportación con el mismo `ScriptLock` que las importaciones. También funciona sin una interfaz abierta.

`prepararActivadorDiarioEstudios` no se llama automáticamente. Requiere la habilitación separada de activadores; crea como máximo uno para ese manejador y no elimina otros. Ventana aproximada: 00:15–00:45, Madrid. No se promete actualización exacta a medianoche ni se envía ninguna notificación push.

## Fallos y recuperación

Se valida todo antes de escribir. Después se limpia la exportación antigua antes de cambiar los estados privados. Si falla una escritura posterior, la exportación puede quedar temporalmente vacía. Así se evita conservar públicamente una A que se retira como borrador.

No hay transacción ni rollback entre libros y propiedades. Repetir el lote extendido tras corregir el error recupera datos y referencias sin duplicar fechas; ejecutar la sincronización recupera solo la exportación desde el estado privado actual.

Para detener el importador, poner `PISTAS_PROD_ENABLED=false`. Si hay que revertir, restaurar el proyecto y los datos desde sus respaldos privados, revisando el activador manualmente. No reconstruir estudios privados a partir de la exportación pública.

El estado guarda fecha, fase y cantidad sin A ni IDs privados. No registrar lotes completos o Script Properties en incidencias públicas.

## Pruebas

`node tests/apps-script.test.mjs` usa únicamente datos sintéticos y servicios simulados; funciona con Node 22.

La comprobación adicional de una A real se activa mediante `PISTAS_TEST_EXEGESIS_PATH`, que apunta a un archivo privado externo. Ese archivo y su contenido no deben añadirse al repositorio.

Las pruebas automáticas cubren el recorrido local y no acceden a Google. Por separado, la importación en producción desde la interfaz de Eduardo ya está probada. Siguen pendientes el despliegue de la app, la configuración de su fuente pública de estudios y la comprobación de lectura completa de una A aprobada desde la app. La publicación automática por fecha requiere comprobar su activador por separado; este cambio local no lo crea. La detección de rótulos de B no prueba que se haya excluido prosa de taller sin etiquetar: sigue siendo necesaria la separación editorial.

Referencias: [Drive File](https://developers.google.com/apps-script/reference/drive/file#getSharingAccess()), [activadores de tiempo](https://developers.google.com/apps-script/reference/script/clock-trigger-builder), [ScriptApp](https://developers.google.com/apps-script/reference/script/script-app), [interfaz](https://developers.google.com/apps-script/reference/base/ui).
