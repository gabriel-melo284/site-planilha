// Visões Dia e Semana (linha do tempo por hora)
import { esc, icon } from '../ui.js';
import { addDays, addMinutes, fWeekdayShort, hm, isToday, minutesOfDay, combine, ymd } from '../dates.js';

/** Distribui eventos sobrepostos em colunas. */
export function layoutDay(segs) {
  segs.sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [];
  let cols = [];
  let clusterEnd = -1;
  const finish = () => {
    for (const x of cluster) x.cols = cols.length;
    cluster = [];
    cols = [];
  };
  for (const seg of segs) {
    if (seg.s >= clusterEnd && cluster.length) finish();
    let placed = cols.findIndex((end) => end <= seg.s);
    if (placed < 0) {
      placed = cols.length;
      cols.push(seg.e);
    } else cols[placed] = seg.e;
    seg.col = placed;
    cluster.push(seg);
    clusterEnd = Math.max(clusterEnd, seg.e);
  }
  if (cluster.length) finish();
  return segs;
}

export function evClasses(ev) {
  return [
    'ev',
    ev.source === 'task' ? 'ev-task' : '',
    ev.status === 'tentative' ? 'tentative' : '',
    ev.status === 'free' ? 'free' : '',
    ev.declined ? 'declined' : '',
    ev.done ? 'done' : '',
    ev.conflicts?.length ? 'conflict' : '',
  ].join(' ');
}

export function evIcons(ev) {
  let s = '';
  if (ev.conflicts?.length) s += `<span class="badge-warn" title="Conflito de horário">${icon('alert')}</span>`;
  if (ev.taskId) s += icon('target');
  if (ev.meetingUrl) s += icon('video');
  return s;
}

export function allDayChip(ev) {
  if (ev.source === 'task') {
    return `<div class="${evClasses(ev)}" style="--c:${esc(ev.color)}" data-ev="${esc(ev.id)}" title="${esc(ev.title)}">
      <button class="task-check ${ev.done ? 'on' : ''}" data-toggle-task="${esc(ev.task.id)}" aria-label="${ev.done ? 'Reabrir' : 'Concluir'} demanda"></button>
      <span class="ev-title">${esc(ev.title)}</span></div>`;
  }
  return `<button class="${evClasses(ev)}" style="--c:${esc(ev.color)}" data-ev="${esc(ev.id)}" title="${esc(ev.title)}">
    <span class="ev-title">${evIcons(ev)}${esc(ev.title)}</span></button>`;
}

export function renderTimeline(ctx, start, days) {
  const end = addDays(start, days);
  const items = ctx.events(start, end);
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));
  const now = new Date();

  const head = dayList
    .map(
      (d) => `<div class="tl-dayhead ${isToday(d) ? 'today' : ''}" data-goto-day="${ymd(d)}" role="button" tabindex="0" aria-label="Abrir ${fWeekdayShort(d)} ${d.getDate()}">
        <div class="wd">${fWeekdayShort(d)}</div><div class="dn">${d.getDate()}</div></div>`,
    )
    .join('');

  const allDayCells = dayList
    .map((d) => {
      const dEnd = addDays(d, 1);
      const evs = items.filter((e) => e.allDay && e.start < dEnd && e.end > d);
      return `<div class="cell" data-day="${ymd(d)}">${evs.map(allDayChip).join('')}</div>`;
    })
    .join('');
  const hasAllDay = items.some((e) => e.allDay);

  const hours = Array.from({ length: 24 }, (_, h) =>
    h === 0 ? '' : `<span style="top:calc(var(--hour) * ${h})">${String(h).padStart(2, '0')}:00</span>`,
  ).join('');

  const cols = dayList
    .map((d) => {
      const dEnd = addDays(d, 1);
      const segs = items
        .filter((e) => !e.allDay && e.start < dEnd && e.end > d)
        .map((ev) => {
          const s = ev.start < d ? 0 : minutesOfDay(ev.start);
          const e = ev.end >= dEnd ? 1440 : Math.max(minutesOfDay(ev.end), s + 1);
          return { ev, s, e: Math.max(e, s + 20) };
        });
      layoutDay(segs);
      const evHtml = segs
        .map(({ ev, s, e, col, cols }) => {
          const dur = e - s;
          const short = dur < 45;
          const w = 100 / cols;
          return `<button class="${evClasses(ev)}" data-ev="${esc(ev.id)}" title="${esc(ev.title)} · ${hm(ev.start)}–${hm(ev.end)}"
            style="--c:${esc(ev.color)};top:calc(var(--hour) * ${s / 60});height:calc(var(--hour) * ${dur / 60} - 2px);left:calc(${col * w}% + 1px);width:calc(${w}% - 3px)">
            <span class="ev-title">${evIcons(ev)}${esc(ev.title)}${short ? `<span class="ev-time">&nbsp;${hm(ev.start)}</span>` : ''}</span>
            ${short ? '' : `<span class="ev-time">${hm(ev.start)} – ${hm(ev.end)}</span>`}
            ${!short && dur >= 75 && ev.location ? `<span class="ev-time">${esc(ev.location)}</span>` : ''}
          </button>`;
        })
        .join('');
      const nowLine = isToday(d) ? `<div class="tl-now" style="top:calc(var(--hour) * ${minutesOfDay(now) / 60})"></div>` : '';
      const wk = d.getDay() === 0 || d.getDay() === 6;
      return `<div class="tl-col ${isToday(d) ? 'today' : ''} ${wk && days > 1 ? 'weekend' : ''}" data-col="${ymd(d)}">${evHtml}${nowLine}</div>`;
    })
    .join('');

  return `<div class="tl ${days > 1 ? 'tl-week' : 'tl-day'}" style="--days:${days}">
    <div class="tl-head"><div></div>${head}</div>
    ${hasAllDay || ctx.settings.showTasks ? `<div class="tl-allday"><div class="lbl">dia todo</div>${allDayCells}</div>` : ''}
    <div class="tl-body" id="tl-body"><div class="tl-grid"><div class="tl-hours">${hours}</div>${cols}</div></div>
  </div>`;
}

