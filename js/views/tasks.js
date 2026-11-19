// Aba "Demandas" (Google Tasks + horários reservados no Google Agenda)
import { esc, icon } from '../ui.js';
import { addDays, fDayMonth, fWeekdayShort, hm, parseYmd, ymd } from '../dates.js';

/** Texto de quando a demanda acontece: dia + horário (se tiver). */
function whenLabel(t, block) {
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  const dayOf = (d) => {
    const k = ymd(d);
    return k === today ? 'Hoje' : k === tomorrow ? 'Amanhã' : `${fWeekdayShort(d)}, ${fDayMonth(d)}`;
  };
  if (block) {
    const late = !t.done && block.end < new Date();
    return `<span class="tag ${late ? 'tag-late' : ymd(block.start) === today ? 'tag-warn' : ''}">${icon('clock')}${dayOf(block.start)} · ${hm(block.start)}–${hm(block.end)}</span>`;
  }
  if (!t.due) return '<span class="tag">Sem data</span>';
  const d = parseYmd(t.due);
  const cls = !t.done && t.due < today ? 'tag-late' : t.due === today ? 'tag-warn' : '';
  return `<span class="tag ${cls}">${!t.done && t.due < today ? 'Venceu ' + fDayMonth(d) : dayOf(d)}</span><span class="faint">sem horário</span>`;
}

export function taskRow(ctx, t) {
  const blocks = ctx.data.blocksForTask(t.id);
  const block = blocks.find((b) => b.end > new Date()) || blocks[blocks.length - 1];
  const list = ctx.data.st.taskLists.length > 1 ? ctx.data.st.taskLists.find((l) => l.id === t.listId) : null;
  return `<div class="task-row ${t.done ? 'done' : ''}">
    <button class="tcheck ${t.done ? 'on' : ''}" data-toggle-task="${esc(t.id)}" aria-label="${t.done ? 'Reabrir' : 'Concluir'}: ${esc(t.title)}">${icon('check')}</button>
    <div class="tmain" data-task="${esc(t.id)}" role="button" tabindex="0">
      <div class="tt">${esc(t.title)}</div>
      <div class="ts">${whenLabel(t, block)}${list ? `<span>${esc(list.title)}</span>` : ''}</div>
      ${t.notes && !t.done ? `<div class="tn">${esc(t.notes.slice(0, 120))}${t.notes.length > 120 ? '…' : ''}</div>` : ''}
    </div>
    <span class="tchev" aria-hidden="true">${icon('right')}</span>
  </div>`;
}

/** Data efetiva da demanda: o dia do horário reservado, senão o prazo. */
function effDate(ctx, t) {
  const b = ctx.data.blocksForTask(t.id).find((x) => x.end > new Date());
  return b ? ymd(b.start) : t.due;
}

export function renderTasks(ctx) {
  const { data, state } = ctx;
  if (!data.googleOn()) {
    return `<div class="tasks"><div class="empty">${icon('tasks')}<div>Conecte o Google para usar suas demandas (Google Tasks).</div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="google-login">Conectar Google</button></div></div></div>`;
  }
  data.ensureRange(...data.blockRange()); // para mostrar os horários reservados
  const today = ymd(new Date());
  const tomorrow = ymd(addDays(new Date(), 1));
  const week = ymd(addDays(new Date(), 7));
  const lists = data.st.taskLists;
  const filter = state.taskFilter;
  const all = data.st.tasks.filter((t) => !t.parent && (!filter || t.listId === filter));
  const open = all
    .filter((t) => !t.done)
    .map((t) => ({ t, d: effDate(ctx, t) }))
    .sort((a, b) => (a.d || '9999').localeCompare(b.d || '9999') || a.t.position.localeCompare(b.t.position));
  const cutoff = Date.now() - 14 * 864e5;
  const done = all
    .filter((t) => t.done && (!t.completedAt || new Date(t.completedAt).getTime() > cutoff))
    .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const late = open.filter((x) => x.d && x.d < today);
  const todayL = open.filter((x) => x.d === today);
  const next = open.filter((x) => x.d && x.d > today);
  const view = state.showDone ? 'done' : 'open';

  const groups = [
    ['Atrasadas', late, 'late'],
    ['Hoje', todayL],
    ['Amanhã', open.filter((x) => x.d === tomorrow)],
    ['Próximos 7 dias', open.filter((x) => x.d > tomorrow && x.d <= week)],
    ['Mais adiante', open.filter((x) => x.d > week)],
    ['Sem data', open.filter((x) => !x.d)],
  ];

  const summary = `<div class="task-summary">
    <div class="tsum ${late.length ? 'is-late' : ''}"><b>${late.length}</b><span>atrasada${late.length === 1 ? '' : 's'}</span></div>
    <div class="tsum is-today"><b>${todayL.length}</b><span>para hoje</span></div>
    <div class="tsum"><b>${next.length}</b><span>próximas</span></div>
    <div class="tsum is-done"><b>${done.length}</b><span>concluídas</span></div>
  </div>`;

  const toolbar = `<div class="task-toolbar">
    <div class="segmented" role="tablist">
      <button role="tab" class="${view === 'open' ? 'active' : ''}" data-act="${view === 'open' ? '' : 'toggle-done'}">Pendentes <span class="faint">${open.length}</span></button>
      <button role="tab" class="${view === 'done' ? 'active' : ''}" data-act="${view === 'done' ? '' : 'toggle-done'}">Concluídas <span class="faint">${done.length}</span></button>
    </div>
    ${lists.length > 1 ? `<select class="input input-sm" data-task-list-filter aria-label="Lista">
      <option value="">Todas as listas</option>
      ${lists.map((l) => `<option value="${esc(l.id)}" ${filter === l.id ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}
    </select>` : ''}
  </div>`;

  let body;
  if (view === 'done') {
    body = done.length
      ? done.map((t) => taskRow(ctx, t)).join('')
      : `<div class="empty">${icon('check')}<div>Nenhuma demanda concluída nos últimos 14 dias.</div></div>`;
  } else if (!open.length) {
    body = `<div class="empty">${icon('check')}<div><b>Tudo em dia!</b><br>Nenhuma demanda pendente.</div>
      <div style="margin-top:14px"><button class="btn btn-primary" data-act="new-task">${icon('plus')}Nova demanda</button></div></div>`;
  } else {
    body = groups
      .filter(([, items]) => items.length)
      .map(([title, items, cls]) => `<section class="task-group"><h2 class="group-title ${cls || ''}">${title} <span class="faint">${items.length}</span></h2>${items.map((x) => taskRow(ctx, x.t)).join('')}</section>`)
      .join('');
  }

  return `<div class="tasks">${summary}${toolbar}${body}</div>`;
}

