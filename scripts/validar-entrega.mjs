import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { ESTUDIOS_HEADERS, hasInternalReference, parseEstudiosCsv } from '../netlify/functions/_estudios.mjs';
import { madridDate } from '../netlify/functions/_content.mjs';

// Reuse the installed importer's contract and the app's reader, rather than
// maintaining a second interpretation of the delivery format or public A.
const importer = vm.createContext({});
vm.runInContext(await readFile(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), importer);
const csv = rows => rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');

function publicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || hasInternalReference(url.href)) {
    throw new Error('Se requiere un enlace HTTPS público, sin credenciales ni referencias internas.');
  }
  return url;
}

export function validateEntrega(input) {
  const days = importer.PistasProd_leerEntrada_(input);
  const studies = [];
  const links = new Set();
  const originals = days.flatMap(day => day.estudioBiblico ? [day.estudioBiblico.originalDriveId] : []);
  for (const day of days) {
    const { contenido: content, estudioBiblico: study } = day;
    if (!study) continue; // The legacy format intentionally preserves existing A.
    try {
      // Even future/draft A must be checked now, not first rejected on its date.
      const rows = [ESTUDIOS_HEADERS, [content.fecha, content.cita, study.titulo, study.contenidoMarkdown, 'sí']];
      const [parsed] = parseEstudiosCsv(csv(rows), { today: content.fecha });
      if (!parsed || parsed.contenidoMarkdown !== study.contenidoMarkdown) throw new Error('A no se conserva íntegra.');
      for (const text of [...Object.values(content), study.titulo, study.contenidoMarkdown]) {
        if (originals.some(id => text.includes(id))) throw new Error('Referencia privada dentro de un campo público.');
      }
      for (const match of study.contenidoMarkdown.matchAll(/https?:\/\/[^\s<>"\u201c\u201d]+/g)) {
        const value = match[0].replace(/[.,;!?]+$/, '').replace(/\)$/, m => match[0].includes('(') ? m : '');
        links.add(publicUrl(value).href);
      }
      studies.push({ ...parsed, publicar: study.publicar });
    } catch (_) {
      throw new Error(`${content.fecha}: el estudio no cumple las reglas del lector público. Revisa fuentes, referencias internas, rótulos de taller y límites; no recortes A.`);
    }
  }
  return { dias: days.length, estudios: studies, enlaces: [...links] };
}

export async function checkPublicLink(value, { fetchImpl = fetch } = {}) {
  let url = publicUrl(value);
  const signal = AbortSignal.timeout(15000);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetchImpl(url.href, { redirect: 'manual', signal, headers: { accept: 'application/pdf,text/html;q=0.9,*/*;q=0.5' } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Redirección sin destino verificable.');
      url = publicUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`El enlace responde HTTP ${response.status}.`);
    }
    const reader = response.body?.getReader();
    let prefix = new Uint8Array();
    try {
      while (reader && prefix.length < 16384) {
        const part = await reader.read();
        if (part.done) break;
        const merged = new Uint8Array(Math.min(16384, prefix.length + part.value.length));
        merged.set(prefix);
        merged.set(part.value.subarray(0, merged.length - prefix.length), prefix.length);
        prefix = merged;
      }
    } finally { await reader?.cancel(); }
    const text = new TextDecoder().decode(prefix);
    const type = response.headers.get('content-type') || '';
    const title = text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || '';
    if (/\/(?:challenge|login|signin)(?:[/?]|$)/i.test(url.pathname) ||
        /^(?:sign in|iniciar sesi[oó]n|just a moment|access denied|verify you|challenge)/i.test(title)) {
      throw new Error('El enlace conduce a acceso o verificación, no al documento público.');
    }
    if (/application\/pdf/i.test(type) || /\.pdf$/i.test(url.pathname)) {
      if (!text.startsWith('%PDF-')) throw new Error('La respuesta no es un PDF válido.');
    }
    if (!prefix.length) throw new Error('La respuesta está vacía.');
    return { url: url.href, status: response.status, type };
  }
  throw new Error('Demasiadas redirecciones para verificar el documento.');
}

export async function verifyPublishedStudies(input, { baseUrl, today = madridDate(), fetchImpl = fetch } = {}) {
  const result = validateEntrega(input);
  const base = publicUrl(baseUrl);
  let checked = 0;
  for (const study of result.estudios) {
    if (!study.publicar || study.fecha > today) continue;
    const url = new URL('/api/estudios', base);
    url.searchParams.set('fecha', study.fecha);
    const response = await fetchImpl(url.href, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${study.fecha}: la app responde HTTP ${response.status}.`);
    const body = await response.json();
    const expected = { fecha: study.fecha, cita: study.cita, titulo: study.titulo, contenidoMarkdown: study.contenidoMarkdown };
    if (!body.ok || !body.item || Object.keys(body.item).length !== 4 ||
        Object.keys(expected).some(key => body.item[key] !== expected[key])) {
      throw new Error(`${study.fecha}: la app no devuelve la versión completa esperada.`);
    }
    checked++;
  }
  return checked;
}

async function main(args) {
  const file = args.shift();
  if (!file || file.startsWith('--')) throw new Error('Uso: npm run validar:entrega -- archivo.json [--enlace URL | --comprobar-enlaces] [--app URL]');
  let app, allLinks = false;
  const selectedLinks = [];
  while (args.length) {
    const option = args.shift();
    if (option === '--comprobar-enlaces') allLinks = true;
    else if ((option === '--enlace' || option === '--app') && args[0] && !args[0].startsWith('--')) {
      const value = args.shift();
      if (option === '--enlace') selectedLinks.push(value); else app = value;
    } else throw new Error('Opción desconocida o sin valor.');
  }
  const input = JSON.parse(await readFile(file, 'utf8'));
  const result = validateEntrega(input);
  for (const link of selectedLinks) {
    if (!result.enlaces.includes(publicUrl(link).href)) throw new Error('El enlace seleccionado no aparece en el estudio del JSON.');
  }
  const links = [...new Set(allLinks ? [...result.enlaces, ...selectedLinks] : selectedLinks)];
  for (const link of links) await checkPublicLink(link);
  const published = app ? await verifyPublishedStudies(input, { baseUrl: app }) : null;
  console.log(JSON.stringify({ valido: true, dias: result.dias, estudiosIntegro: result.estudios.length,
    enlacesComprobados: links.length, estudiosVerificadosEnApp: published, escrituras: 0 }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
