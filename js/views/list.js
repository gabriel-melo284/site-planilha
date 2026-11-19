// Visão Lista (agenda contínua)
import { esc, icon } from '../ui.js';
import { addDays, fFull, fRelativeDay, hm, isToday, startOfDay } from '../dates.js';

export function sourceTag(ev) {
  if (ev.source === 'outlook') return `<span class="tag tag-work" style="--c:${esc(ev.color)}">${icon('briefcase')}Trabalho</span>`;
  return `<span class="tag">${icon('user')}${esc(ev.calendarName || 'Pessoal')}</span>`;
}

export function itemRow(ev, { now = new Date(), compact = false } = {}) {
  const when = ev.allDay ? 'Dia todo' : `${hm(ev.start)}<br><span class="faint">${hm(ev.end)}</span>`;
  const past = !ev.allDay && ev.end < now;
  const current = !ev.allDay && ev.start <= now && ev.end > now;
  const sub = [];
  if (ev.location) sub.push(`<span>${esc(ev.location)}</span>`);
  if (ev.meetingUrl) sub.push(`<span>${icon('video')} Online</span>`);
  if (ev.status === 'tentative') sub.push('<span>Provisório</span>');
  if (!compact && ev.source === 'outlook') sub.push('<span>Outlook</span>');
  return `<button class="item ${ev.done ? 'done' : ''} ${past ? 'past' : ''} ${current ? 'now' : ''}" data-ev="${esc(ev.id)}" style="--c:${esc(ev.color)}">
    <span class="bar"></span>
    <span class="when">${when}</span>
    <span class="what">
      <span class="t">${ev.conflicts?.length ? `<span class="badge-warn" title="Conflito">${icon('alert')}</span>` : ''}${ev.done ? icon('check') : ''}${esc(ev.title)}</span>
      ${sub.length ? `<span class="s">${sub.join('')}</span>` : ''}
    </span>
  </button>`;
}

export function renderList(ctx) {
  const { state } = ctx;
  return `<div class="list">
    <div class="list-search">
      <div style="position:relative">${icon('search')}
      <input class="input" id="list-search" type="search" placeholder="Buscar compromissos e demandas…" value="${esc(state.search)}" data-keep autocomplete="off"></div>
    </div>
    <div id="list-results">${renderListResults(ctx)}</div>
  </div>`;
}

export function renderListResults(ctx) {
  const { state } = ctx;
  const q = state.search.trim().toLowerCase();
  // na busca, olha também para trás (60 dias) e mais à frente (6 meses)
  const from = q ? addDays(startOfDay(state.date), -60) : startOfDay(state.date);
  const to = q ? addDays(startOfDay(state.date), 180) : addDays(from, state.listDays);
  let items = ctx.events(from, to);
  if (q) items = items.filter((e) => `${e.title} ${e.location || ''} ${e.description || ''}`.toLowerCase().includes(q));
  let html = '';
  for (let d = from; d < to; d = addDays(d, 1)) {
    const dEnd = addDays(d, 1);
    const evs = items.filter((e) => e.start < dEnd && e.end > d);
    if (!evs.length) continue;
    html += `<div class="day-group"><h2 class="${isToday(d) ? 'today' : ''}">${fRelativeDay(d)}${
      fRelativeDay(d) !== fFull(d) ? `<span class="faint">${fFull(d)}</span>` : ''
    }</h2>${evs.map((e) => itemRow(e)).join('')}</div>`;
  }
  if (!html) {
    html = `<div class="empty">${icon('calendar')}<div>${q ? 'Nada encontrado.' : `Nenhum compromisso nos próximos ${state.listDays} dias.`}</div></div>`;
  }
  if (q) return html;
  return html + `<div style="text-align:center;margin-top:10px"><button class="btn" data-act="list-more">Mostrar mais 30 dias</button></div>`;
}

