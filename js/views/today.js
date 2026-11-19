// Tela "Hoje": resumo do dia
import { esc, icon } from '../ui.js';
import { addDays, fCountdown, fDayMonth, fDuration, fFull, fWeekdayShort, hm, startOfDay, ymd } from '../dates.js';
import { itemRow } from './list.js';
import { taskRow } from './tasks.js';

function greeting(now) {
  const h = now.getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function renderToday(ctx) {
  const { data, settings } = ctx;
  const now = new Date();
  const d0 = startOfDay(now);
  const d1 = addDays(d0, 1);
  const week = ctx.events(d0, addDays(d0, 7));
  const today = week.filter((e) => e.source !== 'task' && e.start < d1 && e.end > d0);
  const timed = today.filter((e) => !e.allDay && !e.declined);
  const work = timed.filter((e) => e.source === 'outlook');
  const meetingMs = work.reduce((s, e) => s + (Math.min(e.end, d1) - Math.max(e.start, d0)), 0);

  const todayStr = ymd(now);
  const pending = data.st.tasks.filter((t) => !t.done && !t.parent);
  const dueNow = pending.filter((t) => t.due && t.due <= todayStr).sort((a, b) => a.due.localeCompare(b.due));

  // próximo / atual
  const current = timed.find((e) => e.start <= now && e.end > now);
  const next = timed.find((e) => e.start > now);
  const focus = current || next;
  let nextCard;
  if (focus) {
    const rest = current
      ? `Termina ${fCountdown(focus.end, now)} · ${hm(focus.start)}–${hm(focus.end)}`
      : `Começa ${fCountdown(focus.start, now)} · ${hm(focus.start)}–${hm(focus.end)}`;
    nextCard = `<div class="card next-card">
      <h3>${current ? 'Acontecendo agora' : 'Próximo'}</h3>
      <div class="nt">${esc(focus.title)}</div>
      <div class="ns"><span>${icon('clock')}${rest}</span>
        ${focus.location ? `<span>${icon('pin')}${esc(focus.location)}</span>` : ''}
        <span>${icon(focus.source === 'outlook' ? 'briefcase' : 'user')}${focus.source === 'outlook' ? 'Trabalho' : esc(focus.calendarName || 'Pessoal')}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${focus.meetingUrl ? `<a class="btn" href="${esc(focus.meetingUrl)}" target="_blank" rel="noopener noreferrer">${icon('video')}Entrar na reunião</a>` : ''}
        <button class="btn" data-ev="${esc(focus.id)}">Detalhes</button>
      </div>
      ${current && next ? `<div class="ns" style="margin-top:10px;opacity:.8">Depois: ${esc(next.title)} às ${hm(next.start)}</div>` : ''}
    </div>`;
  } else {
    nextCard = `<div class="card next-card"><h3>Agora</h3><div class="nt">Agenda livre pelo resto do dia</div>
      <div class="ns"><span>Bom momento para tocar suas demandas.</span></div></div>`;
  }

  const conflicts = [];
  const seen = new Set();
  for (const e of week) {
    if (!e.conflicts?.length || e.source !== 'outlook') continue;
    for (const id of e.conflicts) {
      const o = week.find((x) => x.id === id);
      const k = [e.id, id].sort().join('|');
      if (!o || seen.has(k) || e.end < now) continue;
      seen.add(k);
      conflicts.push({ work: e, other: o });
    }
  }
  conflicts.sort((a, b) => a.work.start - b.work.start);

  const tomorrow = week.filter((e) => e.source !== 'task' && e.start < addDays(d1, 1) && e.end > d1);
  const tomorrowFirst = tomorrow.find((e) => !e.allDay);

  const connectHint = settings.demo
    ? ''
    : data.st.provider.isExpired?.()
      ? `<div class="card conflict-card"><h3>${icon('alert')}Google desconectado</h3><p class="muted" style="margin:0 0 10px">A autorização expirou. Conecte novamente para sincronizar.</p>
         <button class="btn btn-primary" data-act="google-login">Reconectar</button></div>`
      : !data.googleOn()
        ? `<div class="card"><h3>${icon('user')}Compromissos pessoais</h3><p class="muted" style="margin:0 0 10px">Conecte seu Google para ver e criar compromissos pessoais e demandas.</p>
           <button class="btn btn-primary" data-act="google-login">Conectar Google</button></div>`
        : '';

  return `<div class="today-page">
    <div class="hello">
      <h2>${greeting(now)}!</h2>
      <p>${fFull(now)}</p>
      <div class="stats">
        <div class="stat"><b>${work.length}</b><span>reuniões</span></div>
        <div class="stat"><b>${meetingMs ? fDuration(meetingMs) : '0h'}</b><span>em reuniões</span></div>
        <div class="stat"><b>${timed.length - work.length}</b><span>pessoais</span></div>
        <div class="stat"><b>${dueNow.length}</b><span>demandas p/ hoje</span></div>
      </div>
    </div>
    <div>
      ${nextCard}
      <div class="card agenda-mini">
        <h3>${icon('calendar')}Agenda de hoje <button class="btn btn-sm btn-ghost" data-act="open-day">Ver dia</button></h3>
        ${today.length ? today.map((e) => itemRow(e, { now, compact: true })).join('') : '<p class="faint" style="margin:0">Nenhum compromisso hoje.</p>'}
      </div>
      <div class="card agenda-mini">
        <h3>Amanhã · ${fWeekdayShort(d1)} ${fDayMonth(d1)}</h3>
        ${tomorrow.length
          ? `<p class="muted" style="margin:0 0 8px">${tomorrow.length} compromisso${tomorrow.length > 1 ? 's' : ''}${tomorrowFirst ? `, o primeiro às <b>${hm(tomorrowFirst.start)}</b>` : ''}.</p>
             ${tomorrow.slice(0, 3).map((e) => itemRow(e, { now, compact: true })).join('')}`
          : '<p class="faint" style="margin:0">Dia livre.</p>'}
      </div>
    </div>
    <div>
      ${connectHint}
      ${conflicts.length ? `<div class="card conflict-card"><h3>${icon('alert')}Conflitos (7 dias)</h3>
        ${conflicts.slice(0, 6).map(({ work: w, other: o }) => `<div class="conflict-item">
          <button data-ev="${esc(o.id)}">${esc(o.title)}</button>
          <span class="muted">bate com <b>${esc(w.title)}</b> · ${fWeekdayShort(w.start)} ${fDayMonth(w.start)}, ${hm(w.start)}–${hm(w.end)}</span>
        </div>`).join('')}</div>` : ''}
      <div class="card">
        <h3>${icon('tasks')}Demandas
          <span class="card-actions">${data.googleOn() ? `<button class="btn btn-sm btn-ghost icon-btn" data-act="new-task" aria-label="Nova demanda" title="Nova demanda">${icon('plus')}</button>` : ''}<button class="btn btn-sm btn-ghost" data-nav="tasks">Ver todas</button></span></h3>
        ${dueNow.length ? dueNow.map((t) => taskRow(ctx, t)).join('') : `<p class="faint" style="margin:0">${pending.length ? 'Nada vencendo hoje. 🎉' : 'Nenhuma demanda pendente.'}</p>`}
      </div>
    </div>
  </div>`;
}
