import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replace(/init\(\);\s*$/, '');
function browser({ active = true, fetcher = async () => ({ ok: true }), subscription = { endpoint: 'https://push.example.invalid/device' } } = {}) {
  const data = new Map([['pistasNotificationState', JSON.stringify({ active, time: '08:00', permission: 'granted' })], ['pistasPrayerTime', '08:00']]);
  const calls = [];
  const alerts = [];
  const manager = { getSubscription: async () => subscription, subscribe: async () => { calls.push('new-subscription'); return subscription; } };
  const context = vm.createContext({
    window: { addEventListener() {}, Notification: {}, PushManager: {}, navigator: { standalone: true }, matchMedia: () => ({ matches: true }) },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: manager }) } },
    localStorage: { getItem: (key) => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) },
    document: { querySelector: () => null },
    Notification: { permission: 'granted', requestPermission: async () => 'granted' },
    alert: (text) => alerts.push(text), console: { error() {}, warn() {} },
    fetch: async (url, options) => { calls.push({ url, options }); return fetcher(url, options); },
    Uint8Array, atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    URLSearchParams, location: { origin: 'https://example.invalid', search: '' }
  });
  vm.runInContext(`${source}\nrender = () => {};`, context);
  return { context, data, calls, alerts, manager, state: () => JSON.parse(data.get('pistasNotificationState')) };
}

test('active hour change persists same subscription before changing local state', async () => {
  let release;
  const saved = new Promise((resolve) => { release = resolve; });
  const b = browser({ fetcher: () => saved });
  const updating = b.context.chooseTime('09:30');
  await new Promise(setImmediate);
  assert.equal(b.state().time, '08:00');
  assert.equal(b.data.get('pistasPrayerTime'), '08:00');
  release({ ok: true });
  await updating;
  assert.equal(b.state().time, '09:30');
  assert.equal(JSON.parse(b.calls[0].options.body).time, '09:30');
  assert.equal(b.calls.some((x) => x === 'new-subscription'), false);
});

test('failed hour save retains prior preference and reports failure', async () => {
  const b = browser({ fetcher: async () => ({ ok: false, json: async () => ({}) }) });
  await b.context.chooseTime('09:30');
  assert.equal(b.state().time, '08:00');
  assert.equal(b.data.get('pistasPrayerTime'), '08:00');
  assert.match(b.alerts[0], /mantiene la anterior/);
});

test('rapid hour choices save in order; inactive choices stay local and invalid input ignored', async () => {
  const b = browser();
  await Promise.all([b.context.chooseTime('09:00'), b.context.chooseTime('10:00')]);
  assert.deepEqual(b.calls.map((x) => JSON.parse(x.options.body).time), ['09:00', '10:00']);
  assert.equal(b.state().time, '10:00');
  const inactive = browser({ active: false });
  await inactive.context.chooseTime('11:00');
  await inactive.context.chooseTime('25:00');
  assert.equal(inactive.calls.length, 0);
  assert.equal(inactive.data.get('pistasPrayerTime'), '11:00');
});

test('activation reuses existing subscription instead of deleting/recreating daily state', async () => {
  const b = browser();
  const existing = await b.context.getOrCreateSubscription('AQID');
  assert.equal(existing.endpoint, 'https://push.example.invalid/device');
  assert.equal(b.calls.length, 0);
  const mismatch = browser({ subscription: { endpoint: 'https://push.example.invalid/device', options: { applicationServerKey: new Uint8Array([9, 9]).buffer } } });
  await assert.rejects(mismatch.context.getOrCreateSubscription('AQID'), /otra configuración/);
  assert.equal(mismatch.calls.length, 0);
});

test('provider 403 test failure does not remove or silently recreate subscription', async () => {
  const b = browser({ fetcher: async () => ({ ok: false, json: async () => ({ error: 'HTTP 403' }) }) });
  await b.context.sendLocalTestNotification();
  assert.deepEqual(b.calls.map((x) => x.url), ['/api/test-notification']);
  assert.equal(b.state().active, true);
  assert.match(b.alerts[0], /No se pudo enviar/);
});

test('deactivation waits pending hour save then removes server subscription', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let unsubscribed = false;
  const b = browser({ subscription: { endpoint: 'https://push.example.invalid/device', unsubscribe: async () => { unsubscribed = true; } }, fetcher: (url) => url === '/api/subscribe' ? pending : Promise.resolve({ ok: true }) });
  const update = b.context.chooseTime('09:00');
  await new Promise(setImmediate);
  const stop = b.context.deactivateNotifications();
  release({ ok: true });
  await Promise.all([update, stop]);
  assert.deepEqual(b.calls.map((x) => x.url), ['/api/subscribe', '/api/unsubscribe']);
  assert.equal(b.state().active, false);
  assert.equal(unsubscribed, true);
});

