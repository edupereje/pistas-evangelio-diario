# Perfil preparado `pistas-prod-1`

Estado: propuesta para el candidato; todavía no sustituye `CONTRATO_JSON_PISTAS.txt` ni está habilitada en el importador real.

## Compatibilidad actual

Se conserva el array de objetos de 14 claves y valores de tipo cadena: `fecha`, `titulo`, `celebracion`, `cita`, `evangelioTitulo`, `evangelio`, `pistas`, `estoyEmpezando`, `fraseDestacada`, `imagenDiaUrl`, `audioUrl`, `notificacionTitulo`, `notificacionTexto`, `notasInternas`.

No se añade `publicar` ni `estudioBiblico` a esos objetos. Una clave desconocida se rechaza. El importador actual real continúa rigiéndose por el contrato vigente hasta una migración aprobada y probada.

## Lote extendido del candidato

El contenedor tiene exactamente dos claves: `perfil`, cadena con valor `pistas-prod-1`, y `dias`, array no vacío.

Cada elemento de `dias` contiene `contenido`, con el objeto completo de 14 claves anterior. Puede incluir dos propiedades adicionales:

- `estudioBiblico`: objeto con exactamente `titulo` (cadena no vacía), `contenidoMarkdown` (cadena no vacía), `publicar` (booleano) y `originalDriveId` (cadena con el ID del original privado).
- `vaciarMedios`: array opcional sin repetidos, limitado a `imagenDiaUrl` y `audioUrl`. Cada medio marcado debe tener cadena vacía en `contenido`.

No existe una clave para B o para el original A+B. El texto del estudio solo puede contener A completa, con catequesis, oración, síntesis y fuentes. Los rótulos de trabajo no se muestran al público. Los ID privados permanecen fuera de las hojas y los datos públicos.

## Actualización y publicación

`fecha` es un identificador ISO textual real. No se permiten fechas repetidas en el lote ni en las tablas existentes. Se actualiza por fecha y se añaden únicamente fechas nuevas.

B de `Contenido` se conserva en una actualización y queda `sí` al añadir una fecha. Omitir el estudio conserva la A, su estado y su referencia anterior. Si cambia la cita de una fecha que ya tiene estudio, debe adjuntarse la revisión explícita del estudio.

Un medio vacío conserva el anterior, salvo que esté declarado en `vaciarMedios`. El resto de las 14 cadenas reemplaza el campo correspondiente; se requiere un objeto completo.

`publicar=false` conserva la A en el libro privado y la retira de la exportación. `publicar=true` permite exportarla cuando su fecha sea menor o igual al día actual en Madrid, independientemente de B de `Contenido`. La A aprobada futura permanece únicamente en el libro privado hasta una sincronización en su fecha.

No se recorta texto. Se rechazan valores de más de 50.000 unidades UTF-16 por celda, valores no textuales en los campos de cadena, fórmulas de entrada, cabeceras inesperadas y filas afectadas con fórmulas. Se conserva Markdown y sus párrafos; no se aplica al estudio el aplanado de saltos del perfil diario.

Se rechazan rótulos de taller B en cualquier campo público o en la A. La revisión editorial sigue siendo necesaria para detectar prosa interna sin rótulo. `notasInternas` no es un almacén privado.

## Límite operativo

La validación previa no crea una transacción entre libros. Una incidencia de escritura puede dejar cambios parciales y la exportación temporalmente vacía. El resultado indica su fase sin afirmar rollback. El contrato operativo solo se actualizará después de comprobar la instalación real, compatibilidad y publicación en la app.
