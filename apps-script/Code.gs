function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('🚀 Importador Pistas')
      .addItem('Importar nuevo bloque de días', 'mostrarDialogoImportacion')
      .addToUi();
}

/**
 * Muestra la ventana flotante para pegar el texto de ChatGPT
 */
function mostrarDialogoImportacion() {
  const htmlContent = `
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 10px; background-color: #f9f9f9; }
        textarea { width: 100%; height: 280px; font-family: monospace; font-size: 11px; padding: 5px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
        button { background-color: #1a73e8; color: white; padding: 10px 15px; border: none; border-radius: 4px; cursor: pointer; float: right; font-weight: bold; margin-top: 10px;}
        button:hover { background-color: #1557b0; }
        p { font-size: 12px; color: #666; margin-top: 0; }
      </style>
    </head>
    <body>
      <p>Pega aquí el código JSON generado por ChatGPT:</p>
      <textarea id="jsonInput" placeholder="[{...}]"></textarea>
      <button onclick="procesarYEnviar()">Cargar en Contenido</button>

      <script>
        function procesarYEnviar() {
          var rawText = document.getElementById('jsonInput').value.trim();
          if(!rawText) { alert('El campo está vacío'); return; }
          
          // Limpieza rápida por si ChatGPT incluye los delimitadores de markdown
          if(rawText.startsWith('\`\`\`')) {
            rawText = rawText.replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/, '').trim();
          }

          document.querySelector('button').disabled = true;
          document.querySelector('button').innerText = 'Cargando...';

          google.script.run
            .withSuccessHandler(function(msg) {
              alert(msg);
              google.script.host.close();
            })
            .withFailureHandler(function(err) {
              alert('Error: ' + err.message);
              document.querySelector('button').disabled = false;
              document.querySelector('button').innerText = 'Cargar en Contenido';
            })
            .procesarJsonImportado(rawText);
        }
      </script>
    </body>
    </html>
  `;
  
  const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
      .setWidth(550)
      .setHeight(420);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Importación Directa');
}


/** CANDIDATO PREPARADO. Desactivado hasta configurar y autorizar expresamente. */
function procesarJsonImportado(jsonText) {
  return PistasProd_operar_('importar', jsonText);
}

/** Ejecución manual o mediante el activador diario del mismo proyecto. */
function sincronizarEstudiosPublicados() {
  return PistasProd_operar_('sincronizar', null);
}

function PistasProd_fallo_(mensaje) {
  const error = new Error(mensaje);
  error.pistasSeguro = true;
  throw error;
}

function PistasProd_contexto_(exigirLibroActivo) {
  const masterId = '1215FbbLsqQU0PMgVjwl5m064tADoTlFvLjA3CVhTk_E';
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('PISTAS_PROD_ENABLED') !== 'true') {
    PistasProd_fallo_('Importador de producción desactivado. Falta habilitación explícita.');
  }
  const privateId = props.getProperty('PISTAS_ESTUDIOS_PRIVADOS_ID');
  const labId = props.getProperty('PISTAS_LAB_SHEET_ID');
  if (typeof privateId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(privateId) || privateId === masterId ||
      (labId && privateId === labId)) {
    PistasProd_fallo_('Configura un libro editorial privado distinto del maestro y del laboratorio.');
  }
  const activo = exigirLibroActivo ? SpreadsheetApp.getActiveSpreadsheet() : null;
  if (exigirLibroActivo && (!activo || activo.getId() !== masterId)) {
    PistasProd_fallo_('La importación solo está permitida desde el Sheet maestro identificado.');
  }
  // Live check on every operation, without changing any sharing permissions.
  if (DriveApp.getFileById(privateId).getSharingAccess() !== DriveApp.Access.PRIVATE) {
    PistasProd_fallo_('El libro editorial tiene acceso general. Detenido antes de escribir.');
  }
  const master = activo || SpreadsheetApp.openById(masterId);
  const privado = SpreadsheetApp.openById(privateId);
  if (master.getId() !== masterId || privado.getId() !== privateId) {
    PistasProd_fallo_('Los libros abiertos no corresponden a la configuración esperada.');
  }
  const hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
  PistasProd_fecha_(hoy, 'Fecha actual de Madrid');
  return { master: master, privado: privado, props: props, privateId: privateId, hoy: hoy };
}