/** Interações: clicar/arrastar no horário vazio cria compromisso. */
export function bindTimeline(root, ctx) {
  const body = root.querySelector('#tl-body');
  if (!body) return;
  // posição inicial de rolagem
  if (body.dataset.scrolled !== '1') {
    const hourPx = body.querySelector('.tl-grid').offsetHeight / 24;
    const viewingToday = !!body.querySelector('.tl-col.today');
    const nowH = new Date().getHours();
    const h = viewingToday && nowH - 1 > ctx.settings.dayStartHour ? nowH - 1 : ctx.settings.dayStartHour;
    body.scrollTop = h * hourPx;
  }
  const scrollbar = body.offsetWidth - body.clientWidth;
  root.querySelector('.tl').style.setProperty('--sbw', scrollbar + 'px');

  let drag = null;
  const minuteAt = (col, clientY) => {
    const r = col.getBoundingClientRect();
    const m = ((clientY - r.top) / r.height) * 1440;
    return Math.max(0, Math.min(1410, Math.floor(m / 30) * 30));
  };
  const fmtM = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const span = (d) => ({ lo: Math.min(d.a, d.cur), hi: Math.max(d.a, d.cur) + 30 });
  const paint = () => {
    if (!drag?.ghost) return;
    const { lo, hi } = span(drag);
    drag.ghost.style.top = `calc(var(--hour) * ${lo / 60})`;
    drag.ghost.style.height = `calc(var(--hour) * ${(hi - lo) / 60})`;
    drag.ghost.textContent = `${fmtM(lo)} – ${fmtM(hi)}`;
  };

  body.addEventListener('pointerdown', (e) => {
    const col = e.target.closest('.tl-col');
    if (!col || e.target.closest('.ev') || e.button !== 0) return;
    const m = minuteAt(col, e.clientY);
    drag = { col, a: m, cur: m, type: e.pointerType, moved: false, y: e.clientY };
    if (e.pointerType === 'mouse') {
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'tl-ghost';
      col.appendChild(drag.ghost);
      paint();
      col.setPointerCapture?.(e.pointerId);
    }
  });
  body.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientY - drag.y) > 8) drag.moved = true;
    if (drag.ghost) {
      drag.cur = minuteAt(drag.col, e.clientY);
      paint();
    }
  });
  const finish = (e, cancel) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.ghost?.remove();
    if (cancel || (d.type !== 'mouse' && d.moved)) return; // toque com rolagem
    let { lo, hi } = span(d);
    if (hi - lo === 30 && d.cur === d.a) hi = lo + 60; // clique simples = 1h
    const base = combine(d.col.dataset.col, '00:00');
    ctx.newEvent({ start: addMinutes(base, lo), end: addMinutes(base, hi) });
  };
  body.addEventListener('pointerup', (e) => finish(e, false));
  body.addEventListener('pointercancel', (e) => finish(e, true));
}

