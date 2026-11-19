/**
 * Agenda — ponte (Cloudflare Worker)
 *
 * Funções:
 *  - GET  /health         → status da configuração (e o Client ID público do Google)
 *  - GET  /ics            → baixa o calendário publicado do Outlook (ICS_URL) e devolve com CORS
 *  - POST /google/token   → troca o "code" do login Google por tokens (usa o client secret)
 *  - POST /google/refresh → renova o access token a partir do refresh token
 *  - POST /google/revoke  → revoga o token (desconectar)
 *
 * Variáveis (Settings → Variables and Secrets do Worker):
 *  - ACCESS_KEY            (secret)  chave que o app envia no cabeçalho X-Agenda-Key
 *  - ICS_URL               (secret)  link ICS publicado do Outlook (pode ter vários, separados por vírgula)
 *  - GOOGLE_CLIENT_ID      (texto)   Client ID OAuth (tipo "Aplicativo da Web")
 *  - GOOGLE_CLIENT_SECRET  (secret)  Client secret do mesmo OAuth client
 *  - ALLOWED_ORIGINS       (texto)   ex.: https://seuusuario.github.io,http://localhost:8080
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '*')
      .split(',')
      .map((s) => s.trim().replace(/\/$/, ''))
      .filter(Boolean);
    const anyOrigin = allowed.includes('*');
    const originOk = anyOrigin || !origin || allowed.includes(origin);

    const cors = {
      'Access-Control-Allow-Origin': anyOrigin ? '*' : originOk && origin ? origin : allowed[0] || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Agenda-Key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!originOk) return json({ error: 'origin_not_allowed' }, 403, cors);

    if (!env.ACCESS_KEY) return json({ error: 'worker_not_configured', detail: 'Defina ACCESS_KEY.' }, 500, cors);
    const key = request.headers.get('X-Agenda-Key') || '';
    if (!safeEqual(key, String(env.ACCESS_KEY))) return json({ error: 'unauthorized' }, 401, cors);

    const { pathname } = new URL(request.url);

    try {
      if (pathname === '/health' && request.method === 'GET') {
        return json(
          {
            ok: true,
            ics: !!env.ICS_URL,
            google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
            googleClientId: env.GOOGLE_CLIENT_ID || null,
          },
          200,
          cors,
        );
      }

      if (pathname === '/ics' && request.method === 'GET') {
        if (!env.ICS_URL) return json({ error: 'ics_not_configured' }, 404, cors);
        const urls = String(env.ICS_URL)
          .split(/[\s,]+/)
          .map((u) => u.trim().replace(/^webcals?:\/\//i, 'https://'))
          .filter(Boolean);
        const parts = await Promise.all(
          urls.map(async (u) => {
            const r = await fetch(u, { headers: { 'User-Agent': 'Agenda-ICS-Bridge/1.0' } });
            if (!r.ok) throw new Upstream(r.status);
            return r.text();
          }),
        );
        // Vários calendários: separados por um marcador que o app entende.
        const body = parts.join('\r\n#AGENDA-SPLIT#\r\n');
        return new Response(body, {
          status: 200,
          headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }

      if (pathname.startsWith('/google/') && request.method === 'POST') {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
          return json({ error: 'google_not_configured' }, 404, cors);
        }
        const body = await request.json().catch(() => ({}));

        if (pathname === '/google/token') {
          if (!body.code || !body.redirect_uri) return json({ error: 'missing_code' }, 400, cors);
          const params = {
            grant_type: 'authorization_code',
            code: body.code,
            redirect_uri: body.redirect_uri,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
          };
          if (body.code_verifier) params.code_verifier = body.code_verifier;
          return proxyGoogle(GOOGLE_TOKEN_URL, params, cors);
        }

        if (pathname === '/google/refresh') {
          if (!body.refresh_token) return json({ error: 'missing_refresh_token' }, 400, cors);
          return proxyGoogle(
            GOOGLE_TOKEN_URL,
            {
              grant_type: 'refresh_token',
              refresh_token: body.refresh_token,
              client_id: env.GOOGLE_CLIENT_ID,
              client_secret: env.GOOGLE_CLIENT_SECRET,
            },
            cors,
          );
        }

        if (pathname === '/google/revoke') {
          if (!body.token) return json({ error: 'missing_token' }, 400, cors);
          return proxyGoogle(GOOGLE_REVOKE_URL, { token: body.token }, cors);
        }
      }

      return json({ error: 'not_found' }, 404, cors);
    } catch (err) {
      if (err instanceof Upstream) return json({ error: 'upstream_error', status: err.status }, 502, cors);
      return json({ error: 'internal_error', detail: String(err && err.message) }, 500, cors);
    }
  },
};

class Upstream extends Error {
  constructor(status) {
    super('upstream ' + status);
    this.status = status;
  }
}

async function proxyGoogle(url, params, cors) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await r.text();
  return new Response(text || '{}', {
    status: r.status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length || !a) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
