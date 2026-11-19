// Agenda — aplicação principal
import { loadSettings, saveSettings, clearAll, load, save } from './store.js';
import { createData } from './data.js';
import { health } from './bridge.js';
import { AuthError } from './google.js';
import { esc, icon, toast, closeTopModal, confirmDialog, busy } from './ui.js';
import {
  addDays, addMonths, fDayMonth, fFull, fMonthYear, isToday, sameDay, startOfDay, startOfMonth, startOfWeek, ymd, parseYmd,
} from './dates.js';
import { renderTimeline, bindTimeline } from './views/timeline.js';
import { renderMonth, monthRange } from './views/month.js';
import { renderList, renderListResults } from './views/list.js';
import { renderToday } from './views/today.js';
import { renderTasks } from './views/tasks.js';
import { renderSettings } from './views/settings.js';
import { openEventDetail, openEventForm, openTaskForm, openScheduleTask } from './views/forms.js';
import { startReminders, requestPermission, show as showNotification, permission } from './notify.js';

const settings = loadSettings();
const persist = () => saveSettings(settings);

const PAGES = { hoje: 'today', calendario: 'calendar', demandas: 'tasks', ajustes: 'settings' };
const SLUG = Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [v, k]));
const VIEWS = { day: 'Dia', week: 'Semana', month: 'Mês', list: 'Lista' };

const state = {
  page: 'today',
  calView: VIEWS[settings.view] ? settings.view : 'week',
  date: startOfDay(new Date()),
  monthSel: null,
  listDays: 30,
  search: '',
  health: null,
  showDone: false,
  taskFilter: '',
};

const isMobile = () => window.matchMedia('(max-width: 860px)').matches;
if (isMobile() && !localStorageHasView()) state.calView = 'list';
function localStorageHasView() {
  try {
    return JSON.parse(localStorage.getItem('agenda.settings') || '{}').view != null;
  } catch {
    return false;
  }
}

