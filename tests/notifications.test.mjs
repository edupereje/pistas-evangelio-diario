import test from 'node:test';
import assert from 'node:assert/strict';
import { createSendDaily } from '../netlify/functions/send-daily.mjs';
import { createSubscribe } from '../netlify/functions/subscribe.mjs';
import { createUnsubscribe } from '../netlify/functions/unsubscribe.mjs';
import { createTestNotification } from '../netlify/functions/test-notification.mjs';
import { selectTodayPista } from '../netlify/functions/_content.mjs';
import { getTodayPista } from '../netlify/functions/_pistas.mjs';
import { timeMatches, madridScheduledTime, sha256Base64Url, validNotificationTime } from '../netlify/functions/_utils.mjs';
import { SUBSCRIPTIONS, DELIVERIES } from '../netlify/functions/_push.mjs';

const subscription = { endpoint: 'https://push.example.invalid/device', keys: { p256dh: 'dummy-public', auth: 'dummy-auth' } };
const day = { fecha: '2026-10-26', publicar: 'sí', cita: 'Lc 13, 10-17', notificacionTitulo: '“Quedas libre”', notificacionTexto: 'Un texto de N.' };
const instant = new Date('2026-10-26T07:05:00Z'); // 08:05 Madrid
const request = (body) => new Request('https://example.invalid/api', { method: 'POST', body: JSON.stringify(body) });
const clone = (value) => value === undefined ? null : structuredClone(value);
function fixture(items = { one: { active: true, subscription, time: '08:00' } }) {
  const maps = { [SUBSCRIPTIONS]: new Map(Object.entries(items)), [DELIVERIES]: new Map() };
  const calls = [];
  const stores = ({ name }) => ({
    async *list() { yield { blobs: [...maps[name].keys()].map((key) => ({ key })) }; },
    async get(key) { return clone(maps[name].get(key)); },
    async setJSON(key, value) { maps[name].set(key, clone(value)); },
    async delete(key) { maps[name].delete(key); }
  });
  const push = { setVapidDetails() {}, async sendNotification(sub, payload) { calls.push({ sub, payload: JSON.parse(payload) }); } };
  const logs = [];
  const logger = { log: (...args) => logs.push(args), error: (...args) => logs.push(args) };
  const options = { stores, push, readPistas: async () => [day], clock: () => instant, env: () => 'test-only', logger };
  return { maps, stores, push, calls, logs, options };
}
const run = async (handler) => (await handler()).json();

test('historical Date argument is rejected; today selection is strict and respects publicar', () => {
  assert.throws(() => getTodayPista(instant), /lista/);
  const yesterday = { ...day, fecha: '2026-10-25' };
  const tomorrow = { ...day, fecha: '2026-10-27' };
  assert.equal(selectTodayPista([yesterday, tomorrow], instant), null);
  assert.equal(selectTodayPista([{ ...day, publicar: 'no' }], instant), null);
  assert.equal(getTodayPista([day], instant), day);
  assert.equal(selectTodayPista([tomorrow], new Date('2026-10-26T23:05:00Z')), tomorrow);
});

test('real send handler loads list, uses exact Madrid day and literal M/N, records daily mark', async () => {
  const f = fixture();
  const result = await run(createSendDaily(f.options));
  assert.equal(result.sent, 1);
  assert.deepEqual(f.calls[0].payload, { title: day.notificacionTitulo, body: day.notificacionTexto, url: '/?fecha=2026-10-26', tag: 'pistas-2026-10-26' });
  assert.equal(f.maps[SUBSCRIPTIONS].get('one').lastSentDate, day.fecha);
  assert.equal(f.maps[DELIVERIES].get('one').lastSentDate, day.fecha);
  assert.equal(JSON.stringify(f.logs).includes(subscription.endpoint), false);
});

test('no exact published day means no VAPID setup or send; source failure never uses fallback', async () => {
  const f = fixture();
  f.push.setVapidDetails = () => assert.fail('VAPID must not be used');
  const result = await run(createSendDaily({ ...f.options, readPistas: async () => [{ ...day, fecha: '2026-10-25' }] }));
  assert.equal(result.reason, 'no-pista-today');
  assert.equal(f.calls.length, 0);
  await assert.rejects(createSendDaily({ ...f.options, readPistas: async () => { throw new Error('source unavailable'); } })(), /source unavailable/);
});

