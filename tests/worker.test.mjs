import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/worker.js';

const env = {
  ACCESS_KEY: 'segredo-123',
  ICS_URL: 'https://outlook.office365.com/owa/calendar/abc/calendar.ics',
  GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'csecret',
  ALLOWED_ORIGINS: 'https://usuario.github.io',
};
const realFetch = globalThis.fetch;
let calls = [];
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('calendar.ics')) return new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR', { status: 200 });
  if (String(url).includes('oauth2.googleapis.com/token')) {
    const p = new URLSearchParams(init.body);
    if (p.get('refresh_token') === 'ruim') return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    return new Response(JSON.stringify({ access_token: 'at', expires_in: 3599, refresh_token: 'rt', grant: p.get('grant_type'), secret: p.get('client_secret') }), { status: 200 });
  }
  return new Response('nope', { status: 500 });
};
const req = (path, { method = 'GET', key = env.ACCESS_KEY, origin = 'https://usuario.github.io', body } = {}) =>
  new Request('https://ponte.workers.dev' + path, {
    method,
    headers: { ...(key ? { 'X-Agenda-Key': key } : {}), ...(origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('preflight CORS', async () => {
  const r = await worker.fetch(req('/ics', { method: 'OPTIONS', key: null }), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://usuario.github.io');
});

test('bloqueia sem chave, chave errada e origem não permitida', async () => {
  assert.equal((await worker.fetch(req('/ics', { key: null }), env)).status, 401);
  assert.equal((await worker.fetch(req('/ics', { key: 'errada-123' }), env)).status, 401);
  assert.equal((await worker.fetch(req('/ics', { origin: 'https://malicioso.com' }), env)).status, 403);
});

test('health não expõe segredos', async () => {
  const r = await worker.fetch(req('/health'), env);
  const j = await r.json();
  assert.deepEqual(j, { ok: true, ics: true, google: true, googleClientId: env.GOOGLE_CLIENT_ID });
  assert.ok(!JSON.stringify(j).includes('csecret') && !JSON.stringify(j).includes('calendar.ics'));
});

test('ICS é repassado com CORS e vários links são unidos', async () => {
  let r = await worker.fetch(req('/ics'), env);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /BEGIN:VCALENDAR/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://usuario.github.io');
  r = await worker.fetch(req('/ics'), { ...env, ICS_URL: env.ICS_URL + ', webcal://outlook.office365.com/x/calendar.ics' });
  const t = await r.text();
  assert.ok(t.includes('#AGENDA-SPLIT#'));
  assert.ok(calls.some((c) => c.url === 'https://outlook.office365.com/x/calendar.ics'), 'webcal vira https');
});

test('troca de código e renovação do Google usam o secret só no servidor', async () => {
  calls = [];
  let r = await worker.fetch(req('/google/token', { method: 'POST', body: { code: 'c', code_verifier: 'v', redirect_uri: 'https://usuario.github.io/site-planilha/' } }), env);
  let j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.grant, 'authorization_code');
  assert.equal(j.secret, 'csecret');
  r = await worker.fetch(req('/google/refresh', { method: 'POST', body: { refresh_token: 'rt' } }), env);
  assert.equal((await r.json()).grant, 'refresh_token');
  r = await worker.fetch(req('/google/refresh', { method: 'POST', body: { refresh_token: 'ruim' } }), env);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, 'invalid_grant');
});

test('erros de configuração', async () => {
  assert.equal((await worker.fetch(req('/ics'), { ...env, ICS_URL: '' })).status, 404);
  assert.equal((await worker.fetch(req('/google/token', { method: 'POST', body: { code: 'x', redirect_uri: 'y' } }), { ...env, GOOGLE_CLIENT_SECRET: '' })).status, 404);
  assert.equal((await worker.fetch(req('/health'), { ...env, ACCESS_KEY: '' })).status, 500);
  assert.equal((await worker.fetch(req('/qualquer'), env)).status, 404);
});

test.after(() => (globalThis.fetch = realFetch));