function PistasProd_validarEstudios_(estado) {
  if (estado.hoja && estado.hoja.getLastColumn() > 5) {
    PistasProd_fallo_('La pestaña Estudios tiene columnas adicionales con contenido; revisión necesaria.');
  }
  estado.filas.forEach(function(fila, i) {
    if (fila.every(function(v) { return v === ''; })) return;
    const fecha = Object.prototype.toString.call(fila[0]) === '[object Date]' ?
      Utilities.formatDate(fila[0], 'Europe/Madrid', 'yyyy-MM-dd') : fila[0];
    PistasProd_fecha_(fecha, 'Estudios fila ' + (i + 2));
    ['cita', 'titulo', 'contenidoMarkdown'].forEach(function(k, j) {
      PistasProd_texto_(fila[j + 1], 'Estudios fila ' + (i + 2) + '/' + k, true);
    });
    if (fila[4] !== 'sí' && fila[4] !== 'no') {
      PistasProd_fallo_('La publicación de Estudios debe ser texto sí o no.');
    }
    if (PistasProd_tieneTaller_(fila[3])) PistasProd_fallo_('Se detecta un taller B en Estudios; no se exporta.');
    if ((estado.formulas[i] || []).some(function(f) { return f !== ''; })) {
      PistasProd_fallo_('Estudios contiene fórmulas; no se exportan resultados calculados.');
    }
  });
}

function PistasProd_candidatos_(estado, escrituras) {
  const porFila = {};
  estado.filas.forEach(function(fila, i) { porFila[i + 2] = fila.slice(); });
  escrituras.forEach(function(w) { porFila[w.fila] = w.valores.slice(); });
  return Object.keys(porFila).map(function(k) { return porFila[k]; }).filter(function(fila) {
    return !fila.every(function(v) { return v === ''; });
  });
}

function PistasProd_referenciasPrivadas_(ctx, originales) {
  const referencias = [ctx.privateId];
  const todas = ctx.props.getProperties();
  Object.keys(todas).forEach(function(k) {
    if (k.indexOf('PISTAS_PROD_ORIGINAL_') === 0 && todas[k]) referencias.push(todas[k]);
  });
  Object.keys(originales).forEach(function(k) { referencias.push(originales[k]); });
  return referencias;
}

function PistasProd_sinReferenciasPrivadas_(filas, referencias) {
  filas.forEach(function(fila) {
    fila.forEach(function(valor) {
      if (typeof valor === 'string' && referencias.some(function(id) { return valor.indexOf(id) >= 0; })) {
        PistasProd_fallo_('Un texto contiene una referencia privada reservada a configuración; no se ha escrito.');
      }
    });
  });
}

function PistasProd_exportacion_(filas, hoy) {
  const fechas = {};
  const publicables = [];
  filas.forEach(function(fila) {
    const copia = fila.slice();
    if (Object.prototype.toString.call(copia[0]) === '[object Date]') copia[0] = Utilities.formatDate(copia[0], 'Europe/Madrid', 'yyyy-MM-dd');
    PistasProd_fecha_(copia[0], 'Exportación de estudio');
    if (fechas[copia[0]]) PistasProd_fallo_('Hay fechas duplicadas en los estudios privados.');
    fechas[copia[0]] = true;
    for (let j = 1; j < 4; j++) PistasProd_texto_(copia[j], 'Exportación de estudio/campo ' + j, true);
    if (copia[4] !== 'sí' && copia[4] !== 'no') PistasProd_fallo_('Publicación de estudio no válida.');
    if (PistasProd_tieneTaller_(copia[3])) PistasProd_fallo_('Se detecta un taller B en los estudios privados.');
    if (copia[4] === 'sí' && copia[0] <= hoy) publicables.push(copia);
  });
  return publicables.sort(function(a, b) { return a[0].localeCompare(b[0]); });
}

function PistasProd_prepararHoja_(ss, estado, filasNecesarias) {
  let hoja = estado.hoja;
  if (!hoja) hoja = ss.insertSheet('Estudios');
  if (hoja.getMaxRows() < filasNecesarias) hoja.insertRowsAfter(hoja.getMaxRows(), filasNecesarias - hoja.getMaxRows());
  if (!estado.conCabecera) {
    hoja.getRange(1, 1, 1, 5).setNumberFormat('@').setValues([PistasProd_CABECERAS_ESTUDIO_()]);
  }
  return hoja;
}

function PistasProd_estado_(ctx, estado, fase, cantidad) {
  ctx.props.setProperties({ PISTAS_PROD_ESTADO: JSON.stringify({ fechaMadrid: ctx.hoy,
    estado: estado, fase: fase, estudiosPublicados: cantidad }) }, false);
}

