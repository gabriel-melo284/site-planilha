// Camada de dados: junta Outlook (ICS), Google Agenda e Google Tasks
import { bridge } from './bridge.js';
import { parseIcs, expandRange } from './outlook.js';
import { createGoogleProvider, AuthError } from './google.js';
import { createDemoProvider, demoIcs } from './demo.js';
import { load, save } from './store.js';
import { addMonths, startOfMonth, parseYmd, addDays, ymd } from './dates.js';
import { findConflicts } from './conflicts.js';

const monthKey = (d) => `${d.getFullYear()}-${d.getMonth() + 1}`;

export function createData(settings, onChange) {
  const st = {
    provider: null,
    outlook: { parsed: null, lastSync: null, error: null, loading: false },
    google: { error: null, loading: false, lastSync: null },
    calendars: load('calendars', []),
    taskLists: [],
    tasks: load('tasks', []),
    months: new Map(), // calId → Map(monthKey → events[])
    pending: new Map(),
    expandCache: new Map(),
  };
  const emit = () => onChange?.();

  function setupProvider() {
    st.months.clear();
    st.expandCache.clear();
    st.provider = settings.demo ? createDemoProvider() : createGoogleProvider(settings);
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

  async function refreshTasks() {
    const lists = await st.provider.listTaskLists();
    st.taskLists = lists;
    if (!settings.taskList || !lists.some((l) => l.id === settings.taskList)) settings.taskList = lists[0]?.id || null;
    const all = [];
    for (const l of lists) all.push(...(await st.provider.listTasks(l.id)));
    st.tasks = all;
    if (!settings.demo) save('tasks', all);
  }

  async function refreshGoogle() {
    if (!googleOn()) return;
    st.google.loading = true;
    emit();
    try {
      await refreshCalendars();
      st.months.clear();
      await refreshTasks();
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

  function tasksIn(from, to) {
    if (!settings.showTasks) return [];
    return st.tasks
      .filter((t) => t.due && !t.parent)
      .map((t) => {
        const s = parseYmd(t.due);
        return {
          id: 'task:' + t.id,
          source: 'task',
          task: t,
          title: t.title,
          start: s,
          end: addDays(s, 1),
          allDay: true,
          done: t.done,
          color: settings.taskColor,
          readOnly: false,
        };
      })
      .filter((e) => e.start < to && e.end > from);
  }

  /** Todos os itens (eventos + demandas) no intervalo, com conflitos marcados. */
  function eventsIn(from, to) {
    const tasksById = new Map(st.tasks.map((t) => [t.id, t]));
    const google = googleIn(from, to).map((e) => {
      const t = e.taskId && tasksById.get(e.taskId);
      return t ? { ...e, task: t, done: t.done } : e;
    });
    const withBlock = new Set(google.filter((e) => e.task).map((e) => e.taskId));
    const tasks = tasksIn(from, to).filter((e) => !withBlock.has(e.task.id));
    const list = [...outlookIn(from, to), ...google, ...tasks];
    findConflicts(list);
    return list.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start || b.end - a.end : a.allDay ? -1 : 1));
  }

  /** Recarrega os meses já baixados de uma agenda (sem apagar a tela no meio). */
  async function invalidateCalendar(calId) {
    const map = st.months.get(calId);
    if (!map) return;
    await Promise.all(
      [...map.keys()].map(async (key) => {
        const [y, m] = key.split('-').map(Number);
        const s = new Date(y, m - 1, 1);
        try {
          map.set(key, await st.provider.listEvents(calId, s, addMonths(s, 1)));
        } catch {
          map.delete(key);
        }
      }),
    );
  }

  // ---------- Ações ----------
  async function saveEvent(existing, data) {
    const calId = existing?.calendarId || data.calendarId || settings.defaultCalendar;
    if (!calId) throw new Error('Nenhuma agenda do Google disponível');
    if (existing) await st.provider.updateEvent(calId, existing.gid, data);
    else await st.provider.createEvent(calId, data);
    await invalidateCalendar(calId);
    emit();
  }

  async function deleteEvent(ev) {
    await st.provider.deleteEvent(ev.calendarId, ev.gid);
    await invalidateCalendar(ev.calendarId);
    emit();
  }

  async function saveTask(existing, data) {
    const listId = existing?.listId || data.listId || settings.taskList;
    if (!listId) throw new Error('Nenhuma lista de tarefas disponível');
    let t;
    if (existing) {
      t = await st.provider.updateTask(listId, existing.id, data);
      st.tasks = st.tasks.map((x) => (x.id === existing.id ? { ...x, ...t } : x));
    } else {
      t = await st.provider.createTask(listId, data);
      st.tasks = [t, ...st.tasks];
    }
    if (!settings.demo) save('tasks', st.tasks);
    emit();
    return t;
  }

  async function toggleTask(task) {
    const done = !task.done;
    // atualização otimista
    st.tasks = st.tasks.map((x) => (x.id === task.id ? { ...x, done, completedAt: done ? new Date().toISOString() : null } : x));
    emit();
    try {
      await saveTask(task, { done });
    } catch (e) {
      st.tasks = st.tasks.map((x) => (x.id === task.id ? { ...x, done: !done } : x));
      emit();
      throw e;
    }
  }

  async function deleteTask(task) {
    await st.provider.deleteTask(task.listId, task.id);
    st.tasks = st.tasks.filter((x) => x.id !== task.id);
    if (!settings.demo) save('tasks', st.tasks);
    emit();
  }

  // ---------- Criação unificada (compromisso ou demanda, com data e horário) ----------
  /**
   * existing: { event?, task? }  ·  p: { title, start, end, allDay, location, description,
   *   reminderMin, status, calendarId, isTask, listId }
   */
  async function saveItem(existing, p) {
    const { event, task } = existing || {};
    if (!p.isTask) {
      await saveEvent(event || null, p);
      return;
    }
    const t = await saveTask(task || null, {
      title: p.title,
      notes: p.description || '',
      due: ymd(p.start),
      ...(task ? {} : { listId: p.listId }),
    });
    if (p.allDay) {
      // demanda sem horário: remove o bloco do calendário, se existia
      if (event) await deleteEvent(event);
      return;
    }
    await saveEvent(event || null, { ...p, taskId: t.id });
  }

  async function deleteItem(existing) {
    const { event, task } = existing || {};
    if (task) {
      const blocks = blocksForTask(task.id);
      if (event && !blocks.some((b) => b.id === event.id)) blocks.push(event);
      await deleteTask(task);
      for (const b of blocks) {
        try {
          await st.provider.deleteEvent(b.calendarId, b.gid);
        } catch { /* o bloco pode já ter sido removido */ }
      }
      for (const calId of new Set(blocks.map((b) => b.calendarId))) await invalidateCalendar(calId);
      emit();
    } else if (event) await deleteEvent(event);
  }

  /** Blocos de horário já reservados para uma demanda. */
  const blockRange = () => [addDays(startOfMonth(new Date()), -1), addMonths(startOfMonth(new Date()), 2)];
  function blocksForTask(taskId) {
    const [from, to] = blockRange();
    return googleIn(from, to).filter((e) => e.taskId === taskId).sort((a, b) => a.start - b.start);
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
    saveEvent,
    deleteEvent,
    saveTask,
    toggleTask,
    deleteTask,
    blocksForTask,
    blockRange,
    saveItem,
    deleteItem,
    calColor,
    hasOutlook,
    googleOn,
    visibleCalendars,
    writableCalendars: () => st.calendars.filter((c) => c.writable),
    today: () => ymd(new Date()),
  };
}
