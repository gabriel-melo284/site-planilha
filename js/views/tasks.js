// Aba "Demandas": todos os itens cadastrados, com opção de concluir
import { esc, icon } from '../ui.js';
import { addDays, fDayMonth, fWeekdayShort, hm, startOfDay, ymd } from '../dates.js';

const dayLabel = (d) => {
  const k = ymd(d);
  if (k === ymd(new Date())) return 'Hoje';
  if (k === ymd(addDays(new Date(), 1))) return 'Amanhã';
  if (k === ymd(addDays(new Date(), -1))) return 'Ontem';
  return `${fWeekdayShort(d)}, ${fDayMonth(d)}`;
};

/** Linha de item: círculo para concluir + título + quando. */
export function itemTaskRow(ev) {
  const now = new Date();
  const late = !ev.done && ev.end <= now;
  const when = ev.allDay ? `${dayLabel(ev.start)} · dia inteiro` : `${dayLabel(ev.start)} · ${hm(ev.start)}–${hm(ev.end)}`;
  const isToday = ymd(ev.start) === ymd(now);
  return `<div class="task-row ${ev.done ? 'done' : ''}" style="--c:${esc(ev.color)}">
    <button class="tcheck ${ev.done ? 'on' : ''}" data-toggle-done="${esc(ev.id)}" aria-label="${ev.done ? 'Reabrir' : 'Concluir'}: ${esc(ev.title)}">${icon('check')}</button>
    <div class="tmain" data-ev="${esc(ev.id)}" role="button" tabindex="0">
      <div class="tt">${esc(ev.title)}</div>
      <div class="ts"><span class="tag ${late ? 'tag-late' : isToday && !ev.done ? 'tag-warn' : ''}">${icon('clock')}${when}</span>
        ${ev.location ? `<span>${esc(ev.location)}</span>` : ''}
        ${ev.calendarName ? `<span class="cal-dot"><i style="background:${esc(ev.color)}"></i>${esc(ev.calendarName)}</span>` : ''}</div>
      ${ev.description && !ev.done ? `<div class="tn">${esc(ev.description.replace(/<[^>]+>/g, ' ').slice(0, 120))}</div>` : ''}
    </div>
    <span class="tchev" aria-hidden="true">${icon('right')}</span>
  </div>`;
}

export function renderTasks(ctx) {
  const { data, state } = ctx;
  if (!data.googleOn()) {
    return `<div class="tasks"><div class="empty">${icon('tasks')}<div>Conecte o Google para cadastrar e acompanhar seus itens.</div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="google-login">Conectar Google</button></div></div></div>`;
  }
  const now = new Date();
  const d0 = startOfDay(now);
  const d1 = addDays(d0, 1);
  const d2 = addDays(d0, 2);
  const d8 = addDays(d0, 8);
  const all = data.items();
  const open = all.filter((e) => !e.done).sort((a, b) => a.start - b.start);
  const cutoff = Date.now() - 14 * 864e5;
  const done = all
    .filter((e) => e.done && new Date(e.doneAt || e.end).getTime() > cutoff)
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '') || b.start - a.start);

  const late = open.filter((e) => e.end <= now);
  const pending = open.filter((e) => e.end > now);
  const todayL = pending.filter((e) => e.start < d1);
  const next = pending.filter((e) => e.start >= d1);
  const view = state.showDone ? 'done' : 'open';

  const groups = [
    ['Atrasados', late, 'late'],
    ['Hoje', todayL],
    ['Amanhã', next.filter((e) => e.start < d2)],
    ['Próximos 7 dias', next.filter((e) => e.start >= d2 && e.start < d8)],
    ['Mais adiante', next.filter((e) => e.start >= d8)],
  ];

  const summary = `<div class="task-summary">
    <div class="tsum ${late.length ? 'is-late' : ''}"><b>${late.length}</b><span>atrasado${late.length === 1 ? '' : 's'}</span></div>
    <div class="tsum is-today"><b>${todayL.length}</b><span>hoje</span></div>
    <div class="tsum"><b>${next.length}</b><span>próximos</span></div>
    <div class="tsum is-done"><b>${done.length}</b><span>concluídos</span></div>
  </div>`;

  const toolbar = `<div class="task-toolbar">
    <div class="segmented" role="tablist">
      <button role="tab" class="${view === 'open' ? 'active' : ''}" ${view === 'open' ? '' : 'data-act="toggle-done"'}>Pendentes <span class="faint">${open.length}</span></button>
      <button role="tab" class="${view === 'done' ? 'active' : ''}" ${view === 'done' ? '' : 'data-act="toggle-done"'}>Concluídos <span class="faint">${done.length}</span></button>
    </div>
  </div>`;

  let body;
  if (view === 'done') {
    body = done.length
      ? `<section class="task-group">${done.map(itemTaskRow).join('')}</section>`
      : `<div class="empty">${icon('check')}<div>Nada concluído nos últimos 14 dias.</div></div>`;
  } else if (!open.length) {
    body = `<div class="empty">${icon('check')}<div><b>Tudo em dia!</b><br>Nenhum item pendente.</div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="new">${icon('plus')}Novo</button></div></div>`;
  } else {
    body = groups
      .filter(([, list]) => list.length)
      .map(([title, list, cls]) => `<section class="task-group"><h2 class="group-title ${cls || ''}">${title} <span class="faint">${list.length}</span></h2>${list.map(itemTaskRow).join('')}</section>`)
      .join('');
  }

  return `<div class="tasks">${summary}${toolbar}${body}
    <p class="hint" style="margin-top:18px">Aqui aparecem os itens que você cadastra pelo app. Reuniões do Outlook ficam só no calendário.</p></div>`;
}
