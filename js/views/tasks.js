// Tela "Demandas" (Google Tasks)
import { esc, icon } from '../ui.js';
import { addDays, fDayMonth, fWeekdayShort, hm, parseYmd, ymd } from '../dates.js';

export function dueLabel(due) {
  if (!due) return '';
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  if (due === today) return '<span class="tag tag-warn">Hoje</span>';
  if (due === tomorrow) return '<span class="tag">Amanhã</span>';
  const d = parseYmd(due);
  if (due < today) return `<span class="tag tag-late">Venceu ${fDayMonth(d)}</span>`;
  return `<span class="tag">${fWeekdayShort(d)}, ${fDayMonth(d)}</span>`;
}

export function taskRow(ctx, t) {
  const blocks = ctx.data.blocksForTask(t.id).filter((b) => b.end > new Date());
  const block = blocks[0];
  const list = ctx.data.st.taskLists.length > 1 ? ctx.data.st.taskLists.find((l) => l.id === t.listId) : null;
  return `<div class="task-row ${t.done ? 'done' : ''}">
    <button class="tcheck ${t.done ? 'on' : ''}" data-toggle-task="${esc(t.id)}" aria-label="${t.done ? 'Reabrir' : 'Concluir'}: ${esc(t.title)}">${t.done ? icon('check') : ''}</button>
    <div class="tmain" data-task="${esc(t.id)}" role="button" tabindex="0">
      <div class="tt">${esc(t.title)}</div>
      <div class="ts">${t.done ? '' : dueLabel(t.due)}
        ${block ? `<span class="tag">${icon('target')}${fWeekdayShort(block.start)} ${hm(block.start)}</span>` : ''}
        ${list ? `<span>${esc(list.title)}</span>` : ''}
        ${t.notes ? `<span title="${esc(t.notes)}">${esc(t.notes.slice(0, 60))}${t.notes.length > 60 ? '…' : ''}</span>` : ''}</div>
    </div>
    ${t.done ? '' : `<div class="tact"><button class="btn btn-ghost btn-sm icon-btn" data-schedule-task="${esc(t.id)}" title="Reservar horário" aria-label="Reservar horário">${icon('target')}</button></div>`}
  </div>`;
}

export function renderTasks(ctx) {
  const { data, state } = ctx;
  if (!data.googleOn()) {
    return `<div class="tasks"><div class="empty">${icon('tasks')}<div>Conecte o Google para usar suas demandas (Google Tasks).</div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="google-login">Conectar Google</button></div></div></div>`;
  }
  data.ensureRange(...data.blockRange()); // para mostrar horários reservados
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  const week = ymd(addDays(new Date(), 7));
  const lists = data.st.taskLists;
  const filter = state.taskFilter;
  const all = data.st.tasks.filter((t) => !t.parent && (!filter || t.listId === filter));
  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.position.localeCompare(b.position);
  const open = all.filter((t) => !t.done).sort(byDue);
  const groups = [
    ['Atrasadas', open.filter((t) => t.due && t.due < today), 'late'],
    ['Hoje', open.filter((t) => t.due === today)],
    ['Amanhã', open.filter((t) => t.due === tomorrow)],
    ['Próximos 7 dias', open.filter((t) => t.due > tomorrow && t.due <= week)],
    ['Mais adiante', open.filter((t) => t.due > week)],
    ['Sem prazo', open.filter((t) => !t.due)],
  ];
  const cutoff = Date.now() - 14 * 864e5;
  const done = all
    .filter((t) => t.done && (!t.completedAt || new Date(t.completedAt).getTime() > cutoff))
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const listOptions = lists.map((l) => `<option value="${esc(l.id)}" ${l.id === (filter || ctx.settings.taskList) ? 'selected' : ''}>${esc(l.title)}</option>`).join('');

  return `<div class="tasks">
    <form class="quick-add" data-form="quick-task">
      <input class="input" name="title" id="tasks-quick" placeholder="Adicionar demanda… (Enter)" autocomplete="off" data-keep required>
      <input class="input" type="date" name="due" id="tasks-quick-due" aria-label="Prazo" data-keep>
      ${lists.length > 1 ? `<select class="input" name="listId" style="flex:none;width:auto" aria-label="Lista">${listOptions}</select>` : ''}
      <button class="btn btn-primary" type="submit">${icon('plus')}<span class="desktop-only">Adicionar</span></button>
    </form>
    ${lists.length > 1 ? `<div class="segmented" style="margin-bottom:8px;flex-wrap:wrap">
      <button class="${!filter ? 'active' : ''}" data-task-filter="">Todas</button>
      ${lists.map((l) => `<button class="${filter === l.id ? 'active' : ''}" data-task-filter="${esc(l.id)}">${esc(l.title)}</button>`).join('')}
    </div>` : ''}
    ${open.length === 0 ? `<div class="empty">${icon('check')}<div>Tudo em dia! Nenhuma demanda pendente.</div></div>` : ''}
    ${groups
      .filter(([, items]) => items.length)
      .map(([title, items, cls]) => `<div class="group-title ${cls || ''}">${title} <span class="faint">${items.length}</span></div>${items.map((t) => taskRow(ctx, t)).join('')}`)
      .join('')}
    ${done.length ? `<div class="group-title">Concluídas recentemente <span class="faint">${done.length}</span>
        <button class="btn btn-ghost btn-sm" data-act="toggle-done">${state.showDone ? 'Ocultar' : 'Mostrar'}</button></div>
        ${state.showDone ? done.map((t) => taskRow(ctx, t)).join('') : ''}` : ''}
  </div>`;
}