// ---------- Tema ----------
function applyTheme() {
  const root = document.documentElement;
  if (settings.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', settings.theme);
}
applyTheme();

// ---------- Dados ----------
let renderQueued = false;
const scheduleRender = () => {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
};
const data = createData(settings, scheduleRender);

const ctx = {
  data,
  settings,
  state,
  isMobile,
  events(from, to) {
    data.ensureRange(from, to);
    return data.eventsIn(from, to);
  },
  navigate,
  render: scheduleRender,
  newEvent: (prefill) => openEventForm(ctx, null, prefill),
  openEvent: (ev) => openEventDetail(ctx, ev),
};

// ---------- Navegação ----------
function navigate(page, { replace = false } = {}) {
  const hash = '#/' + (SLUG[page] || 'hoje');
  if (location.hash !== hash) {
    if (replace) history.replaceState(null, '', hash);
    else location.hash = hash;
  }
  state.page = page;
  scheduleRender();
}

function readHash() {
  const slug = location.hash.replace(/^#\/?/, '').split('?')[0];
  state.page = PAGES[slug] || 'today';
}

window.addEventListener('hashchange', () => {
  readHash();
  scheduleRender();
});

function setCalView(v) {
  state.calView = v;
  settings.view = v;
  persist();
  if (state.page !== 'calendar') navigate('calendar');
  else scheduleRender();
}

function step(dir) {
  const v = state.calView;
  if (v === 'day') state.date = addDays(state.date, dir);
  else if (v === 'week') state.date = addDays(state.date, 7 * dir);
  else if (v === 'month') {
    state.date = addMonths(startOfMonth(state.date), dir);
    state.monthSel = null;
  } else state.date = addDays(state.date, 30 * dir);
  scheduleRender();
}

function goToday() {
  state.date = startOfDay(new Date());
  state.monthSel = null;
  scheduleRender();
}

function calTitle() {
  const d = state.date;
  if (state.calView === 'day') return fFull(d);
  if (state.calView === 'week') {
    const s = startOfWeek(d, settings.weekStart);
    const e = addDays(s, 6);
    if (s.getMonth() === e.getMonth()) return `${s.getDate()} – ${e.getDate()} de ${fMonthYear(s).toLowerCase()}`;
    return `${fDayMonth(s)} – ${fDayMonth(e)} ${e.getFullYear()}`;
  }
  if (state.calView === 'month') return fMonthYear(d);
  return `A partir de ${fDayMonth(d)}`;
}

// ---------- Estrutura (sidebar, topo, barra inferior) ----------
const pendingCount = () => {
  const today = ymd(new Date());
  return data.st.tasks.filter((t) => !t.done && !t.parent && t.due && t.due <= today).length;
};

function isConfigured() {
  return settings.demo || !!settings.workerUrl;
}

function renderSidebar() {
  const el = document.getElementById('sidebar');
  const cnt = pendingCount();
  const nav = [
    ['today', 'today', 'Hoje'],
    ['calendar', 'calendar', 'Calendário'],
    ['tasks', 'tasks', 'Demandas', cnt],
    ['settings', 'settings', 'Ajustes'],
  ];
  const cals = data.st.calendars;
  const loading = data.st.outlook.loading || data.st.google.loading;
  const err = data.st.outlook.error || data.st.google.error;
  const last = [data.st.outlook.lastSync, data.st.google.lastSync].filter(Boolean).sort((a, b) => b - a)[0];
  el.innerHTML = `
    <div class="brand"><span class="brand-mark">${icon('calendar')}</span>Agenda</div>
    <button class="btn btn-primary btn-block" data-act="new" ${isConfigured() ? '' : 'disabled'}>${icon('plus')}Novo</button>
    <nav class="nav">${nav
      .map(([p, ic, label, c]) => `<button class="nav-item ${state.page === p ? 'active' : ''}" data-nav="${p}">${icon(ic)}${label}${c ? `<span class="count">${c}</span>` : ''}</button>`)
      .join('')}</nav>
    ${isConfigured() ? `<div class="side-section">${miniCalendar()}</div>
    <div class="side-section">
      <h3>Agendas</h3>
      ${data.hasOutlook() ? calToggle('work', settings.workName, settings.workColor, settings.showWork) : ''}
      ${cals.map((c) => calToggle('g:' + c.id, c.name, data.calColor(c.id), !!settings.calendars[c.id]?.visible)).join('')}
      ${data.googleOn() ? calToggle('tasks', 'Demandas', settings.taskColor, settings.showTasks) : ''}
    </div>` : ''}
    <div class="side-foot">
      ${settings.demo ? '<div class="sync-line"><span class="dot off"></span>Modo demonstração</div>' : ''}
      <div class="sync-line"><span class="dot ${err ? 'err' : last ? '' : 'off'}"></span>${
        loading ? 'Sincronizando…' : err ? 'Erro na sincronização' : last ? 'Sincronizado ' + agoShort(last) : 'Não sincronizado'
      }</div>
    </div>`;
}

const agoShort = (d) => {
  const m = Math.round((Date.now() - d) / 60e3);
  return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`;
};

const calToggle = (key, name, color, on) =>
  `<label class="cal-toggle" style="--c:${esc(color)}"><input type="checkbox" data-cal-toggle="${esc(key)}" ${on ? 'checked' : ''}><span class="box"></span><span class="name">${esc(name)}</span></label>`;

function miniCalendar() {
  const base = state.miniMonth || state.date;
  const { start } = monthRange(base, settings.weekStart);
  const wds = Array.from({ length: 7 }, (_, i) => `<span class="wd">${fFull(addDays(start, i)).charAt(0)}</span>`).join('');
  const weekS = startOfWeek(state.date, settings.weekStart);
  const weekE = addDays(weekS, 7);
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const inWeek = state.page === 'calendar' && state.calView === 'week' && d >= weekS && d < weekE;
    cells += `<button class="${d.getMonth() !== base.getMonth() ? 'out' : ''} ${isToday(d) ? 'today' : ''} ${inWeek ? 'inrange' : ''} ${sameDay(d, state.date) && state.page === 'calendar' ? 'sel' : ''}" data-mini-day="${ymd(d)}" aria-label="${fFull(d)}">${d.getDate()}</button>`;
  }
  return `<div class="mini"><div class="mini-head"><span>${fMonthYear(base)}</span>
    <span><button class="btn btn-ghost btn-sm icon-btn" data-mini="-1" aria-label="Mês anterior">${icon('left')}</button><button class="btn btn-ghost btn-sm icon-btn" data-mini="1" aria-label="Próximo mês">${icon('right')}</button></span></div>
    <div class="mini-grid">${wds}${cells}</div></div>`;
}

function renderTopbar() {
  const el = document.getElementById('topbar');
  const loading = data.st.outlook.loading || data.st.google.loading;
  const refreshBtn = isConfigured()
    ? `<button class="btn btn-ghost icon-btn ${loading ? 'spin' : ''}" data-act="refresh" title="Atualizar" aria-label="Atualizar">${icon('refresh')}</button>`
    : '';
  if (state.page === 'calendar') {
    el.innerHTML = `
      <button class="btn btn-sm desktop-only" data-act="today">Hoje</button>
      <button class="btn btn-ghost icon-btn" data-step="-1" aria-label="Anterior">${icon('left')}</button>
      <button class="btn btn-ghost icon-btn" data-step="1" aria-label="Próximo">${icon('right')}</button>
      <h1>${esc(calTitle())}</h1>
      <span class="spacer"></span>
      <button class="btn btn-sm mobile-only" data-act="today">Hoje</button>
      <div class="segmented" role="tablist">${Object.entries(VIEWS)
        .map(([k, l]) => `<button role="tab" aria-selected="${state.calView === k}" class="${state.calView === k ? 'active' : ''}" data-view="${k}">${l}</button>`)
        .join('')}</div>
      ${refreshBtn}`;
  } else {
    const titles = { today: 'Hoje', tasks: 'Demandas', settings: 'Ajustes' };
    el.innerHTML = `<span class="brand-mark mobile-only" style="width:28px;height:28px;border-radius:8px;place-items:center">${icon('calendar')}</span>
      <h1>${titles[state.page]}</h1><span class="spacer"></span>${state.page !== 'settings' ? refreshBtn : ''}`;
  }
}

function renderBottomNav() {
  const cnt = pendingCount();
  const items = [
    ['today', 'today', 'Hoje'],
    ['calendar', 'calendar', 'Calendário'],
    ['tasks', 'tasks', 'Demandas', cnt],
    ['settings', 'settings', 'Ajustes'],
  ];
  document.getElementById('bottomnav').innerHTML = items
    .map(([p, ic, l, c]) => `<button class="${state.page === p ? 'active' : ''}" data-nav="${p}" aria-label="${l}">${icon(ic)}${l}${c ? `<span class="count">${c}</span>` : ''}</button>`)
    .join('');
  const fab = document.getElementById('fab');
  fab.innerHTML = icon('plus');
  fab.hidden = !isConfigured() || state.page === 'settings';
}

function renderWelcome() {
  return `<div class="welcome">
    <div class="brand-mark">${icon('calendar')}</div>
    <h2>Sua agenda, em um só lugar</h2>
    <p>Reuniões do Outlook do trabalho, compromissos pessoais do Google e suas demandas — juntos, sincronizados automaticamente.</p>
    <div class="actions">
      <button class="btn btn-primary" data-nav="settings">Configurar minha agenda</button>
      <button class="btn" data-act="demo-on">Ver demonstração</button>
    </div>
    <div class="features">
      <div class="feature">${icon('briefcase')}<b>Outlook automático</b>Convites de reunião aparecem sozinhos, sem cadastrar nada duas vezes.</div>
      <div class="feature">${icon('user')}<b>Vida pessoal</b>Compromissos no seu Google Agenda, também no celular.</div>
      <div class="feature">${icon('alert')}<b>Sem conflitos</b>Aviso quando algo pessoal bate com uma reunião.</div>
    </div>
  </div>`;
}

// ---------- Renderização ----------
function viewKey() {
  return `${state.page}|${state.calView}|${ymd(state.date)}`;
}
let lastKey = '';

let healthPending = false;
function maybeHealth() {
  if (state.page !== 'settings' || state.health || healthPending || settings.demo || !settings.workerUrl) return;
  healthPending = true;
  health(settings)
    .then((h) => (state.health = h))
    .catch((e) => (state.health = { ok: false, error: e.message }))
    .finally(() => {
      healthPending = false;
      scheduleRender();
    });
}

function render() {
  maybeHealth();
  renderSidebar();
  renderTopbar();
  renderBottomNav();

  const view = document.getElementById('view');
  const key = viewKey();
  const sameView = key === lastKey;
  // preserva rolagem e campos em edição
  const scroll = sameView ? view.scrollTop : 0;
  const tlBody = view.querySelector('#tl-body');
  const tlScroll = sameView && tlBody ? tlBody.scrollTop : null;
  const kept = {};
  view.querySelectorAll('[data-keep]').forEach((i) => (kept[i.id] = i.value));
  const focusId = document.activeElement?.id && view.contains(document.activeElement) ? document.activeElement.id : null;
  const sel = focusId ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;

  let html;
  if (!isConfigured() && state.page !== 'settings') html = renderWelcome();
  else if (state.page === 'today') html = renderToday(ctx);
  else if (state.page === 'tasks') html = renderTasks(ctx);
  else if (state.page === 'settings') html = renderSettings(ctx);
  else if (state.calView === 'day') html = renderTimeline(ctx, startOfDay(state.date), 1);
  else if (state.calView === 'week') html = renderTimeline(ctx, startOfWeek(state.date, settings.weekStart), 7);
  else if (state.calView === 'month') html = renderMonth(ctx);
  else html = renderList(ctx);

  view.innerHTML = html;
  view.dataset.page = state.page;

  for (const [id, v] of Object.entries(kept)) {
    const i = view.querySelector('#' + CSS.escape(id));
    if (i && !i.value) i.value = v;
  }
  if (focusId) {
    const f = view.querySelector('#' + CSS.escape(focusId));
    if (f) {
      f.focus();
      try { if (sel) f.setSelectionRange(sel[0], sel[1]); } catch { /* campos sem seleção */ }
    }
  }
  const newBody = view.querySelector('#tl-body');
  if (newBody && tlScroll != null) {
    newBody.dataset.scrolled = '1';
    newBody.scrollTop = tlScroll;
  }
  if (state.page === 'calendar' && (state.calView === 'day' || state.calView === 'week')) bindTimeline(view, ctx);
  view.scrollTop = scroll;
  lastKey = key;
}

// ---------- Eventos de interface (delegação) ----------
const findEvent = (id) => {
  // procura em uma janela ampla em torno da data atual
  const from = addDays(startOfMonth(state.date), -45);
  const to = addDays(startOfMonth(state.date), 75);
  return (
    data.eventsIn(from, to).find((e) => e.id === id) ||
    data.eventsIn(addDays(new Date(), -7), addDays(new Date(), 14)).find((e) => e.id === id)
  );
};
const findTask = (id) => data.st.tasks.find((t) => t.id === id);

async function toggleTask(id) {
  const t = findTask(id);
  if (!t) return;
  try {
    await data.toggleTask(t);
    if (!t.done) toast('Demanda concluída ✓', 'ok', 2000);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function newItem() {
  if (!isConfigured()) return;
  if (state.page === 'tasks') return openTaskForm(ctx);
  const base = state.page === 'calendar' ? state.monthSel || state.date : new Date();
  const s = new Date(base);
  const now = new Date();
  if (sameDay(s, now)) s.setHours(now.getHours() + 1, 0, 0, 0);
  else s.setHours(9, 0, 0, 0);
  openEventForm(ctx, null, { start: s, end: new Date(s.getTime() + 3600e3) });
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  if (t.closest('.modal-wrap')) return; // modais tratam seus próprios cliques

  const toggle = t.closest('[data-toggle-task]');
  if (toggle) {
    e.stopPropagation();
    return toggleTask(toggle.dataset.toggleTask);
  }
  const sched = t.closest('[data-schedule-task]');
  if (sched) {
    const task = findTask(sched.dataset.scheduleTask);
    return task && openScheduleTask(ctx, task);
  }
  const taskEl = t.closest('[data-task]');
  if (taskEl) {
    const task = findTask(taskEl.dataset.task);
    return task && openTaskForm(ctx, task);
  }
  const evEl = t.closest('[data-ev]');
  if (evEl && !t.closest('a')) {
    const ev = findEvent(evEl.dataset.ev);
    if (ev) openEventDetail(ctx, ev);
    return;
  }
  const nav = t.closest('[data-nav]');
  if (nav) {
    if (nav.dataset.nav === 'calendar' && state.page === 'calendar') goToday();
    return navigate(nav.dataset.nav);
  }
  const v = t.closest('[data-view]');
  if (v) return setCalView(v.dataset.view);
  const st = t.closest('[data-step]');
  if (st) return step(Number(st.dataset.step));
  const gd = t.closest('[data-goto-day]');
  if (gd) {
    state.date = parseYmd(gd.dataset.gotoDay);
    return setCalView('day');
  }
  const md = t.closest('[data-mday]');
  if (md) {
    const d = parseYmd(md.dataset.mday);
    if (isMobile()) {
      state.monthSel = d;
      if (d.getMonth() !== state.date.getMonth()) state.date = startOfMonth(d);
      return scheduleRender();
    }
    state.date = d;
    return setCalView('day');
  }
  const mini = t.closest('[data-mini]');
  if (mini) {
    state.miniMonth = addMonths(startOfMonth(state.miniMonth || state.date), Number(mini.dataset.mini));
    return scheduleRender();
  }
  const miniDay = t.closest('[data-mini-day]');
  if (miniDay) {
    state.date = parseYmd(miniDay.dataset.miniDay);
    state.miniMonth = null;
    state.monthSel = null;
    if (state.page !== 'calendar') navigate('calendar');
    return scheduleRender();
  }
  const filter = t.closest('[data-task-filter]');
  if (filter) {
    state.taskFilter = filter.dataset.taskFilter;
    return scheduleRender();
  }
  const themeBtn = t.closest('[data-theme-set]');
  if (themeBtn) {
    settings.theme = themeBtn.dataset.themeSet;
    persist();
    applyTheme();
    return scheduleRender();
  }
  const act = t.closest('[data-act]');
  if (act) return handleAction(act.dataset.act, act, e);
});

document.getElementById('fab').addEventListener('click', newItem);

async function handleAction(a, btn) {
  switch (a) {
    case 'new':
      return newItem();
    case 'today':
      return goToday();
    case 'refresh':
      return busy(btn, () => data.refreshAll());
    case 'open-day':
      state.date = startOfDay(new Date());
      return setCalView('day');
    case 'list-more':
      state.listDays += 30;
      return scheduleRender();
    case 'toggle-done':
      state.showDone = !state.showDone;
      return scheduleRender();
    case 'google-login':
      if (!settings.workerUrl) {
        toast('Configure a ponte primeiro', 'error');
        return navigate('settings');
      }
      try {
        await busy(btn, () => data.st.provider.startLogin());
      } catch (e) {
        toast(e.message, 'error', 6000);
      }
      return;
    case 'google-logout': {
      const ok = await confirmDialog('Desconectar o Google?', 'Seus dados continuam no Google; apenas este navegador deixa de acessá-los.', { ok: 'Desconectar', danger: true });
      if (!ok) return;
      await data.st.provider.disconnect();
      data.st.calendars = [];
      data.st.tasks = [];
      data.st.taskLists = [];
      data.setupProvider();
      return scheduleRender();
    }
    case 'demo-on':
      return setDemo(true);
    case 'demo-reset':
      data.st.provider.reset?.();
      data.setupProvider();
      await data.refreshAll();
      return toast('Dados de exemplo restaurados', 'ok');
    case 'test-notify': {
      const p = await requestPermission();
      if (p !== 'granted') return toast('Permita as notificações no navegador para receber avisos', 'error');
      const ok = await showNotification('Agenda', 'Os lembretes estão funcionando! 🎉', 'test');
      return toast(ok ? 'Aviso enviado' : 'Não foi possível mostrar o aviso', ok ? 'ok' : 'error');
    }
    case 'copy-config': {
      const cfg = { w: settings.workerUrl, k: settings.accessKey };
      const g = load('google', null);
      if (g?.refresh_token) Object.assign(cfg, { r: g.refresh_token, e: g.email || '' });
      const payload = btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
      const link = `${location.origin}${location.pathname}#/config=${payload}`;
      try {
        await navigator.clipboard.writeText(link);
        toast('Link copiado — abra no outro dispositivo', 'ok');
      } catch {
        prompt('Copie o link:', link);
      }
      return;
    }
    case 'clear-all': {
      const ok = await confirmDialog('Apagar dados deste navegador?', 'Remove configurações, conexão com o Google e cache. Nada é apagado do Outlook ou do Google.', { ok: 'Apagar', danger: true });
      if (!ok) return;
      await data.st.provider.disconnect?.();
      clearAll();
      location.replace(location.pathname);
      return;
    }
  }
}