test('empty N has readable fallback while M remains the title', async () => {
  const f = fixture();
  await run(createSendDaily({ ...f.options, readPistas: async () => [{ ...day, notificacionTexto: '' }] }));
  assert.equal(f.calls[0].payload.title, day.notificacionTitulo);
  assert.match(f.calls[0].payload.body, /Lc 13, 10-17/);
});

test('repeated and overlapping runs send once in same instance', async () => {
  const f = fixture();
  const handler = createSendDaily(f.options);
  await Promise.all([handler(), handler()]);
  await handler();
  assert.equal(f.calls.length, 1);
});

test('legacy lastSentDate prevents send and out-of-window/inactive subscriptions are skipped', async () => {
  const f = fixture({ sent: { active: true, subscription, time: '08:00', lastSentDate: day.fecha }, early: { active: true, subscription, time: '08:15' }, inactive: { active: false, subscription, time: '08:00' }, invalid: { active: true, subscription, time: '25:00' } });
  assert.equal((await run(createSendDaily(f.options))).skipped, 4);
  assert.equal(f.calls.length, 0);
});

test('a concurrent preference update survives completion of a send', async () => {
  const f = fixture();
  const original = f.push.sendNotification;
  f.push.sendNotification = async (...args) => {
    await original(...args);
    f.maps[SUBSCRIPTIONS].set('one', { ...f.maps[SUBSCRIPTIONS].get('one'), time: '09:30', updatedAt: 'newer' });
  };
  await run(createSendDaily(f.options));
  assert.equal(f.maps[SUBSCRIPTIONS].get('one').time, '09:30');
  assert.equal(f.maps[SUBSCRIPTIONS].get('one').updatedAt, 'newer');
});

test('durable receipt prevents retry if preference mirror write fails', async () => {
  const f = fixture();
  const stores = (opts) => {
    const store = f.stores(opts);
    if (opts.name === SUBSCRIPTIONS) store.setJSON = async () => { throw new Error('write failed'); };
    return store;
  };
  const handler = createSendDaily({ ...f.options, stores });
  assert.equal((await run(handler)).stateErrors, 1);
  await handler();
  assert.equal(f.calls.length, 1);
});

test('expired subscriptions removed, 403 retained, processing continues and logs omit provider details', async () => {
  const f = fixture({ expired: { active: true, subscription: { ...subscription, endpoint: 'https://push.example.invalid/expired' }, time: '08:00' }, forbidden: { active: true, subscription: { ...subscription, endpoint: 'https://push.example.invalid/forbidden' }, time: '08:00' }, good: { active: true, subscription, time: '08:00' } });
  const original = f.push.sendNotification;
  f.push.sendNotification = async (sub, payload) => {
    if (sub.endpoint.endsWith('/expired')) throw Object.assign(new Error('provider-private-details'), { statusCode: 410 });
    if (sub.endpoint.endsWith('/forbidden')) throw Object.assign(new Error('provider-private-details'), { statusCode: 403 });
    return original(sub, payload);
  };
  const result = await run(createSendDaily(f.options));
  assert.equal(result.removed, 1);
  assert.equal(result.errors, 1);
  assert.equal(result.sent, 1);
  assert.equal(f.maps[SUBSCRIPTIONS].has('expired'), false);
  assert.equal(f.maps[SUBSCRIPTIONS].has('forbidden'), true);
  assert.equal(JSON.stringify(f.logs).includes('provider-private-details'), false);
});

test('read failure for one subscription does not stop later subscriptions', async () => {
  const f = fixture({ bad: {}, good: { active: true, subscription, time: '08:00' } });
  const stores = (opts) => {
    const store = f.stores(opts);
    const get = store.get;
    store.get = (key) => key === 'bad' ? Promise.reject(new Error('corrupt')) : get(key);
    return store;
  };
  const result = await run(createSendDaily({ ...f.options, stores }));
  assert.equal(result.errors, 1);
  assert.equal(result.sent, 1);
});

