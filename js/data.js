// Camada de dados: junta Outlook (ICS) e Google Agenda. Todo item cadastrado é um evento
// do Google Agenda que pode ser marcado como concluído (aba Demandas).
import { bridge } from './bridge.js';
import { parseIcs, expandRange } from './outlook.js';
import { createGoogleProvider, AuthError } from './google.js';
import { createDemoProvider, demoIcs } from './demo.js';
import { load, save } from './store.js';
import { addMonths, startOfMonth, startOfDay, addDays, ymd } from './dates.js';
import { findConflicts } from './conflicts.js';

const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;
// janela da aba Demandas: 90 dias para trás (atrasados) e 1 ano à frente
export const itemsWindow = () => [addDays(startOfDay(new Date()), -90), addDays(startOfDay(new Date()), 366)];

export function createData(settings, onChange) {
  const st = {
    provider: null,
    outlook: { parsed: null, lastSync: null, error: null, loading: false },
    google: { error: null, loading: false, lastSync: null },
    calendars: load('calendars', []),
    items: [],
    months: new Map(), // calId → Map(monthKey → events[])
    pending: new Map(),
    expandCache: new Map(),
  };
  const emit = () => onChange?.();

  function setupProvider() {
    st.months.clear();
    st.expandCache.clear();
    st.items = settings.demo ? [] : reviveItems(load('items', []));
    st.provider = settings.demo ? createDemoProvider() : createGoogleProvider(settings);
  }

  // cache local dos itens (abre rápido e offline)
  function reviveItems(list) {
    return (list || []).map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
  }
  setupProvider();

  // cache do ICS para abrir rápido / offline
  if (!settings.demo) {
    const cached = load('ics', null);
    if (cached?.text) {
      try {
        st.outlook.parsed = parseIcs(cached.text);
        st.outlook.lastSync = new Date(cached.at);
      } catch { /* ignora cache inválido */ }
    }
  }

  const hasOutlook = () => settings.demo || !!settings.workerUrl;
  const googleOn = () => st.provider.isConnected();

  async function refreshOutlook() {
    if (!hasOutlook()) return;
    st.outlook.loading = true;
    emit();
    try {
      let text;
      if (settings.demo) text = demoIcs();
      else {
        const r = await bridge(settings, '/ics');
        text = await r.text();
        if (!save('ics', { text, at: Date.now() })) save('ics', null);
      }
      st.outlook.parsed = parseIcs(text);
      st.outlook.lastSync = new Date();
      st.outlook.error = null;
      st.expandCache.clear();
    } catch (e) {
      st.outlook.error = e.message || String(e);
    } finally {
      st.outlook.loading = false;
      emit();
    }
  }

  async function refreshCalendars() {
    const cals = await st.provider.listCalendars();
    st.calendars = cals;
    if (!settings.demo) save('calendars', cals);
    // primeira vez: mostra todas as agendas próprias
    for (const c of cals) {
      if (!settings.calendars[c.id]) settings.calendars[c.id] = { visible: c.primary || c.writable, color: null };
    }
    if (!settings.defaultCalendar || !cals.some((c) => c.id === settings.defaultCalendar)) {
      settings.defaultCalendar = (cals.find((c) => c.primary) || cals.find((c) => c.writable) || cals[0])?.id || null;
    }
  }

  /** Baixa os itens (com marcação do app) das agendas que você pode editar. */
  async function refreshItems() {
    const [from, to] = itemsWindow();
    const cals = st.calendars.filter((c) => c.writable);
    const lists = await Promise.all(cals.map((c) => st.provider.listItems(c.id, from, to)));
    st.items = lists.flat();
    if (!settings.demo) save('items', st.items);
  }

  async function refreshGoogle() {
    if (!googleOn()) return;
    st.google.loading = true;
    emit();
    try {
      await refreshCalendars();
      st.months.clear();
      await refreshItems();
      st.google.error = null;
      st.google.lastSync = new Date();
    } catch (e) {
      st.google.error = e.message || String(e);
      if (e instanceof AuthError) st.months.clear();
    } finally {
      st.google.loading = false;
      emit();
    }
  }

  async function refreshAll() {
    await Promise.all([refreshOutlook(), refreshGoogle()]);
  }

  const visibleCalendars = () => st.calendars.filter((c) => settings.calendars[c.id]?.visible);
  const calColor = (id) => settings.calendars[id]?.color || st.calendars.find((c) => c.id === id)?.color || '#16a34a';

  /** Garante que os meses que cobrem [from, to) foram baixados do Google. */
  async function ensureRange(from, to) {
    if (!googleOn() || st.provider.isExpired()) return;
    const jobs = [];
    for (let m = startOfMonth(from); m < to; m = addMonths(m, 1)) {
      const key = monthKey(m);
      for (const cal of visibleCalendars()) {
        if (!st.months.has(cal.id)) st.months.set(cal.id, new Map());
        const map = st.months.get(cal.id);
        const pk = cal.id + '|' + key;
        if (map.has(key) || st.pending.has(pk)) {
          if (st.pending.has(pk)) jobs.push(st.pending.get(pk));
          continue;
        }
        const mStart = new Date(m);
        const p = st.provider
          .listEvents(cal.id, mStart, addMonths(mStart, 1))
          .then((evs) => map.set(key, evs))
          .catch((e) => {
            // evita repetir a requisição a cada redesenho; tenta de novo na próxima sincronização
            map.set(key, []);
            st.google.error = e.message || String(e);
          })
          .finally(() => st.pending.delete(pk));
        st.pending.set(pk, p);
        jobs.push(p);
      }
    }
    if (jobs.length) {
      await Promise.all(jobs);
      emit();
    }
  }

  function outlookIn(from, to) {
    if (!settings.showWork || !st.outlook.parsed) return [];
    const k = `${+from}|${+to}|${settings.workColor}`;
    if (!st.expandCache.has(k)) {
      if (st.expandCache.size > 30) st.expandCache.clear();
      st.expandCache.set(k, expandRange(st.outlook.parsed, from, to, settings.workColor));
    }
    return st.expandCache.get(k).map((e) => ({ ...e, color: settings.workColor }));
  }

  function googleIn(from, to) {
    const out = new Map();
    for (const cal of visibleCalendars()) {
      const map = st.months.get(cal.id);
      if (!map) continue;
      for (const evs of map.values()) {
        for (const e of evs) {
          if (e.start < to && e.end > from && !out.has(e.id)) {
            out.set(e.id, { ...e, color: e.color || calColor(cal.id), calendarName: cal.name });
          }
        }
      }
    }
    return [...out.values()];
  }

  /** Todos os eventos no intervalo, com conflitos marcados. */
  function eventsIn(from, to) {
    const list = [...outlookIn(from, to), ...googleIn(from, to)];
    findConflicts(list);
    return list.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start || b.end - a.end : a.allDay ? -1 : 1));
  }

  /** Itens da aba Demandas (com cor e nome da agenda). */
  function items() {
    const vis = new Set(visibleCalendars().map((c) => c.id));
    return st.items
      .filter((e) => vis.has(e.calendarId))
      .map((e) => ({ ...e, color: e.color || calColor(e.calendarId), calendarName: st.calendars.find((c) => c.id === e.calendarId)?.name }));
  }

  /** Itens pendentes que já passaram (atrasados) ou acontecem hoje. */
  function dueNow() {
    const now = new Date();
    const end = addDays(startOfDay(now), 1);
    return items().filter((e) => !e.done && e.start < end).sort((a, b) => a.start - b.start);
  }

  /** Recarrega os meses já baixados de uma agenda (sem apagar a tela no meio). */
  async function invalidateCalendar(calId) {
    const map = st.months.get(calId);
    const jobs = [refreshItems().catch(() => {})];
    if (map) {
      for (const key of [...map.keys()]) {
        const [y, m] = key.split('-').map(Number);
        const s = new Date(y, m - 1, 1);
        jobs.push(
          st.provider.listEvents(calId, s, addMonths(s, 1)).then(
            (evs) => map.set(key, evs),
            () => map.delete(key),
          ),
        );
      }
    }
    await Promise.all(jobs);
  }

  // ---------- Ações ----------
  /** Cria (sempre como item do app) ou edita um evento no Google Agenda. */
  async function saveEvent(existing, data) {
    const calId = existing?.calendarId || data.calendarId || settings.defaultCalendar;
    if (!calId) throw new Error('Nenhuma agenda do Google disponível');
    if (existing) await st.provider.updateEvent(calId, existing.gid, data);
    else await st.provider.createEvent(calId, { ...data, item: true });
    await invalidateCalendar(calId);
    emit();
  }

  async function deleteEvent(ev) {
    await st.provider.deleteEvent(ev.calendarId, ev.gid);
    await invalidateCalendar(ev.calendarId);
    emit();
  }

  /** Marca/desmarca como concluído (atualização otimista). */
  async function toggleDone(ev) {
    const done = !ev.done;
    const doneAt = done ? new Date().toISOString() : null;
    const patch = (e) => (e.id === ev.id ? { ...e, done, doneAt, item: true } : e);
    const had = st.items.some((e) => e.id === ev.id);
    st.items = had ? st.items.map(patch) : [...st.items, { ...ev, done, doneAt, item: true }];
    for (const map of st.months.values()) for (const [k, evs] of map) map.set(k, evs.map(patch));
    emit();
    try {
      await st.provider.setDone(ev.calendarId, ev.gid, done);
      if (!settings.demo) save('items', st.items);
    } catch (e) {
      const undo = (x) => (x.id === ev.id ? { ...x, done: !done } : x);
      st.items = had ? st.items.map(undo) : st.items.filter((x) => x.id !== ev.id);
      for (const map of st.months.values()) for (const [k, evs] of map) map.set(k, evs.map(undo));
      emit();
      throw e;
    }
  }

  return {
    st,
    settings,
    setupProvider,
    refreshAll,
    refreshOutlook,
    refreshGoogle,
    ensureRange,
    eventsIn,
    items,
    dueNow,
    saveEvent,
    deleteEvent,
    toggleDone,
    calColor,
    hasOutlook,
    googleOn,
    visibleCalendars,
    writableCalendars: () => st.calendars.filter((c) => c.writable),
    today: () => ymd(new Date()),
  };
}