async function setDemo(on) {
  settings.demo = on;
  persist();
  data.st.calendars = [];
  data.st.tasks = [];
  data.st.taskLists = [];
  data.st.outlook.parsed = null;
  data.st.outlook.error = null;
  data.st.google.error = null;
  data.setupProvider();
  if (!on) {
    // volta a usar o cache real
    location.reload();
    return;
  }
  navigate('today');
  await data.refreshAll();
  toast('Modo demonstração ativado', 'ok');
}

// Mudanças em campos (ajustes, filtros de agenda)
document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.closest('.modal-wrap')) return;
  if (t.dataset.calToggle) {
    const k = t.dataset.calToggle;
    if (k === 'work') settings.showWork = t.checked;
    else if (k === 'tasks') settings.showTasks = t.checked;
    else {
      const id = k.slice(2);
      settings.calendars[id] = { ...(settings.calendars[id] || {}), visible: t.checked };
    }
    persist();
    return scheduleRender();
  }
  if (t.dataset.calVisible) {
    const id = t.dataset.calVisible;
    settings.calendars[id] = { ...(settings.calendars[id] || {}), visible: t.checked };
    persist();
    return scheduleRender();
  }
  if (t.dataset.calColor) {
    const id = t.dataset.calColor;
    settings.calendars[id] = { ...(settings.calendars[id] || {}), color: t.value };
    persist();
    return scheduleRender();
  }
  if (t.dataset.calDefault) {
    settings.defaultCalendar = t.dataset.calDefault;
    persist();
    return toast('Agenda padrão atualizada', 'ok', 1800);
  }
  if (t.dataset.setting) {
    const k = t.dataset.setting;
    settings[k] = t.dataset.num !== undefined ? Number(t.value) : t.value;
    persist();
    if (k === 'refreshMin') startAutoRefresh();
    return scheduleRender();
  }
  if (t.dataset.notify) {
    const k = t.dataset.notify;
    if (k === 'enabled' && t.checked) {
      const p = await requestPermission();
      if (p !== 'granted') {
        t.checked = false;
        toast(p === 'unsupported' ? 'Este navegador não suporta notificações' : 'Permissão de notificação negada', 'error');
        return scheduleRender();
      }
    }
    settings.notify[k] = t.type === 'checkbox' ? t.checked : t.value;
    persist();
    return scheduleRender();
  }
  if (t.dataset.actChange === 'demo') return setDemo(t.checked);
});

