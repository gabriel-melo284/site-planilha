// Visão Mês
import { esc } from '../ui.js';
import { addDays, fFull, fWeekdayShort, hm, isToday, sameDay, startOfMonth, startOfWeek, ymd } from '../dates.js';
import { evClasses, evIcons } from './timeline.js';
import { itemRow } from './list.js';

export function monthRange(date, weekStart) {
  const start = startOfWeek(startOfMonth(date), weekStart);
  return { start, end: addDays(start, 42) };
}

export function renderMonth(ctx) {
  const { state, settings } = ctx;
  const { start, end } = monthRange(state.date, settings.weekStart);
  const items = ctx.events(start, end);
  const month = state.date.getMonth();
  const sel = state.monthSel || state.date;

  const head = Array.from({ length: 7 }, (_, i) => `<div>${fWeekdayShort(addDays(start, i))}</div>`).join('');
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const dEnd = addDays(d, 1);
    const evs = items.filter((e) => e.start < dEnd && e.end > d);
    const max = 3;
    const shown = evs.slice(0, max);
    const chips = shown
      .map(
        (ev) => `<button class="${evClasses(ev)}" style="--c:${esc(ev.color)}" data-ev="${esc(ev.id)}" title="${esc(ev.title)}">
          ${ev.allDay ? '' : `<span class="ev-time">${hm(ev.start)}</span>`}<span class="ev-title">${evIcons(ev)}${esc(ev.title)}</span></button>`,
      )
      .join('');
    const dots = evs.slice(0, 5).map((ev) => `<i style="--c:${esc(ev.color)}"></i>`).join('');
    cells += `<div class="mcell ${d.getMonth() !== month ? 'out' : ''} ${isToday(d) ? 'today' : ''} ${sameDay(d, sel) ? 'sel' : ''}" data-mday="${ymd(d)}" role="button" tabindex="0" aria-label="${fFull(d)}, ${evs.length} itens">
      <div class="mnum">${d.getDate()}</div>${chips}${evs.length > max ? `<div class="mmore">+${evs.length - max} mais</div>` : ''}
      <div class="mdots">${dots}</div></div>`;
  }

  // lista do dia selecionado (aparece no celular)
  const selEnd = addDays(sel, 1);
  const selItems = items.filter((e) => e.start < selEnd && e.end > sel);
  const dayList = `<div class="month-day-list">
    <div class="day-group"><h2 class="${isToday(sel) ? 'today' : ''}">${fFull(sel)}</h2>
    ${selItems.length ? selItems.map((e) => itemRow(e)).join('') : '<p class="faint">Nada marcado.</p>'}</div></div>`;

  return `<div class="month"><div class="month-head">${head}</div><div class="month-grid">${cells}</div></div>${dayList}`;
}