function PistasProd_operar_(accion, jsonText) {
  // ScriptLock serializes imports and the time-driven sync across both books.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let ctx = null, fase = 'validación; sin escrituras';
  try {
    ctx = PistasProd_contexto_(accion === 'importar');
    let dias = [];
    if (accion === 'importar') {
      let entrada;
      try { entrada = JSON.parse(jsonText); } catch (error) { PistasProd_fallo_('JSON no válido. No se ha escrito.'); }
      dias = PistasProd_leerEntrada_(entrada);
    }
    const contenido = PistasProd_leerHoja_(ctx.master, 'Contenido', PistasProd_CABECERAS_(), false);
    const estudios = PistasProd_leerHoja_(ctx.privado, 'Estudios', PistasProd_CABECERAS_ESTUDIO_(), true);
    const publico = PistasProd_leerHoja_(ctx.master, 'Estudios', PistasProd_CABECERAS_ESTUDIO_(), true);
    PistasProd_validarEstudios_(estudios);
    PistasProd_validarEstudios_(publico);
    const plan = PistasProd_planificar_(dias, contenido, estudios);
    PistasProd_comprobarCapacidad_(contenido, plan.contenido);
    PistasProd_comprobarCapacidad_(estudios, plan.estudios);
    PistasProd_comprobarFormulas_(contenido, plan.contenido);
    PistasProd_comprobarFormulas_(estudios, plan.estudios);
    const exportacion = PistasProd_exportacion_(PistasProd_candidatos_(estudios, plan.estudios), ctx.hoy);
    PistasProd_comprobarCapacidad_(publico, exportacion.map(function(fila, i) { return { fila: i + 2 }; }));
    const referencias = PistasProd_referenciasPrivadas_(ctx, plan.originales);
    PistasProd_sinReferenciasPrivadas_(plan.contenido.map(function(w) { return w.valores; }), referencias);
    PistasProd_sinReferenciasPrivadas_(plan.estudios.map(function(w) { return w.valores; }), referencias);
    PistasProd_sinReferenciasPrivadas_(exportacion, referencias);
    // All plans, types, headers, formulas and public data have been validated above.
    // Fail closed: remove the old export before any private publication flag changes.
    fase = 'retirada de la exportación pública; puede quedar temporalmente vacía';
    const hojaPublica = PistasProd_prepararHoja_(ctx.master, publico, Math.max(1, exportacion.length + 1));
    if (publico.ultima > 1) hojaPublica.getRange(2, 1, publico.ultima - 1, 5).clearContent();
    if (plan.contenido.length) {
      fase = 'escritura de Contenido; exportación pública temporalmente vacía';
      PistasProd_escribirFilas_(contenido.hoja, plan.contenido, 15);
    }
    if (plan.estudios.length) {
      fase = 'escritura de estudios privados; exportación pública temporalmente vacía';
      const ultimaPrivada = Math.max.apply(null, plan.estudios.map(function(w) { return w.fila; }));
      const hojaPrivada = PistasProd_prepararHoja_(ctx.privado, estudios, ultimaPrivada);
      PistasProd_escribirFilas_(hojaPrivada, plan.estudios, 5);
    }
    if (Object.keys(plan.originales).length) {
      fase = 'referencias privadas; exportación pública temporalmente vacía';
      ctx.props.setProperties(plan.originales, false);
    }
    fase = 'escritura de la exportación pública aprobada';
    if (exportacion.length) PistasProd_escribirFilas_(hojaPublica, exportacion.map(function(fila, i) {
      return { fila: i + 2, valores: fila };
    }), 5);
    fase = 'registro del resultado';
    PistasProd_estado_(ctx, 'correcto', 'completado', exportacion.length);
    ctx.props.setProperties({ PISTAS_PROD_ULTIMA_EXPORTACION: ctx.hoy }, false);
    return (accion === 'importar' ? plan.nuevos + ' días añadidos, ' + plan.actualizados + ' actualizados; ' : '') +
      exportacion.length + ' estudios aprobados exportados hasta ' + ctx.hoy + ' (Madrid).';
  } catch (error) {
    if (ctx && fase !== 'validación; sin escrituras') {
      try { PistasProd_estado_(ctx, 'error', fase, null); } catch (estadoError) { /* No datos ni mensajes privados en registros. */ }
    }
    const detalle = error && error.pistasSeguro ? error.message : 'Error del servicio de Google; los detalles privados no se incluyen.';
    PistasProd_fallo_('Operación detenida (' + fase + '). ' + detalle + ' No se garantiza reversión entre libros.');
  } finally {
    lock.releaseLock();
  }
}