// Formulários na página (ponte, adição rápida)
document.addEventListener('submit', async (e) => {
  const f = e.target;
  if (f.closest('.modal-wrap')) return;
  const kind = f.dataset.form;
  if (!kind) return;
  e.preventDefault();
  if (kind === 'bridge') {
    settings.workerUrl = f.workerUrl.value.trim().replace(/\/+$/, '');
    settings.accessKey = f.accessKey.value.trim();
    if (settings.demo) settings.demo = false;
    persist();
    data.setupProvider();
    await busy(f.querySelector('[type=submit]'), async () => {
      try {
        const h = await health(settings);
        state.health = h;
        toast('Ponte conectada!', 'ok');
        await data.refreshAll();
      } catch (err) {
        state.health = { ok: false, error: err.message };
        toast(err.message, 'error', 6000);
      }
    });
    return scheduleRender();
  }
  if (kind === 'import-config') {
    if (applyConfig(f.elements.link.value)) {
      f.elements.link.value = '';
      navigate('today');
      await data.refreshAll();
    } else toast('Link de configuração inválido', 'error');
    return;
  }
  if (kind === 'quick-task') {
    const title = f.elements.title.value.trim();
    if (!title) return;
    const due = f.due?.value || null;
    const listId = f.listId?.value;
    const inputId = f.elements.title.id;
    // limpa antes de salvar (a tela é redesenhada durante o salvamento)
    f.elements.title.value = '';
    if (f.due && f.due.type === 'date') f.due.value = '';
    try {
      await data.saveTask(null, { title, due, listId });
      toast('Demanda adicionada', 'ok', 1800);
    } catch (err) {
      toast(err.message, 'error');
      const i = document.getElementById(inputId);
      if (i) i.value = title;
    }
    return;
  }
});

