// Modo demonstração: dados fictícios salvos só neste navegador, com a mesma interface do Google.
import { load, save } from './store.js';
import { addDays, startOfDay, startOfWeek, ymd } from './dates.js';

const pad = (n) => String(n).padStart(2, '0');
const icsLocal = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const at = (base, dayOffset, h, m = 0) => {
  const d = addDays(startOfDay(base), dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
};

/** Gera um ICS "do Outlook" relativo à semana atual. */
export function demoIcs() {
  const mon = addDays(startOfWeek(new Date(), 0), 1);
  const ev = (uid, title, s, e, extra = '') =>
    `BEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${title}\r\nDTSTART:${icsLocal(s)}\r\nDTEND:${icsLocal(e)}\r\n${extra}END:VEVENT\r\n`;
  const teams = 'DESCRIPTION:Reunião do Microsoft Teams\\nEntrar: https://teams.microsoft.com/l/meetup-join/19%3ademo%40thread.v2/0\r\nLOCATION:Microsoft Teams Meeting\r\n';
  return (
    'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:Demo\r\nX-WR-CALNAME:Calendário\r\n' +
    ev('daily', 'Daily do time', at(mon, -7, 9, 30), at(mon, -7, 9, 45), `RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n${teams}ORGANIZER;CN=Marina Lopes:mailto:marina@empresa.com\r\n`) +
    ev('one', '1:1 com gestora', at(mon, 1, 15), at(mon, 1, 15, 30), `RRULE:FREQ=WEEKLY\r\n${teams}ORGANIZER;CN=Marina Lopes:mailto:marina@empresa.com\r\n`) +
    ev('plan', 'Planejamento da sprint', at(mon, 0, 10), at(mon, 0, 11, 30), `${teams}ATTENDEE;CN=Time Produto:mailto:p@empresa.com\r\n`) +
    ev('client', 'Apresentação para cliente', at(mon, 2, 14), at(mon, 2, 15, 30), 'LOCATION:Sala 3 - 5º andar\r\nX-MICROSOFT-CDO-BUSYSTATUS:BUSY\r\n') +
    ev('review', 'Review de métricas', at(mon, 3, 17, 30), at(mon, 3, 18, 30), `${teams}X-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE\r\n`) +
    ev('lunch', 'Almoço com o time', at(mon, 4, 12), at(mon, 4, 13, 30), 'LOCATION:Restaurante da esquina\r\n') +
    ev('today1', 'Alinhamento rápido', at(new Date(), 0, 11), at(new Date(), 0, 11, 30), teams) +
    ev('today2', 'Workshop de produto', at(new Date(), 0, 16), at(new Date(), 0, 17, 30), teams) +
    'END:VCALENDAR\r\n'
  );
}

function seed() {
  const mon = addDays(startOfWeek(new Date(), 0), 1);
  const today = new Date();
  const iso = (d) => d.toISOString();
  const item = (gid, calendarId, title, start, end, extra = {}) => ({ gid, calendarId, title, start: iso(start), end: iso(end), item: true, ...extra });
  return {
    calendars: [
      { id: 'pessoal', name: 'Pessoal', color: '#16a34a', primary: true, writable: true },
      { id: 'familia', name: 'Família', color: '#db2777', primary: false, writable: true },
    ],
    events: [
      { gid: 'e1', calendarId: 'pessoal', title: 'Academia', start: iso(at(mon, 0, 7)), end: iso(at(mon, 0, 8)), recurringDays: [0, 2, 4] },
      item('e2', 'pessoal', 'Dentista', at(mon, 2, 14, 30), at(mon, 2, 15, 15), { location: 'Clínica Sorriso' }),
      item('e3', 'familia', 'Jantar com a família', at(mon, 3, 18), at(mon, 3, 20)),
      item('e4', 'pessoal', 'Corrida no parque', at(today, 0, 18, 30), at(today, 0, 19, 30)),
      { gid: 'e5', calendarId: 'familia', title: 'Aniversário da Bia', start: ymd(addDays(mon, 5)), end: ymd(addDays(mon, 6)), allDay: true, item: true },
      item('e6', 'pessoal', 'Médico — check-up', at(today, 0, 16, 30), at(today, 0, 17, 15), { location: 'Hospital Central' }),
      item('e7', 'pessoal', 'Revisar proposta do fornecedor', at(today, 0, 13), at(today, 0, 14)),
      item('e8', 'pessoal', 'Enviar relatório mensal', at(today, -1, 9), at(today, -1, 10), { description: 'Incluir gráfico de vendas' }),
      item('e9', 'pessoal', 'Pagar conta de luz', at(today, 0, 8), at(today, 0, 8, 30)),
      item('e10', 'pessoal', 'Agendar revisão do carro', at(today, 2, 12), at(today, 2, 12, 30)),
      item('e11', 'pessoal', 'Comprar presente da Bia', at(mon, 4, 19), at(mon, 4, 20)),
      item('e12', 'pessoal', 'Organizar documentos', at(today, -2, 20), at(today, -2, 21), { done: true, doneAt: iso(addDays(today, -1)) }),
    ],
  };
}

const VERSION = 'v2';

export function createDemoProvider() {
  let db = load('demo', null);
  const stamp = VERSION + ymd(startOfWeek(new Date(), 0));
  if (!db || db.week !== stamp) {
    db = { ...seed(), week: stamp };
    save('demo', db);
  }
  const persist = () => save('demo', db);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 60));
  // ocorrência de evento recorrente: "<id>_<AAAAMMDD>", como no Google
  const baseGid = (gid) => String(gid).split('_')[0];
  const findEv = (gid) => db.events.find((x) => x.gid === baseGid(gid));

  const toEvent = (e, startOverride, endOverride) => {
    const cal = db.calendars.find((c) => c.id === e.calendarId) || db.calendars[0];
    const start = startOverride || (e.allDay ? new Date(e.start + 'T00:00:00') : new Date(e.start));
    const end = endOverride || (e.allDay ? new Date(e.end + 'T00:00:00') : new Date(e.end));
    const gid = startOverride ? `${e.gid}_${ymd(start).replace(/-/g, '')}` : e.gid;
    const inst = startOverride ? (e.instances || {})[gid] || {} : e;
    return {
      id: `google:${e.calendarId}:${gid}`,
      gid,
      source: 'google',
      calendarId: e.calendarId,
      title: e.title,
      start,
      end,
      allDay: !!e.allDay,
      location: e.location || '',
      description: e.description || '',
      status: e.status || 'busy',
      recurring: !!e.recurringDays,
      meetingUrl: null,
      readOnly: !cal.writable,
      color: null,
      item: !!(inst.item || e.item),
      done: !!inst.done,
      doneAt: inst.doneAt || null,
      reminderMin: e.reminderMin ?? null,
    };
  };

  const fromData = (d, base = {}) => ({
    ...base,
    calendarId: d.calendarId || base.calendarId,
    title: d.title,
    start: d.allDay ? ymd(d.start) : d.start.toISOString(),
    end: d.allDay ? ymd(d.end) : d.end.toISOString(),
    allDay: !!d.allDay,
    location: d.location || '',
    description: d.description || '',
    status: d.status || 'busy',
    reminderMin: d.reminderMin ?? null,
    item: base.item || !!d.item,
  });

  const expand = (calId, from, to) => {
    const out = [];
    for (const e of db.events.filter((x) => x.calendarId === calId)) {
      if (e.recurringDays) {
        // repete semanalmente nos dias indicados (0 = segunda)
        const s0 = new Date(e.start);
        const dur = new Date(e.end) - s0;
        for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
          const idx = (d.getDay() + 6) % 7;
          if (!e.recurringDays.includes(idx) || d < startOfDay(s0)) continue;
          const st = new Date(d);
          st.setHours(s0.getHours(), s0.getMinutes(), 0, 0);
          out.push(toEvent(e, st, new Date(st.getTime() + dur)));
        }
        continue;
      }
      const ev = toEvent(e);
      if (ev.start < to && ev.end > from) out.push(ev);
    }
    return out;
  };

  return {
    kind: 'demo',
    isConnected: () => true,
    isExpired: () => false,
    account: () => ({ email: 'demonstracao@exemplo.com' }),
    async listCalendars() {
      return delay(db.calendars.map((c) => ({ ...c })));
    },
    async listEvents(calId, from, to) {
      return delay(expand(calId, from, to));
    },
    async listItems(calId, from, to) {
      return delay(expand(calId, from, to).filter((e) => e.item));
    },
    async createEvent(calId, d) {
      const e = fromData({ ...d, calendarId: calId }, { gid: uid() });
      db.events.push(e);
      persist();
      return delay(toEvent(e));
    },
    async updateEvent(calId, gid, d) {
      const i = db.events.findIndex((x) => x.gid === baseGid(gid));
      if (i < 0) throw new Error('Evento não encontrado');
      db.events[i] = fromData({ ...d, calendarId: d.calendarId || calId }, db.events[i]);
      persist();
      return delay(toEvent(db.events[i]));
    },
    async deleteEvent(calId, gid) {
      db.events = db.events.filter((x) => x.gid !== baseGid(gid));
      persist();
      return delay(null);
    },
    async setDone(calId, gid, done) {
      const e = findEv(gid);
      if (!e) throw new Error('Evento não encontrado');
      const mark = { item: true, done, doneAt: done ? new Date().toISOString() : null };
      if (e.recurringDays && gid !== e.gid) {
        e.instances = { ...(e.instances || {}), [gid]: mark };
      } else Object.assign(e, mark);
      persist();
      return delay(null);
    },
    reset() {
      db = { ...seed(), week: stamp };
      persist();
    },
  };
}
