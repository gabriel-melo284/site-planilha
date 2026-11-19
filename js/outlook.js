// Leitura do calendário publicado do Outlook (ICS) e expansão de recorrências.
import ICAL from './vendor/ical.min.js';

// Nomes de fuso do Windows mais comuns → IANA (usado só se o ICS não trouxer VTIMEZONE)
const WINDOWS_TZ = {
  'E. South America Standard Time': 'America/Sao_Paulo',
  'South America Standard Time': 'America/Sao_Paulo',
  'Bahia Standard Time': 'America/Bahia',
  'SA Eastern Standard Time': 'America/Fortaleza',
  'Central Brazilian Standard Time': 'America/Cuiaba',
  'SA Western Standard Time': 'America/Manaus',
  'Tocantins Standard Time': 'America/Araguaina',
  'UTC': 'UTC',
  'GMT Standard Time': 'Europe/London',
  'W. Europe Standard Time': 'Europe/Berlin',
  'Romance Standard Time': 'Europe/Paris',
  'Eastern Standard Time': 'America/New_York',
  'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver',
  'Pacific Standard Time': 'America/Los_Angeles',
  'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'Pacific SA Standard Time': 'America/Santiago',
  'SA Pacific Standard Time': 'America/Bogota',
  'Central Standard Time (Mexico)': 'America/Mexico_City',
  'India Standard Time': 'Asia/Kolkata',
  'Tokyo Standard Time': 'Asia/Tokyo',
  'China Standard Time': 'Asia/Shanghai',
};

/** Converte "hora de parede" em um fuso IANA para um Date (UTC real). */
function wallTimeToDate(t, ianaZone) {
  const guess = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaZone,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const offsetAt = (ms) => {
      const p = Object.fromEntries(dtf.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
      const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      return asUtc - ms;
    };
    let ms = guess - offsetAt(guess);
    ms = guess - offsetAt(ms);
    return new Date(ms);
  } catch {
    return null;
  }
}

/** ICAL.Time → Date, tratando fusos não declarados no arquivo. */
function toDate(time, tzidHint) {
  if (!time) return null;
  if (time.isDate) return new Date(time.year, time.month - 1, time.day);
  const zone = time.zone;
  const floating = !zone || zone.tzid === 'floating';
  if (floating && tzidHint) {
    const iana = WINDOWS_TZ[tzidHint] || (tzidHint.includes('/') ? tzidHint : null);
    if (iana) {
      const d = wallTimeToDate(time, iana);
      if (d) return d;
    }
  }
  return time.toJSDate();
}

const tzidOf = (comp, prop) => {
  const p = comp.getFirstProperty(prop);
  return p ? p.getParameter('tzid') : null;
};