// Busca na lista (atualiza só os resultados)
document.addEventListener('input', (e) => {
  if (e.target.id === 'list-search') {
    state.search = e.target.value;
    const r = document.getElementById('list-results');
    if (r) r.innerHTML = renderListResults(ctx);
  }
});

// Teclado
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && closeTopModal()) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || e.target.isContentEditable) return;
  if (document.body.classList.contains('modal-open') || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) {
    e.preventDefault();
    e.target.click();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 't') {
    goToday();
    navigate('today');
  } else if (k === 'd') setCalView('day');
  else if (k === 's' || k === 'w') setCalView('week');
  else if (k === 'm') setCalView('month');
  else if (k === 'l') setCalView('list');
  else if (k === 'n') {
    e.preventDefault();
    newItem();
  } else if (state.page === 'calendar' && e.key === 'ArrowLeft') step(-1);
  else if (state.page === 'calendar' && e.key === 'ArrowRight') step(1);
});

// Gesto de deslizar no celular (calendário)
let touch = null;
document.getElementById('view').addEventListener('touchstart', (e) => {
  if (state.page !== 'calendar' || e.touches.length !== 1) return;
  touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
document.getElementById('view').addEventListener('touchend', (e) => {
  if (!touch) return;
  const dx = e.changedTouches[0].clientX - touch.x;
  const dy = e.changedTouches[0].clientY - touch.y;
  const fast = Date.now() - touch.t < 600;
  touch = null;
  if (fast && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2 && state.calView !== 'list') step(dx < 0 ? 1 : -1);
}, { passive: true });

// ---------- Sincronização automática ----------
let refreshTimer = null;
let lastRefresh = 0;
function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') doRefresh();
  }, Math.max(1, settings.refreshMin) * 60e3);
}
async function doRefresh() {
  if (!isConfigured()) return;
  lastRefresh = Date.now();
  await data.refreshAll();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastRefresh > 60e3) doRefresh();
});
window.addEventListener('online', () => doRefresh());