test('subscribe persists hour and preserves delivery fields; ignores injected lastSentDate', async () => {
  const f = fixture({});
  const key = await sha256Base64Url(subscription.endpoint);
  f.maps[SUBSCRIPTIONS].set(key, { active: true, time: '08:00', lastSentDate: day.fecha, lastSentAt: instant.toISOString() });
  const handler = createSubscribe({ stores: f.stores, clock: () => instant });
  assert.equal((await handler(request({ subscription, time: '09:30', lastSentDate: null }))).status, 200);
  const saved = f.maps[SUBSCRIPTIONS].get(key);
  assert.equal(saved.time, '09:30');
  assert.equal(saved.timezone, 'Europe/Madrid');
  assert.equal(saved.lastSentDate, day.fecha);
  assert.equal(saved.lastSentAt, instant.toISOString());
  const sender = createSendDaily({ ...f.options, clock: () => new Date('2026-10-26T08:35:00Z') });
  await sender();
  assert.equal(f.calls.length, 0);
});

test('subscribe rejects malformed times/subscriptions without writes; methods guarded', async () => {
  const f = fixture({});
  const handler = createSubscribe({ stores: f.stores });
  for (const time of ['8:00', '24:00', '10:60', '', 800, '08:00:00', '23:46', '23:59']) assert.equal((await handler(request({ subscription, time }))).status, 400);
  assert.equal((await handler(request({ subscription: { endpoint: 'http://example.invalid' }, time: '08:00' }))).status, 400);
  assert.equal((await handler(new Request('https://example.invalid', { method: 'GET' }))).status, 405);
  assert.equal((await handler(new Request('https://example.invalid', { method: 'OPTIONS' }))).status, 204);
  assert.equal(f.maps[SUBSCRIPTIONS].size, 0);
});

test('unsubscribe removes preferences and daily receipt', async () => {
  const f = fixture({});
  const key = await sha256Base64Url(subscription.endpoint);
  f.maps[SUBSCRIPTIONS].set(key, { subscription });
  f.maps[DELIVERIES].set(key, { lastSentDate: day.fecha });
  assert.equal((await createUnsubscribe({ stores: f.stores })(request({ endpoint: subscription.endpoint }))).status, 200);
  assert.equal(f.maps[SUBSCRIPTIONS].size, 0);
  assert.equal(f.maps[DELIVERIES].size, 0);
});

test('Madrid schedule handles seasonal offsets, spring missing hour and autumn repeated hour', () => {
  assert.equal(madridScheduledTime('08:00', new Date('2026-03-28T08:00Z')).toISOString(), '2026-03-28T07:00:00.000Z');
  assert.equal(madridScheduledTime('08:00', new Date('2026-03-29T08:00Z')).toISOString(), '2026-03-29T06:00:00.000Z');
  assert.equal(madridScheduledTime('02:30', new Date('2026-03-29T01:00Z')).toISOString(), '2026-03-29T01:00:00.000Z');
  assert.equal(timeMatches('02:30', '03:00', new Date('2026-03-29T01:00Z')), true);
  assert.equal(timeMatches('01:50', '03:00', new Date('2026-03-29T01:00Z')), true);
  assert.equal(timeMatches('02:00', '02:00', new Date('2026-10-25T00:00Z')), true);
  assert.equal(timeMatches('02:00', '02:00', new Date('2026-10-25T01:00Z')), false);
  assert.equal(timeMatches('08:00', '08:15'), false);
  assert.equal(timeMatches('23:59', '00:00'), false);
});

test('last supported hour is 23:45; legacy 08:07 still matches next cron tick', async () => {
  assert.equal(validNotificationTime('23:45'), true);
  for (const time of ['23:46', '23:59']) {
    assert.equal(validNotificationTime(time), false);
    assert.equal(madridScheduledTime(time, instant), null);
    assert.equal(timeMatches(time, time, new Date(`2026-10-26T${time}:00+01:00`)), false);
  }
  assert.equal(timeMatches('23:45', '23:45', new Date('2026-10-26T22:45:00Z')), true);
  assert.equal(timeMatches('08:07', '08:15', new Date('2026-10-26T07:15:00Z')), true);
  const f = fixture({});
  assert.equal((await createSubscribe({ stores: f.stores })(request({ subscription, time: '23:45' }))).status, 200);
  assert.equal([...f.maps[SUBSCRIPTIONS].values()][0].time, '23:45');
});

test('test notification failures expose no provider credentials/details and do not mutate subscriptions', async () => {
  const f = fixture();
  f.push.sendNotification = async () => { throw Object.assign(new Error('private provider error'), { statusCode: 403 }); };
  const response = await createTestNotification({ push: f.push, env: () => 'test-only' })(request({ subscription }));
  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes('private provider error'), false);
  assert.equal(f.maps[SUBSCRIPTIONS].size, 1);
});