/** Preparado para una ejecución humana final; no se llama al importar. */
function prepararActivadorDiarioEstudios() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ctx = PistasProd_contexto_(false);
    if (ctx.props.getProperty('PISTAS_PROD_TRIGGERS_ENABLED') !== 'true') {
      PistasProd_fallo_('Creación de activador desactivada. Requiere autorización y habilitación separadas.');
    }
    const existentes = ScriptApp.getProjectTriggers().filter(function(t) {
      return t.getHandlerFunction() === 'sincronizarEstudiosPublicados';
    });
    if (existentes.length > 1) PistasProd_fallo_('Hay varios activadores de estudios; revisar manualmente antes de crear otro.');
    if (existentes.length === 1) return 'Ya existe un activador para sincronizar estudios; no se ha duplicado.';
    ScriptApp.newTrigger('sincronizarEstudiosPublicados').timeBased().atHour(0).nearMinute(30)
      .everyDays(1).inTimezone('Europe/Madrid').create();
    return 'Activador diario creado para la ventana aproximada 00:15–00:45, Europe/Madrid. No se ha enviado ninguna notificación.';
  } catch (error) {
    PistasProd_fallo_(error && error.pistasSeguro ? error.message : 'No se pudo preparar el activador; no se incluyen detalles privados del servicio.');
  } finally {
    lock.releaseLock();
  }
}

