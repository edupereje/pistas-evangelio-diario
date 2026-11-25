# Comprobar cada entrega antes y después de importar

El JSON del 23 de noviembre de 2026 contenía A íntegra, pero una fuente apuntaba a un ejemplar privado de Drive. El lector público rechaza esas referencias; al validar toda la exportación, ese enlace provocaba un 503 también para otros días.

El control se hace en la entrega, sin cambiar el contrato, las columnas, las Pistas aprobadas ni las protecciones del lector.

## Antes de entregar o importar

1. Usar una referencia pública al documento original. Los enlaces a ejemplares de la biblioteca privada y los ID de archivo se conservan en el original privado; `originalDriveId` sigue en su campo técnico.
2. Abrir cada enlace nuevo o sustituido sin autenticación y comprobar que es el documento citado. Un HTTP 200 puede ser una página de acceso o de verificación. En un PDF se comprueban el tipo de respuesta y su cabecera real, además de verificar título y autores al localizarlo.
3. Ejecutar la validación del paquete. Reutiliza directamente el contrato de `apps-script/Code.gs` y el lector `parseEstudiosCsv` de la app, también para A futuras o todavía no aprobadas. No recorta ni corrige silenciosamente los textos.

```sh
npm run validar:entrega -- /ruta/entrega.json
npm run validar:entrega -- /ruta/entrega.json --enlace https://editor.example/articulo.pdf
```

Para revisar todos los enlaces del estudio, en vez de solo los nuevos:

```sh
npm run validar:entrega -- /ruta/entrega.json --comprobar-enlaces
```

Un resultado sin `--enlace` ni `--comprobar-enlaces` acredita la estructura y la compatibilidad con el lector; no acredita que las páginas externas se hayan abierto. Un error no se resuelve desactivando el control ni sustituyendo A por un resumen. Corregir la referencia, conservar la versión del original utilizada y repetir la comprobación.

## Después de importar

Comprobar el resultado del importador y ejecutar:

```sh
npm run validar:entrega -- /ruta/entrega.json --app https://pistas-evangelio-diario.netlify.app
```

El verificador lee la API pública y compara fecha, cita, título y A completa carácter por carácter. Solo solicita los estudios aprobados cuya fecha ya ha llegado en Madrid. Los futuros permanecen privados: superar la validación previa no acredita todavía su publicación.

Abrir también el estudio afectado desde la interfaz de la app. Distinguir siempre JSON validado, original archivado, importación realizada y lectura pública comprobada. Ninguna de estas comprobaciones escribe, importa, publica ni cambia permisos.
