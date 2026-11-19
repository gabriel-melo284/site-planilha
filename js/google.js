// Google Agenda + Google Tasks (login OAuth com PKCE, tokens trocados via ponte)
import { bridge, health, BridgeError } from './bridge.js';
import { load, save } from './store.js';
import { parseYmd, ymd } from './dates.js';
import { findMeetingLink } from './outlook.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CAL = 'https://www.googleapis.com/calendar/v3';
const TASKS = 'https://tasks.googleapis.com/tasks/v1';
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
];

export const EVENT_COLORS = {
  1: '#7986cb', 2: '#33b679', 3: '#8e24aa', 4: '#e67c73', 5: '#f6bf26', 6: '#f4511e',
  7: '#039be5', 8: '#616161', 9: '#3f51b5', 10: '#0b8043', 11: '#d50000',
};

export class AuthError extends Error {}

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(part))));
  } catch {
    return {};
  }
}

export function createGoogleProvider(settings) {
  let tokens = load('google', null);
  let refreshing = null;

  const setTokens = (t) => {
    tokens = t;
    save('google', t);
  };

  async function startLogin() {
    const h = await health(settings);
    if (!h.google || !h.googleClientId) {
      throw new BridgeError('Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Worker', 0, 'google_not_configured');
    }
    const verifier = randomString(48);
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const state = randomString(16);
    save('oauth', { state, verifier, at: Date.now() });
    const params = new URLSearchParams({
      client_id: h.googleClientId,
      redirect_uri: redirectUri(),
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (tokens?.email) params.set('login_hint', tokens.email);
    location.assign(`${AUTH_URL}?${params}`);
  }

  /** Conclui o login quando o Google redireciona de volta com ?code=. */
  async function completeLogin() {
    const qs = new URLSearchParams(location.search);
    const code = qs.get('code');
    const error = qs.get('error');
    if (!code && !error) return null;
    const pending = load('oauth', null);
    save('oauth', null);
    history.replaceState(null, '', redirectUri() + location.hash);
    if (error) throw new AuthError(error === 'access_denied' ? 'Acesso negado no Google' : 'Erro no login: ' + error);
    if (!pending || pending.state !== qs.get('state')) throw new AuthError('Login expirado, tente novamente');
    const r = await bridge(settings, '/google/token', {
      method: 'POST',
      body: { code, code_verifier: pending.verifier, redirect_uri: redirectUri() },
    });
    const t = await r.json();
    if (!t.refresh_token) throw new AuthError('O Google não enviou o token de renovação; tente conectar de novo');
    const info = decodeJwt(t.id_token || '');
    setTokens({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: Date.now() + (t.expires_in - 60) * 1000,
      email: info.email || '',
    });
    return tokens;
  }

  async function accessToken(force = false) {
    if (!tokens?.refresh_token) throw new AuthError('Google não conectado');
    if (!force && tokens.access_token && Date.now() < tokens.expires_at) return tokens.access_token;
    if (!refreshing) {
      refreshing = (async () => {
        try {
          const r = await bridge(settings, '/google/refresh', { method: 'POST', body: { refresh_token: tokens.refresh_token } });
          const t = await r.json();
          setTokens({ ...tokens, access_token: t.access_token, expires_at: Date.now() + (t.expires_in - 60) * 1000 });
          return tokens.access_token;
        } catch (e) {
          if (e instanceof BridgeError && ['invalid_grant', 'invalid_request', 'unauthorized_client'].includes(e.code)) {
            setTokens({ email: tokens?.email || '', expired: true });
            throw new AuthError('A conexão com o Google expirou. Conecte novamente.');
          }
          throw e;
        } finally {
          refreshing = null;
        }
      })();
    }
    return refreshing;
  }

  async function api(url, { method = 'GET', body, query } = {}, retry = true) {
    const token = await accessToken();
    const u = new URL(url);
    if (query) Object.entries(query).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
    let res;
    try {
      res = await fetch(u, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Sem conexão com o Google');
    }
    if (res.status === 401 && retry) {
      await accessToken(true);
      return api(url, { method, body, query }, false);
    }
    if (!res.ok) {
      let msg = `Google: erro ${res.status}`;
      try { msg = 'Google: ' + ((await res.json()).error?.message || msg); } catch { /* ignora */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  async function paged(url, query, key = 'items') {
    const out = [];
    let pageToken;
    let guard = 0;
    do {
      const data = await api(url, { query: { ...query, pageToken } });
      out.push(...(data?.[key] || []));
      pageToken = data?.nextPageToken;
    } while (pageToken && guard++ < 20);
    return out;
  }

  // ---------- Agenda ----------
  let calCache = new Map();

  async function listCalendars() {
    const items = await paged(`${CAL}/users/me/calendarList`, { maxResults: 250 });
    const cals = items.map((c) => ({
      id: c.id,
      name: c.summaryOverride || c.summary,
      color: c.backgroundColor || '#16a34a',
      primary: !!c.primary,
      writable: c.accessRole === 'owner' || c.accessRole === 'writer',
    }));
    calCache = new Map(cals.map((c) => [c.id, c]));
    return cals;
  }

  function fromGoogle(ev, calId) {
    const cal = calCache.get(calId) || { writable: true, color: '#16a34a' };
    const allDay = !!ev.start?.date;
    const start = allDay ? parseYmd(ev.start.date) : new Date(ev.start?.dateTime);
    const end = allDay ? parseYmd(ev.end?.date || ev.start.date) : new Date(ev.end?.dateTime || ev.start?.dateTime);
    const self = (ev.attendees || []).find((a) => a.self);
    const popup = ev.reminders?.overrides?.find((o) => o.method === 'popup');
    return {
      id: `google:${calId}:${ev.id}`,
      gid: ev.id,
      source: 'google',
      calendarId: calId,
      title: ev.summary || '(Sem título)',
      start,
      end,
      allDay,
      location: ev.location || '',
      description: ev.description || '',
      status: ev.transparency === 'transparent' ? 'free' : 'busy',
      declined: self?.responseStatus === 'declined',
      recurring: !!ev.recurringEventId,
      meetingUrl: ev.hangoutLink || findMeetingLink(ev.location, ev.description),
      readOnly: !cal.writable,
      color: ev.colorId ? EVENT_COLORS[ev.colorId] : null,
      taskId: ev.extendedProperties?.private?.agendaTaskId || null,
      reminderMin: ev.reminders?.useDefault ? null : popup ? popup.minutes : -1,
      htmlLink: ev.htmlLink,
    };
  }

  function toGoogle(d) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body = {
      summary: d.title,
      location: d.location || '',
      description: d.description || '',
      start: d.allDay ? { date: ymd(d.start) } : { dateTime: d.start.toISOString(), timeZone: tz },
      end: d.allDay ? { date: ymd(d.end) } : { dateTime: d.end.toISOString(), timeZone: tz },
      transparency: d.status === 'free' ? 'transparent' : 'opaque',
    };
    if (d.reminderMin === null || d.reminderMin === undefined) body.reminders = { useDefault: true };
    else if (d.reminderMin < 0) body.reminders = { useDefault: false, overrides: [] };
    else body.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: d.reminderMin }] };
    if (d.taskId !== undefined) body.extendedProperties = { private: { agendaTaskId: d.taskId || '' } };
    return body;
  }

  async function listEvents(calId, from, to) {
    const items = await paged(`${CAL}/calendars/${encodeURIComponent(calId)}/events`, {
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: 2500,
    });
    return items.filter((e) => e.status !== 'cancelled').map((e) => fromGoogle(e, calId));
  }

  const evUrl = (calId, gid) =>
    `${CAL}/calendars/${encodeURIComponent(calId)}/events${gid ? '/' + encodeURIComponent(gid) : ''}`;

  return {
    kind: 'google',
    isConnected: () => !!tokens?.refresh_token,
    isExpired: () => !!tokens?.expired,
    account: () => (tokens ? { email: tokens.email } : null),
    startLogin,
    completeLogin,
    async disconnect() {
      const t = tokens?.refresh_token || tokens?.access_token;
      setTokens(null);
      if (t) bridge(settings, '/google/revoke', { method: 'POST', body: { token: t } }).catch(() => {});
    },
    listCalendars,
    listEvents,
    async createEvent(calId, d) {
      return fromGoogle(await api(evUrl(calId), { method: 'POST', body: toGoogle(d) }), calId);
    },
    async updateEvent(calId, gid, d) {
      return fromGoogle(await api(evUrl(calId, gid), { method: 'PATCH', body: toGoogle(d) }), calId);
    },
    async deleteEvent(calId, gid) {
      await api(evUrl(calId, gid), { method: 'DELETE' });
    },

    // ---------- Tarefas ----------
    async listTaskLists() {
      const items = await paged(`${TASKS}/users/@me/lists`, { maxResults: 100 });
      return items.map((l) => ({ id: l.id, title: l.title }));
    },
    async listTasks(listId) {
      const items = await paged(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks`, {
        maxResults: 100,
        showCompleted: 'true',
        showHidden: 'true',
      });
      return items.filter((t) => !t.deleted && t.title !== undefined).map((t) => normTask(t, listId));
    },
    async createTask(listId, d) {
      return normTask(await api(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks`, { method: 'POST', body: taskBody(d) }), listId);
    },
    async updateTask(listId, id, d) {
      return normTask(
        await api(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: taskBody(d) }),
        listId,
      );
    },
    async deleteTask(listId, id) {
      await api(`${TASKS}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
  };
}

function normTask(t, listId) {
  return {
    id: t.id,
    listId,
    title: t.title || '(Sem título)',
    notes: t.notes || '',
    due: t.due ? t.due.slice(0, 10) : null,
    done: t.status === 'completed',
    completedAt: t.completed || null,
    position: t.position || '',
    parent: t.parent || null,
  };
}

function taskBody(d) {
  const b = {};
  if (d.title !== undefined) b.title = d.title;
  if (d.notes !== undefined) b.notes = d.notes;
  if (d.due !== undefined) b.due = d.due ? `${d.due}T00:00:00.000Z` : null;
  if (d.done !== undefined) {
    b.status = d.done ? 'completed' : 'needsAction';
    if (!d.done) b.completed = null;
  }
  return b;
}
