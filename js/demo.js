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
  return {
    calendars: [
      { id: 'pessoal', name: 'Pessoal', color: '#16a34a', primary: true, writable: true },
      { id: 'familia', name: 'Família', color: '#db2777', primary: false, writable: true },
    ],
    events: [
      { gid: 'e1', calendarId: 'pessoal', title: 'Academia', start: iso(at(mon, 0, 7)), end: iso(at(mon, 0, 8)), recurringDays: [0, 2, 4] },
      { gid: 'e2', calendarId: 'pessoal', title: 'Dentista', start: iso(at(mon, 2, 14, 30)), end: iso(at(mon, 2, 15, 15)), location: 'Clínica Sorriso' },
      { gid: 'e3', calendarId: 'familia', title: 'Jantar com a família', start: iso(at(mon, 3, 18)), end: iso(at(mon, 3, 20)) },
      { gid: 'e4', calendarId: 'pessoal', title: 'Corrida no parque', start: iso(at(today, 0, 18, 30)), end: iso(at(today, 0, 19, 30)) },
      { gid: 'e5', calendarId: 'familia', title: 'Aniversário da Bia', start: ymd(addDays(mon, 5)), end: ymd(addDays(mon, 6)), allDay: true },
      { gid: 'e6', calendarId: 'pessoal', title: 'Médico — check-up', start: iso(at(today, 0, 16, 30)), end: iso(at(today, 0, 17, 15)), location: 'Hospital Central' },
      { gid: 'e7', calendarId: 'pessoal', title: 'Revisar proposta do fornecedor', start: iso(at(today, 0, 13)), end: iso(at(today, 0, 14)), taskId: 't3' },
    ],
    taskLists: [{ id: 'default', title: 'Minhas tarefas' }],
    tasks: [
      { id: 't1', title: 'Enviar relatório mensal', due: ymd(addDays(today, -1)), notes: 'Incluir gráfico de vendas' },
      { id: 't2', title: 'Pagar conta de luz', due: ymd(today) },
      { id: 't3', title: 'Revisar proposta do fornecedor', due: ymd(today) },
      { id: 't4', title: 'Agendar revisão do carro', due: ymd(addDays(today, 2)) },
      { id: 't5', title: 'Comprar presente da Bia', due: ymd(addDays(mon, 4)) },
      { id: 't6', title: 'Ler artigo sobre OKRs', due: null },
      { id: 't7', title: 'Organizar documentos', due: ymd(addDays(today, -2)), done: true, completedAt: iso(addDays(today, -1)) },
    ].map((t, i) => ({ listId: 'default', notes: '', done: false, completedAt: null, position: String(i).padStart(5, '0'), ...t })),
  };
}

export function createDemoProvider() {
  let db = load('demo', null);
  if (!db || db.week !== ymd(startOfWeek(new Date(), 0))) {
    db = { ...seed(), week: ymd(startOfWeek(new Date(), 0)) };
    save('demo', db);
  }
  const persist = () => save('demo', db);
  const uid = () => Math.random().toString(36).slice(2, 10);
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 60));

  const toEvent = (e, startOverride, endOverride) => {
    const cal = db.calendars.find((c) => c.id === e.calendarId) || db.calendars[0];
    const start = startOverride || (e.allDay ? new Date(e.start + 'T00:00:00') : new Date(e.start));
    const end = endOverride || (e.allDay ? new Date(e.end + 'T00:00:00') : new Date(e.end));
    return {
      id: `google:${e.calendarId}:${e.gid}${startOverride ? ':' + start.getTime() : ''}`,
      gid: e.gid,
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
      taskId: e.taskId || null,
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
    taskId: d.taskId !== undefined ? d.taskId : base.taskId || null,
  });

  return {
    kind: 'demo',
    isConnected: () => true,
    isExpired: () => false,
    account: () => ({ email: 'demonstracao@exemplo.com' }),
    async listCalendars() {
      return delay(db.calendars.map((c) => ({ ...c })));
    },
    async listEvents(calId, from, to) {
      const out = [];
      for (const e of db.events.filter((x) => x.calendarId === calId)) {
        if (e.recurringDays) {
          // repete semanalmente nos dias indicados (0 = segunda)
          const s0 = new Date(e.start);
          const dur = new Date(e.end) - s0;
          for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
            const idx = (d.getDay() + 6) % 7;
            if (!e.recurringDays.includes(idx) || d < startOfDay(s0)) continue;
            const s = new Date(d);
            s.setHours(s0.getHours(), s0.getMinutes(), 0, 0);
            out.push(toEvent(e, s, new Date(s.getTime() + dur)));
          }
          continue;
        }
        const ev = toEvent(e);
        if (ev.start < to && ev.end > from) out.push(ev);
      }
      return delay(out);
    },
    async createEvent(calId, d) {
      const e = fromData({ ...d, calendarId: calId }, { gid: uid() });
      db.events.push(e);
      persist();
      return delay(toEvent(e));
    },
    async updateEvent(calId, gid, d) {
      const i = db.events.findIndex((x) => x.gid === gid);
      if (i < 0) throw new Error('Evento não encontrado');
      db.events[i] = fromData({ ...d, calendarId: d.calendarId || calId }, db.events[i]);
      persist();
      return delay(toEvent(db.events[i]));
    },
    async deleteEvent(calId, gid) {
      db.events = db.events.filter((x) => x.gid !== gid);
      persist();
      return delay(null);
    },
    async listTaskLists() {
      return delay(db.taskLists.map((l) => ({ ...l })));
    },
    async listTasks(listId) {
      return delay(db.tasks.filter((t) => t.listId === listId).map((t) => ({ ...t })));
    },
    async createTask(listId, d) {
      const t = { id: uid(), listId, title: d.title, notes: d.notes || '', due: d.due || null, done: false, completedAt: null, position: '0' };
      db.tasks.unshift(t);
      persist();
      return delay({ ...t });
    },
    async updateTask(listId, id, d) {
      const t = db.tasks.find((x) => x.id === id);
      if (!t) throw new Error('Tarefa não encontrada');
      Object.assign(t, d);
      if (d.done !== undefined) t.completedAt = d.done ? new Date().toISOString() : null;
      persist();
      return delay({ ...t });
    },
    async deleteTask(listId, id) {
      db.tasks = db.tasks.filter((x) => x.id !== id);
      persist();
      return delay(null);
    },
    reset() {
      db = { ...seed(), week: ymd(startOfWeek(new Date(), 0)) };
      persist();
    },
  };
}