test('UI accepts 23:45, rejects later hours and explains the supported window', async () => {
  const b = browser();
  await b.context.chooseTime('23:45');
  await b.context.chooseTime('23:46');
  await b.context.chooseTime('23:59');
  assert.equal(b.calls.length, 1);
  assert.equal(b.state().time, '23:45');
  assert.equal(b.context.validPrayerTime('23:45'), true);
  assert.equal(b.context.validPrayerTime('23:46'), false);
  assert.match(b.alerts[0], /00:00.*23:45.*15 minutos/);
  assert.match(source, /id="timeInput"[^>]*max="23:45"/);
});

test('confirmed remote deactivation remains inactive if browser cleanup rejects, without Notification API', async () => {
  const b = browser({ subscription: { endpoint: 'https://push.example.invalid/device', unsubscribe: async () => { throw new Error('local cleanup'); } } });
  delete b.context.Notification;
  await b.context.deactivateNotifications();
  assert.equal(b.state().active, false);
  assert.equal(b.state().permission, 'default');
  assert.deepEqual(b.calls.map((x) => x.url), ['/api/unsubscribe']);
  assert.match(b.alerts[0], /se ha desactivado/);
});

test('failed remote deactivation restores previous state and does not remove browser subscription', async () => {
  let cleanupCalled = false;
  const b = browser({ fetcher: async () => ({ ok: false }), subscription: { endpoint: 'https://push.example.invalid/device', unsubscribe: async () => { cleanupCalled = true; } } });
  await b.context.deactivateNotifications();
  assert.equal(b.state().active, true);
  assert.equal(b.state().time, '08:00');
  assert.equal(cleanupCalled, false);
  assert.match(b.alerts[0], /No se pudo desactivar/);
});

test('activation after a pending preset keeps the newly saved hour instead of the old input', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let subscriptions = 0;
  const b = browser({ fetcher: async (url) => {
    if (url.startsWith('/api/config')) return { ok: true, json: async () => ({ publicKey: 'AQID' }) };
    if (url === '/api/subscribe' && ++subscriptions === 1) return pending;
    return { ok: true };
  } });
  b.context.document.querySelector = () => ({ value: b.data.get('pistasPrayerTime') });
  const update = b.context.chooseTime('09:00');
  await new Promise(setImmediate);
  const activate = b.context.activateNotifications();
  await new Promise(setImmediate);
  release({ ok: true });
  await Promise.all([update, activate]);
  const hours = b.calls.filter((call) => call.url === '/api/subscribe').map((call) => JSON.parse(call.options.body).time);
  assert.deepEqual(hours, ['09:00', '09:00']);
  assert.equal(b.state().time, '09:00');
});

test('a later choice queues after activation instead of overtaking its saved hour', async () => {
  let releaseConfig;
  const pendingConfig = new Promise((resolve) => { releaseConfig = resolve; });
  const b = browser({ fetcher: (url) => url.startsWith('/api/config') ? pendingConfig : Promise.resolve({ ok: true }) });
  await b.context.chooseTime('09:00');
  const activate = b.context.activateNotifications();
  await new Promise(setImmediate);
  const later = b.context.chooseTime('10:00');
  releaseConfig({ ok: true, json: async () => ({ publicKey: 'AQID' }) });
  await Promise.all([activate, later]);
  const hours = b.calls.filter((call) => call.url === '/api/subscribe').map((call) => JSON.parse(call.options.body).time);
  assert.deepEqual(hours, ['09:00', '09:00', '10:00']);
  assert.equal(b.state().time, '10:00');
});

test('failed deactivation after pending hour save keeps the confirmed new server hour', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const b = browser({ fetcher: (url) => url === '/api/subscribe' ? pending : Promise.resolve({ ok: false }) });
  const update = b.context.chooseTime('09:00');
  await new Promise(setImmediate);
  const deactivate = b.context.deactivateNotifications();
  release({ ok: true });
  await Promise.all([update, deactivate]);
  assert.deepEqual(b.calls.map((call) => call.url), ['/api/subscribe', '/api/unsubscribe']);
  assert.equal(b.state().active, true);
  assert.equal(b.state().time, '09:00');
  assert.equal(b.data.get('pistasPrayerTime'), '09:00');
});

test('legacy late saved hour asks for an update without promising a daily notification', () => {
  const b = browser();
  const html = b.context.renderPrayerSummary({ active: true, time: '23:59' });
  assert.match(html, /La hora guardada necesita actualizarse/);
  assert.match(html, /Ajustes/);
  assert.equal(html.includes('Recibirás'), false);
  assert.equal(b.state().time, '08:00');
  assert.equal(b.calls.length, 0);
});
