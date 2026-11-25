import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEntrega, checkPublicLink, verifyPublishedStudies } from '../scripts/validar-entrega.mjs';

const content = { fecha: '2026-11-23', titulo: 'Lunes, 23 de noviembre', celebracion: 'Feria', cita: 'Lc 21,1-4',
  evangelioTitulo: 'Ha echado más que todos', evangelio: 'Texto del Evangelio.', pistas: '    Texto aprobado.',
  estoyEmpezando: '', fraseDestacada: 'Texto aprobado.', imagenDiaUrl: '', audioUrl: '',
  notificacionTitulo: 'Ha echado más que todos', notificacionTexto: 'Invitación.', notasInternas: '' };
const study = { titulo: 'Estudio completo', contenidoMarkdown: '# Estudio\r\n\r\nTexto, con «citas».\n\n## Fuentes\nReferencia bibliográfica.',
  publicar: true, originalDriveId: 'ORIGINAL_PRIVADO_SINTETICO' };
const delivery = (changes = {}, contentChanges = {}) => ({ perfil: 'pistas-prod-1', dias: [
  { contenido: { ...content, ...contentChanges }, estudioBiblico: { ...study, ...changes } }
] });

test('preflight uses the importer contract and preserves complete A without altering the input', () => {
  const input = delivery();
  const before = JSON.stringify(input);
  const result = validateEntrega(input);
  assert.equal(result.dias, 1);
  assert.equal(result.estudios[0].contenidoMarkdown, study.contenidoMarkdown);
  assert.equal(JSON.stringify(input), before);
  assert.throws(() => validateEntrega(delivery({}, { campoNuevo: 'No admitido' })), /desconocido/);
  assert.equal(validateEntrega([content]).estudios.length, 0);
});

test('regression: a Drive citation is rejected before import, including future and draft A', () => {
  for (const publicar of [true, false]) for (const fecha of ['2026-11-23', '2099-12-01']) {
    const input = delivery({ publicar, contenidoMarkdown: study.contenidoMarkdown + '\nEjemplar: https://drive.google.com/file/d/REFERENCIA_PRIVADA/view' }, { fecha });
    assert.throws(() => validateEntrega(input), new RegExp(fecha + ': el estudio no cumple'));
  }
  assert.throws(() => validateEntrega(delivery({}, { cita: 'originalDriveId: referencia' })), /no cumple/);
  assert.throws(() => validateEntrega(delivery({ contenidoMarkdown: study.originalDriveId })), /no cumple/);
});

test('a public replacement citation passes and is available for targeted link checking', () => {
  const url = 'https://public.example.invalid/articulo.pdf';
  const result = validateEntrega(delivery({ contenidoMarkdown: study.contenidoMarkdown + '\nTexto completo: ' + url }));
  assert.deepEqual(result.enlaces, [url]);
});

test('HTTP 200 alone is insufficient: reject login, challenge, empty responses and fake PDFs', async () => {
  for (const [url, response] of [
    ['https://public.example.invalid/challenge?next=article', new Response('<title>Article</title>')],
    ['https://public.example.invalid/article', new Response('<title>Iniciar sesión</title>')],
    ['https://public.example.invalid/articulo.pdf', new Response('<html>Acceso</html>', { headers: { 'content-type': 'text/html' } })],
    ['https://public.example.invalid/article', new Response('')],
    ['https://public.example.invalid/article', new Response('Unavailable', { status: 503 })]
  ]) await assert.rejects(checkPublicLink(url, { fetchImpl: async () => response }));
});

test('verify the public PDF signature and reject redirects to internal or credentialed links', async () => {
  const url = 'https://public.example.invalid/articulo.pdf';
  const result = await checkPublicLink(url, { fetchImpl: async () => new Response('%PDF-1.7\nContenido de prueba.', { headers: { 'content-type': 'application/pdf' } }) });
  assert.equal(result.status, 200);
  for (const location of ['https://drive.google.com/file/d/PRIVATE/view', 'https://user:secret@public.example.invalid/doc']) {
    await assert.rejects(checkPublicLink(url, { fetchImpl: async () => new Response(null, { status: 302, headers: { location } }) }), /sin credenciales/);
  }
});

test('post-import verification compares the complete A exactly and does not request drafts or future dates', async () => {
  const input = delivery();
  input.dias.push(delivery({ publicar: false }, { fecha: '2026-11-24' }).dias[0]);
  input.dias.push(delivery({}, { fecha: '2026-11-26' }).dias[0]);
  const expected = { fecha: content.fecha, cita: content.cita, titulo: study.titulo, contenidoMarkdown: study.contenidoMarkdown };
  const calls = [];
  const fetchImpl = async url => { calls.push(url); return Response.json({ ok: true, item: expected }); };
  assert.equal(await verifyPublishedStudies(input, { baseUrl: 'https://app.example.invalid', today: '2026-11-25', fetchImpl }), 1);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).searchParams.get('fecha'), '2026-11-23');
  await assert.rejects(verifyPublishedStudies(input, { baseUrl: 'https://app.example.invalid', today: '2026-11-25',
    fetchImpl: async () => Response.json({ ok: true, item: { ...expected, contenidoMarkdown: expected.contenidoMarkdown.slice(0, -1) } }) }), /versión completa/);
});