const TEAMS_RE = /https:\/\/teams\.(?:microsoft|live)\.com\/(?:l\/meetup-join|meet)\/[^\s<>"')\]]+/i;
const MEET_RE = /https:\/\/(?:meet\.google\.com\/[a-z0-9-]+|[\w.-]*zoom\.us\/[^\s<>"')\]]+)/i;

export function findMeetingLink(...texts) {
  for (const t of texts) {
    if (!t) continue;
    const m = String(t).match(TEAMS_RE) || String(t).match(MEET_RE);
    if (m) return m[0].replace(/[.,;]+$/, '');
  }
  return null;
}

/**
 * Lê o texto ICS (pode conter vários calendários separados por #AGENDA-SPLIT#).
 * Retorna uma estrutura pronta para expandir por intervalo.
 */
export function parseIcs(text) {
  const chunks = String(text || '').split(/\r?\n#AGENDA-SPLIT#\r?\n/);
  const series = [];
  let calName = null;
  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const root = new ICAL.Component(ICAL.parse(chunk));
    const cals = root.name === 'vcalendar' ? [root] : root.getAllSubcomponents('vcalendar');
    for (const cal of cals) {
      calName = calName || cal.getFirstPropertyValue('x-wr-calname');
      for (const tz of cal.getAllSubcomponents('vtimezone')) {
        try { ICAL.TimezoneService.register(tz); } catch { /* ignora fuso inválido */ }
      }
      const byUid = new Map();
      for (const v of cal.getAllSubcomponents('vevent')) {
        const uid = v.getFirstPropertyValue('uid') || Math.random().toString(36).slice(2);
        if (!byUid.has(uid)) byUid.set(uid, { master: null, exceptions: [] });
        const g = byUid.get(uid);
        if (v.hasProperty('recurrence-id')) g.exceptions.push(v);
        else g.master = v;
      }
      for (const [uid, g] of byUid) {
        if (g.master) {
          const ev = new ICAL.Event(g.master, { strictExceptions: false });
          for (const ex of g.exceptions) {
            try { ev.relateException(ex); } catch { /* ignora */ }
          }
          series.push({ uid, ev });
        } else {
          for (const ex of g.exceptions) series.push({ uid, ev: new ICAL.Event(ex), orphan: true });
        }
      }
    }
  }
  return { series, calName };
}

function busyStatus(comp) {
  const s = String(comp.getFirstPropertyValue('x-microsoft-cdo-busystatus') || '').toUpperCase();
  if (s === 'FREE') return 'free';
  if (s === 'TENTATIVE') return 'tentative';
  if (s === 'OOF') return 'oof';
  const transp = String(comp.getFirstPropertyValue('transp') || '').toUpperCase();
  return transp === 'TRANSPARENT' ? 'free' : 'busy';
}

function isCancelled(comp) {
  const st = String(comp.getFirstPropertyValue('status') || '').toUpperCase();
  const title = String(comp.getFirstPropertyValue('summary') || '');
  return st === 'CANCELLED' || /^(cancelad[oa]|canceled|cancelled)\s*:/i.test(title);
}

function makeEvent(item, start, end, uid, recurring, color) {
  const comp = item.component;
  const description = item.description || '';
  const location = item.location || '';
  const allDay =
    item.startDate?.isDate ||
    String(comp.getFirstPropertyValue('x-microsoft-cdo-alldayevent') || '').toUpperCase() === 'TRUE';
  let s = start;
  let e = end && end > start ? end : new Date(start.getTime() + (allDay ? 864e5 : 30 * 60e3));
  if (allDay) {
    s = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    e = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    if (e <= s) e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 1);
  }
  const organizerProp = comp.getFirstProperty('organizer');
  const organizer = organizerProp
    ? organizerProp.getParameter('cn') || String(organizerProp.getFirstValue() || '').replace(/^mailto:/i, '')
    : '';
  const attendees = comp.getAllProperties('attendee').map((a) => a.getParameter('cn') || String(a.getFirstValue()).replace(/^mailto:/i, ''));
  return {
    id: `outlook:${uid}:${s.getTime()}`,
    seriesId: uid,
    source: 'outlook',
    calendarId: 'outlook',
    title: item.summary || '(Sem título)',
    start: s,
    end: e,
    allDay: !!allDay,
    location,
    description,
    organizer,
    attendees,
    status: busyStatus(comp),
    recurring,
    meetingUrl: findMeetingLink(location, description, comp.getFirstPropertyValue('x-microsoft-skypeteamsmeetingurl'), comp.getFirstPropertyValue('url')),
    readOnly: true,
    color,
  };
}

/** Expande os eventos (incluindo recorrentes) que tocam o intervalo [from, to). */
export function expandRange(parsed, from, to, color = '#2563eb') {
  const out = [];
  if (!parsed) return out;
  const fromMs = from.getTime();
  const toMs = to.getTime();
  for (const { uid, ev } of parsed.series) {
    try {
      const comp = ev.component;
      const tzS = tzidOf(comp, 'dtstart');
      const tzE = tzidOf(comp, 'dtend') || tzS;
      if (!ev.isRecurring() || ev.isRecurrenceException()) {
        if (isCancelled(comp)) continue;
        const s = toDate(ev.startDate, tzS);
        if (!s) continue;
        const e = toDate(ev.endDate, tzE) || s;
        if (s.getTime() < toMs && Math.max(e.getTime(), s.getTime() + 1) > fromMs) {
          out.push(makeEvent(ev, s, e, uid, false, color));
        }
        continue;
      }
      const it = ev.iterator();
      let next;
      let guard = 0;
      while ((next = it.next()) && guard++ < 20000) {
        const occStart = toDate(next, tzS);
        if (occStart.getTime() >= toMs + 864e5 * 2) break; // folga para exceções deslocadas
        const det = ev.getOccurrenceDetails(next);
        const item = det.item;
        const icomp = item.component;
        const itz = tzidOf(icomp, 'dtstart') || tzS;
        const s = toDate(det.startDate, itz);
        const e = toDate(det.endDate, tzidOf(icomp, 'dtend') || itz);
        if (s.getTime() >= toMs || Math.max(e.getTime(), s.getTime() + 1) <= fromMs) continue;
        if (isCancelled(icomp)) continue;
        out.push(makeEvent(item, s, e, uid, true, color));
      }
    } catch (err) {
      console.warn('Evento ICS ignorado', uid, err);
    }
  }
  return out;
}
