// Cliente da ponte (Cloudflare Worker)

export class BridgeError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function bridge(settings, path, { method = 'GET', body } = {}) {
  if (!settings.workerUrl) throw new BridgeError('Ponte não configurada', 0, 'no_bridge');
  const base = settings.workerUrl.trim().replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers: {
        'X-Agenda-Key': settings.accessKey || '',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new BridgeError('Sem conexão com a ponte (verifique a URL e a internet)', 0, 'network');
  }
  if (!res.ok) {
    let data = {};
    try { data = await res.clone().json(); } catch { /* corpo não é JSON */ }
    const code = data.error || 'http_' + res.status;
    const messages = {
      unauthorized: 'Chave de acesso incorreta',
      origin_not_allowed: 'Este endereço não está em ALLOWED_ORIGINS do Worker',
      ics_not_configured: 'ICS_URL não definido no Worker',
      google_not_configured: 'GOOGLE_CLIENT_ID/SECRET não definidos no Worker',
      upstream_error: `O Outlook respondeu com erro ${data.status || ''}`.trim(),
      worker_not_configured: 'Defina ACCESS_KEY no Worker',
      invalid_grant: 'Autorização do Google expirou',
    };
    throw new BridgeError(messages[code] || data.error_description || `Erro ${res.status}`, res.status, code);
  }
  return res;
}

export async function health(settings) {
  const r = await bridge(settings, '/health');
  return r.json();
}