// atualiza linha do "agora", contagens e "Hoje" a cada minuto
setInterval(() => {
  if (document.body.classList.contains('modal-open')) return;
  const a = document.activeElement;
  if (a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName)) return;
  if (state.page === 'today' || state.page === 'calendar') scheduleRender();
}, 60e3);

// ---------- Inicialização ----------
/** Aplica um link/código de configuração vindo de outro dispositivo. */
function applyConfig(text) {
  const m = String(text || '').match(/config=([A-Za-z0-9+/=_-]+)/) || String(text || '').trim().match(/^([A-Za-z0-9+/=_-]{16,})$/);
  if (!m) return false;
  try {
    const cfg = JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')))));
    if (!cfg.w) return false;
    settings.workerUrl = cfg.w;
    settings.accessKey = cfg.k || '';
    settings.demo = false;
    persist();
    if (cfg.r) save('google', { refresh_token: cfg.r, email: cfg.e || '', access_token: null, expires_at: 0 });
    state.health = null;
    data.setupProvider();
    toast(cfg.r ? 'Configuração importada! Tudo conectado.' : 'Configuração importada! Agora conecte o Google.', 'ok', 5000);
    return true;
  } catch {
    return false;
  }
}

function importConfigFromHash() {
  if (!/config=/.test(location.hash)) return false;
  const ok = applyConfig(location.hash);
  history.replaceState(null, '', location.pathname + (ok ? '#/hoje' : '#/ajustes'));
  if (!ok) toast('Link de configuração inválido', 'error');
  return ok;
}

async function init() {
  importConfigFromHash();
  readHash();
  if (!location.hash) history.replaceState(null, '', '#/hoje');

  // retorno do login do Google
  if (!settings.demo && new URLSearchParams(location.search).has('state')) {
    try {
      await data.st.provider.completeLogin();
      toast('Google conectado!', 'ok');
    } catch (e) {
      toast(e.message, 'error', 6000);
    }
  }
  render();

  if (isConfigured()) {
    lastRefresh = Date.now();
    await data.refreshAll();
    if (data.st.google.error && data.st.provider.isExpired?.()) toast('Conecte o Google novamente', 'error', 5000);
  }
  startAutoRefresh();

  startReminders(
    () => {
      const d0 = startOfDay(new Date());
      return { events: data.eventsIn(d0, addDays(d0, 2)), tasks: data.st.tasks, settings };
    },
    (msg) => toast(msg, 'info', 8000),
  );

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (settings.notify.enabled && permission() !== 'granted') {
    settings.notify.enabled = false;
    persist();
  }
}

// erros não tratados viram aviso discreto
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  if (err instanceof AuthError) {
    toast(err.message, 'error', 6000);
    scheduleRender();
  }
});

init();

// exposto para depuração no console
window.__agenda = { settings, state, data };
