# Importador preparado para revisión

Este candidato conserva el menú y el cuadro de importación existentes. No instala ni habilita cambios en Apps Script al incorporarse al repositorio.

El array actual de 14 claves sigue siendo aceptado. Las correcciones actualizan por fecha; conservan B y los medios existentes cuando llegan vacíos. Las fechas nuevas mantienen B=`sí`. La frase de M sigue recibiendo `notificacionTitulo`.

La exégesis A completa se almacena en un libro editorial privado separado. Su `Estudios` tiene cinco columnas: `fecha`, `cita`, `titulo`, `contenidoMarkdown`, `publicar`. B y el original A+B siguen en Drive privado. El ID del original solo se escribe en Script Properties.

El maestro recibe únicamente una exportación de estudios aprobados (`publicar=sí`) cuya fecha ya ha llegado en `Europe/Madrid`. La publicación del estudio es independiente de B de `Contenido`. No se exportan borradores, futuros, talleres o referencias privadas conocidas.

## Configuración y permisos

La instalación y la autorización de Google son pasos humanos finales pendientes. Antes hay que respaldar el código, el manifiesto, las propiedades, los datos y los activadores existentes.

Propiedades del proyecto:

| Propiedad | Valor requerido |
| --- | --- |
| `PISTAS_PROD_ENABLED` | Ausente o `false` durante la preparación; `true` solo tras revisión final. |
| `PISTAS_ESTUDIOS_PRIVADOS_ID` | ID del libro editorial privado, distinto del maestro. No guardar este ID en el repositorio público. |
| `PISTAS_LAB_SHEET_ID` | Referencia opcional al laboratorio, que también se excluye como destino privado. |
| `PISTAS_PROD_TRIGGERS_ENABLED` | Ausente o `false` hasta autorizar por separado la creación del activador. |

`appsscript.json` es un manifiesto propuesto, no una copia del manifiesto real. Requiere `spreadsheets`, `script.container.ui`, `drive.readonly` y `script.scriptapp`.

`drive.readonly` es un permiso adicional de lectura de Drive para comprobar el acceso general del libro privado en cada operación. El alcance OAuth cubre archivos accesibles a la cuenta; el código consulta únicamente el ID configurado. No modifica permisos. `DriveApp.Access.PRIVATE` no sustituye la revisión de permisos individuales.

Se necesita una cuenta con edición en ambos libros. Una sesión abierta con otra cuenta no acredita esa capacidad. No se han concedido estos permisos ni instalado el candidato durante su preparación.

## Sincronización

`sincronizarEstudiosPublicados` recompone la exportación con el mismo `ScriptLock` que las importaciones. También funciona sin una interfaz abierta.

`prepararActivadorDiarioEstudios` no se llama automáticamente. Requiere la habilitación separada de activadores; crea como máximo uno para ese manejador y no elimina otros. Ventana aproximada: 00:15–00:45, Madrid. No se promete actualización exacta a medianoche ni se envía ninguna notificación push.

## Fallos y recuperación

Se valida todo antes de escribir. Después se limpia la exportación antigua antes de cambiar los estados privados. Si falla una escritura posterior, la exportación puede quedar temporalmente vacía. Así se evita conservar públicamente una A que se retira como borrador.

No hay transacción ni rollback entre libros y propiedades. Repetir el lote extendido tras corregir el error recupera datos y referencias sin duplicar fechas; ejecutar la sincronización recupera solo la exportación desde el estado privado actual.

Para detener el candidato, poner `PISTAS_PROD_ENABLED=false`. Si hay que revertir, restaurar el proyecto y los datos desde sus respaldos privados, revisando el activador manualmente. No reconstruir estudios privados a partir de la exportación pública.

El estado guarda fecha, fase y cantidad sin A ni IDs privados. No registrar lotes completos o Script Properties en incidencias públicas.

## Pruebas

`node tests/apps-script.test.mjs` usa únicamente datos sintéticos y servicios simulados; funciona con Node 22.

La comprobación adicional de una A real se activa mediante `PISTAS_TEST_EXEGESIS_PATH`, que apunta a un archivo privado externo. Ese archivo y su contenido no deben añadirse al repositorio.

Las pruebas cubren el recorrido local; faltan las autorizaciones, las llamadas reales a Google, el activador y la verificación pública tras un despliegue aprobado. La detección de rótulos de B no prueba que se haya excluido prosa de taller sin etiquetar: sigue siendo necesaria la separación editorial.

Referencias: [Drive File](https://developers.google.com/apps-script/reference/drive/file#getSharingAccess()), [activadores de tiempo](https://developers.google.com/apps-script/reference/script/clock-trigger-builder), [ScriptApp](https://developers.google.com/apps-script/reference/script/script-app), [interfaz](https://developers.google.com/apps-script/reference/base/ui).