function PistasProd_CLAVES_() {
  return ['fecha', 'titulo', 'celebracion', 'cita', 'evangelioTitulo', 'evangelio',
    'pistas', 'estoyEmpezando', 'fraseDestacada', 'imagenDiaUrl', 'audioUrl',
    'notificacionTitulo', 'notificacionTexto', 'notasInternas'];
}
function PistasProd_CABECERAS_() {
  const claves = PistasProd_CLAVES_();
  return [claves[0], 'publicar'].concat(claves.slice(1));
}
function PistasProd_CABECERAS_ESTUDIO_() {
  return ['fecha', 'cita', 'titulo', 'contenidoMarkdown', 'publicar'];
}
function PistasProd_objeto_(valor, contexto) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    PistasProd_fallo_(contexto + ': se esperaba un objeto.');
  }
}
function PistasProd_claves_(objeto, obligatorias, opcionales, contexto) {
  PistasProd_objeto_(objeto, contexto);
  obligatorias.forEach(function(k) {
    if (!Object.prototype.hasOwnProperty.call(objeto, k)) PistasProd_fallo_(contexto + ': falta ' + k + '.');
  });
  Object.keys(objeto).forEach(function(k) {
    if (obligatorias.indexOf(k) < 0 && opcionales.indexOf(k) < 0) {
      PistasProd_fallo_(contexto + ': campo desconocido ' + k + '.');
    }
  });
}
function PistasProd_texto_(valor, contexto, obligatorio) {
  if (typeof valor !== 'string') PistasProd_fallo_(contexto + ': debe ser texto.');
  if (/^\s*=/.test(valor)) PistasProd_fallo_(contexto + ': parece una fórmula; se requiere texto literal sin modificarlo automáticamente.');
  if (valor.length > 50000) PistasProd_fallo_(contexto + ': supera 50.000 unidades de texto; no se ha truncado.');
  if (obligatorio && !valor.trim()) PistasProd_fallo_(contexto + ': no puede estar vacío.');
}
function PistasProd_fecha_(valor, contexto) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    PistasProd_fallo_(contexto + ': fecha ISO YYYY-MM-DD requerida.');
  }
  const partes = valor.split('-').map(Number), y = partes[0], m = partes[1], d = partes[2];
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) {
    PistasProd_fallo_(contexto + ': fecha de calendario inexistente.');
  }
  return valor;
}
function PistasProd_tieneTaller_(texto) {
  return texto.split(/\r?\n/).some(function(linea) {
    const rotulo = linea.trim().replace(/^(?:(?:#{1,6}|>|[-+])[ \t]*)+/, '')
      .replace(/[*_`]/g, '').trim();
    return /^(?:PARTE[ \t]+B\b|B[.)—–:-][ \t]*|TALLER(?:[ \t]+EXCLUSIVO)?[ \t]+PARA[ \t]+PISTAS)/i.test(rotulo);
  });
}
function PistasProd_leerEntrada_(entrada) {
  let dias, esLab = false;
  if (Array.isArray(entrada)) {
    dias = entrada.map(function(contenido) { return { contenido: contenido }; });
  } else {
    esLab = true;
    PistasProd_claves_(entrada, ['perfil', 'dias'], [], 'Lote');
    if (entrada.perfil !== 'pistas-prod-1') PistasProd_fallo_('Perfil de importación desconocido.');
    if (!Array.isArray(entrada.dias)) PistasProd_fallo_('dias debe ser un array.');
    dias = entrada.dias;
  }
  if (!dias.length) PistasProd_fallo_('El lote está vacío.');
  const vistas = {};
  dias.forEach(function(dia, i) {
    const contexto = 'Día ' + (i + 1);
    PistasProd_claves_(dia, ['contenido'], esLab ? ['estudioBiblico', 'vaciarMedios'] : [], contexto);
    PistasProd_claves_(dia.contenido, PistasProd_CLAVES_(), [], contexto + '/contenido');
    PistasProd_CLAVES_().forEach(function(k) { PistasProd_texto_(dia.contenido[k], contexto + '/' + k, false); });
    const fecha = PistasProd_fecha_(dia.contenido.fecha, contexto);
    if (vistas[fecha]) PistasProd_fallo_('Fecha duplicada en el lote: ' + fecha + '.');
    vistas[fecha] = true;
    ['titulo', 'cita', 'evangelioTitulo', 'evangelio', 'pistas', 'notificacionTitulo'].forEach(function(k) {
      PistasProd_texto_(dia.contenido[k], contexto + '/' + k, true);
    });
    PistasProd_CLAVES_().forEach(function(k) {
      if (PistasProd_tieneTaller_(dia.contenido[k])) PistasProd_fallo_(contexto + ': el taller B no debe ir en ' + k + ' ni en datos públicos.');
    });
    const vaciar = Object.prototype.hasOwnProperty.call(dia, 'vaciarMedios') ? dia.vaciarMedios : [];
    if (!Array.isArray(vaciar) || vaciar.some(function(k) { return ['imagenDiaUrl', 'audioUrl'].indexOf(k) < 0; }) ||
        new Set(vaciar).size !== vaciar.length) {
      PistasProd_fallo_(contexto + ': vaciarMedios solo admite imagenDiaUrl y audioUrl, sin repetir.');
    }
    vaciar.forEach(function(k) {
      if (dia.contenido[k] !== '') PistasProd_fallo_(contexto + ': vaciar ' + k + ' exige su valor vacío.');
    });
    if (Object.prototype.hasOwnProperty.call(dia, 'estudioBiblico')) {
      const estudio = dia.estudioBiblico;
      PistasProd_claves_(estudio, ['titulo', 'contenidoMarkdown', 'publicar', 'originalDriveId'], [], contexto + '/estudio');
      ['titulo', 'contenidoMarkdown', 'originalDriveId'].forEach(function(k) {
        PistasProd_texto_(estudio[k], contexto + '/estudio/' + k, true);
      });
      if (typeof estudio.publicar !== 'boolean') PistasProd_fallo_(contexto + ': publicar del estudio debe ser booleano.');
      if (!/^[A-Za-z0-9_-]{10,200}$/.test(estudio.originalDriveId)) PistasProd_fallo_(contexto + ': ID de original Drive no válido.');
      if (PistasProd_tieneTaller_(estudio.contenidoMarkdown)) PistasProd_fallo_(contexto + ': se detecta B/taller en el estudio publicable.');
    }
  });
  return dias;
}
function PistasProd_leerHoja_(ss, nombre, cabeceras, opcional) {
  const hoja = ss.getSheetByName(nombre);
  const estado = { hoja: hoja, filas: [], formulas: [], porFecha: {}, ultima: 1, conCabecera: false };
  if (!hoja) {
    if (!opcional) PistasProd_fallo_('No se encontró la pestaña ' + nombre + '.');
    return estado;
  }
  const ultima = hoja.getLastRow();
  if (hoja.getMaxColumns() < cabeceras.length) PistasProd_fallo_('Cabecera incompleta de ' + nombre + '.');
  if (!ultima && opcional) return estado;
  if (!ultima) PistasProd_fallo_('Cabecera incompleta de ' + nombre + '.');
  const rangoCabecera = hoja.getRange(1, 1, 1, cabeceras.length);
  const real = rangoCabecera.getValues()[0];
  if (rangoCabecera.getFormulas()[0].some(function(f) { return f !== ''; })) PistasProd_fallo_('La cabecera de ' + nombre + ' contiene fórmulas.');
  if (real.some(function(k, i) { return k !== cabeceras[i]; })) PistasProd_fallo_('Cabecera inesperada de ' + nombre + '.');
  estado.ultima = ultima;
  estado.conCabecera = true;
  estado.filas = ultima > 1 ? hoja.getRange(2, 1, ultima - 1, cabeceras.length).getValues() : [];
  estado.formulas = ultima > 1 ? hoja.getRange(2, 1, ultima - 1, cabeceras.length).getFormulas() : [];
  estado.filas.forEach(function(fila, i) {
    if (fila.every(function(v) { return v === ''; })) return;
    let fecha = fila[0];
    if (Object.prototype.toString.call(fecha) === '[object Date]') {
      fecha = Utilities.formatDate(fecha, 'Europe/Madrid', 'yyyy-MM-dd');
    }
    PistasProd_fecha_(fecha, nombre + ' fila ' + (i + 2));
    if (estado.porFecha[fecha]) PistasProd_fallo_('Fecha duplicada existente en ' + nombre + ': ' + fecha + '.');
    estado.porFecha[fecha] = { fila: i + 2, valores: fila };
  });
  return estado;
}
function PistasProd_planificar_(dias, contenido, estudios) {
  const plan = { contenido: [], estudios: [], originales: {}, nuevos: 0, actualizados: 0 };
  let siguienteContenido = contenido.ultima + 1, siguienteEstudio = estudios.ultima + 1;
  dias.forEach(function(dia) {
    const item = dia.contenido, previa = contenido.porFecha[item.fecha], estudioPrevio = estudios.porFecha[item.fecha];
    if (!dia.estudioBiblico && estudioPrevio && estudioPrevio.valores[1] !== item.cita) {
      PistasProd_fallo_(item.fecha + ': cambia la cita de un estudio existente; adjunta su revisión explícita.');
    }
    const fila = [item.fecha, previa ? previa.valores[1] : 'sí'].concat(PistasProd_CLAVES_().slice(1).map(function(k) { return item[k]; }));
    [['imagenDiaUrl', 10], ['audioUrl', 11]].forEach(function(par) {
      if (previa && item[par[0]] === '' && (dia.vaciarMedios || []).indexOf(par[0]) < 0) fila[par[1]] = previa.valores[par[1]];
    });
    plan.contenido.push({ fila: previa ? previa.fila : siguienteContenido++, valores: fila });
    if (previa) plan.actualizados++; else plan.nuevos++;
    if (dia.estudioBiblico) {
      const e = dia.estudioBiblico;
      plan.estudios.push({ fila: estudioPrevio ? estudioPrevio.fila : siguienteEstudio++, valores: [item.fecha, item.cita, e.titulo, e.contenidoMarkdown, e.publicar ? 'sí' : 'no'] });
      plan.originales['PISTAS_PROD_ORIGINAL_' + item.fecha] = e.originalDriveId;
    }
  });
  return plan;
}
function PistasProd_comprobarCapacidad_(estado, escrituras) {
  if (estado.hoja && escrituras.some(function(w) { return w.fila > estado.hoja.getMaxRows(); })) {
    PistasProd_fallo_('Amplía las filas disponibles del libro correspondiente antes de importar.');
  }
}
function PistasProd_comprobarFormulas_(estado, escrituras) {
  escrituras.forEach(function(w) {
    const formulas = estado.formulas[w.fila - 2] || [];
    if (formulas.some(function(formula) { return formula !== ''; })) {
      PistasProd_fallo_('La fila ' + w.fila + ' contiene fórmulas; el importador no las reemplaza por sus valores.');
    }
  });
}
function PistasProd_escribirFilas_(hoja, escrituras, columnas) {
  const ordenadas = escrituras.slice().sort(function(a, b) { return a.fila - b.fila; });
  let grupo = [];
  function escribir() {
    if (!grupo.length) return;
    const destino = hoja.getRange(grupo[0].fila, 1, grupo.length, columnas);
    destino.setNumberFormat('@');
    destino.setValues(grupo.map(function(w) { return w.valores; }));
    grupo = [];
  }
  ordenadas.forEach(function(w) {
    if (grupo.length && w.fila !== grupo[grupo.length - 1].fila + 1) escribir();
    grupo.push(w);
  });
  escribir();
}
