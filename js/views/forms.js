// Detalhes e formulários: compromissos, demandas e reserva de horário
import { esc, icon, openModal, richText, toast, confirmDialog, busy } from '../ui.js';
import { addDays, addMinutes, combine, fDayMonth, fDuration, fRange, fRelativeDay, fWeekdayShort, hm, startOfDay, ymd, parseYmd } from '../dates.js';
import { conflictsFor } from '../conflicts.js';
import { sourceTag } from './list.js';
import { dueLabel } from './tasks.js';

const REMINDERS = [
  [null, 'Padrão da agenda'],
  [-1, 'Sem lembrete'],
  [0, 'Na hora'],
  [5, '5 min antes'],
  [10, '10 min antes'],
  [15, '15 min antes'],
  [30, '30 min antes'],
  [60, '1 hora antes'],
  [1440, '1 dia antes'],
];

const conflictBox = (list) =>
  list.length
    ? `<div class="warn-box">${icon('alert')}<span>Conflita com: ${list
        .slice(0, 3)
        .map((e) => `<b>${esc(e.title)}</b> (${hm(e.start)}–${hm(e.end)})`)
        .join(', ')}${list.length > 3 ? ` e mais ${list.length - 3}` : ''}</span></div>`
    : '';

const errMsg = (e) => (e && e.message) || 'Algo deu errado';

// ---------------- Detalhes ----------------
export function openEventDetail(ctx, ev) {
  if (ev.source === 'task') return openTaskForm(ctx, ev.task);
  const all = ctx.events(addDays(startOfDay(ev.start), -1), addDays(startOfDay(ev.end), 1));
  const conflicts = (ev.conflicts || []).map((id) => all.find((x) => x.id === id)).filter(Boolean);
  const editable = ev.source === 'google' && !ev.readOnly;
  const task = ev.taskId ? ctx.data.st.tasks.find((t) => t.id === ev.taskId) : null;

  const rows = [];
  rows.push(`<div class="detail-row">${icon('clock')}<div><b>${fRelativeDay(ev.start)}</b><br>${fRange(ev)}${ev.recurring ? ` · ${icon('repeat')} recorrente` : ''}</div></div>`);
  if (ev.location) rows.push(`<div class="detail-row">${icon('pin')}<div>${esc(ev.location)}</div></div>`);
  if (ev.organizer) rows.push(`<div class="detail-row">${icon('user')}<div>Organizador: ${esc(ev.organizer)}</div></div>`);
  if (ev.attendees?.length) {
    rows.push(`<div class="detail-row">${icon('users')}<div>${ev.attendees.length} participante${ev.attendees.length > 1 ? 's' : ''}: ${esc(ev.attendees.slice(0, 6).join(', '))}${ev.attendees.length > 6 ? '…' : ''}</div></div>`);
  }
  if (ev.status === 'tentative') rows.push(`<div class="detail-row">${icon('alert')}<div>Marcado como provisório</div></div>`);
  if (ev.status === 'free') rows.push(`<div class="detail-row">${icon('check')}<div>Aparece como disponível</div></div>`);
  if (task) rows.push(`<div class="detail-row">${icon('target')}<div>Horário reservado para a demanda <a href="#" data-open-task="${esc(task.id)}">${esc(task.title)}</a></div></div>`);

  openModal(
    `<div class="modal-head">
      <span class="color-dot" style="--c:${esc(ev.color)}"></span>
      <div class="grow"><h2 class="modal-title">${esc(ev.title)}</h2>${sourceTag(ev)}</div>
      <button class="btn btn-ghost icon-btn" data-close aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="modal-body">
      ${conflicts.length ? conflictBox(conflicts) : ''}
      ${ev.meetingUrl ? `<a class="btn btn-primary btn-block" style="margin-bottom:12px" href="${esc(ev.meetingUrl)}" target="_blank" rel="noopener noreferrer">${icon('video')}Entrar na reunião</a>` : ''}
      ${rows.join('')}
      ${ev.description ? `<div class="detail-desc">${richText(ev.description)}</div>` : ''}
      ${ev.source === 'outlook' ? '<p class="hint" style="margin:12px 0 0">Reunião do Outlook (somente leitura). Para aceitar, recusar ou alterar, use o Outlook.</p>' : ''}
    </div>
    ${editable ? `<div class="modal-actions">
      <button class="btn btn-danger-ghost left" data-act="delete">${icon('trash')}Excluir</button>
      ${ev.htmlLink ? `<a class="btn btn-ghost" href="${esc(ev.htmlLink)}" target="_blank" rel="noopener noreferrer">${icon('external')}Google</a>` : ''}
      <button class="btn btn-primary" data-act="edit">${icon('edit')}Editar</button>
    </div>` : ''}`,
    {
      label: ev.title,
      onMount(el, close) {
        el.addEventListener('click', async (e) => {
          const t = e.target.closest('[data-act],[data-open-task]');
          if (!t) return;
          e.preventDefault();
          if (t.dataset.openTask) {
            close();
            openTaskForm(ctx, task);
          } else if (t.dataset.act === 'edit') {
            close();
            openEventForm(ctx, ev);
          } else if (t.dataset.act === 'delete') {
            const ok = await confirmDialog('Excluir compromisso?', ev.recurring ? 'Apenas esta ocorrência será excluída.' : `“${ev.title}” será removido do Google Agenda.`, { ok: 'Excluir', danger: true });
            if (!ok) return;
            try {
              await ctx.data.deleteEvent(ev);
              close();
              toast('Compromisso excluído', 'ok');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          }
        });
      },
    },
  );
}

// ---------------- Formulário de compromisso ----------------
export function openEventForm(ctx, ev = null, prefill = {}) {
  const { data, settings } = ctx;
  if (!data.googleOn()) {
    return openModal(
      `<div class="modal-body"><h2 class="modal-title">Conecte o Google</h2>
        <p class="muted">Os compromissos pessoais são salvos no seu Google Agenda. Conecte sua conta nos Ajustes.</p></div>
       <div class="modal-actions"><button class="btn btn-ghost" data-close>Agora não</button><button class="btn btn-primary" data-act="go">Ir para Ajustes</button></div>`,
      { onMount: (el, close) => el.querySelector('[data-act=go]').addEventListener('click', () => { close(); ctx.navigate('settings'); }) },
    );
  }
  const cals = data.writableCalendars();
  const now = new Date();
  let start = ev?.start || prefill.start;
  if (!start) {
    const base = startOfDay(ctx.state.date);
    start = new Date(base);
    const ref = ymd(base) === ymd(now) ? now : null;
    start.setHours(ref ? ref.getHours() + 1 : 9, 0, 0, 0);
  }
  const allDay = ev ? ev.allDay : !!prefill.allDay;
  let end = ev?.end || prefill.end || addMinutes(start, 60);
  const endShown = allDay ? addDays(end, -1) : end;
  const calId = ev?.calendarId || prefill.calendarId || settings.defaultCalendar || cals[0]?.id;
  const title = ev ? ev.title : prefill.title || '';

  openModal(
    `<form data-form="event" novalidate>
      ${!ev ? `<div class="tabs"><div class="segmented"><button type="button" class="active">Compromisso</button><button type="button" data-act="as-task">Demanda</button></div></div>` : ''}
      <div class="modal-body">
        <input class="input input-title" name="title" placeholder="Título do compromisso" value="${esc(title)}" required autofocus autocomplete="off" style="margin-bottom:16px">
        <label class="check" style="margin-bottom:14px"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''}> Dia inteiro</label>
        <div class="row">
          <label class="field"><span>Início</span><input class="input" type="date" name="sd" value="${ymd(start)}" required></label>
          <label class="field" data-time><span>&nbsp;</span><input class="input" type="time" name="st" value="${hm(start)}" step="300"></label>
        </div>
        <div class="row">
          <label class="field"><span>Fim</span><input class="input" type="date" name="ed" value="${ymd(endShown)}" required></label>
          <label class="field" data-time><span>&nbsp;</span><input class="input" type="time" name="et" value="${hm(end)}" step="300"></label>
        </div>
        <div id="conflict-slot"></div>
        ${!ev && cals.length > 1 ? `<label class="field"><span>Agenda</span><select class="input" name="calendarId">${cals.map((c) => `<option value="${esc(c.id)}" ${c.id === calId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Local ou link</span><input class="input" name="location" value="${esc(ev?.location || '')}" placeholder="Opcional" autocomplete="off"></label>
        <div class="row">
          <label class="field"><span>Lembrete</span><select class="input" name="reminder">${REMINDERS.map(([v, l]) => `<option value="${v}" ${(ev?.reminderMin ?? null) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Mostrar como</span><select class="input" name="status"><option value="busy">Ocupado</option><option value="free" ${ev?.status === 'free' ? 'selected' : ''}>Disponível</option></select></label>
        </div>
        <label class="field"><span>Descrição</span><textarea class="input" name="description" rows="3" placeholder="Opcional">${esc(ev?.description || '')}</textarea></label>
        ${ev?.recurring ? '<p class="hint">As alterações valem só para esta ocorrência.</p>' : ''}
      </div>
      <div class="modal-actions">
        ${ev ? `<button type="button" class="btn btn-danger-ghost left" data-act="delete">${icon('trash')}Excluir</button>` : ''}
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn-primary">${ev ? 'Salvar' : 'Criar'}</button>
      </div>
    </form>`,
    {
      label: ev ? 'Editar compromisso' : 'Novo compromisso',
      wide: true,
      onMount(el, close) {
        const f = el.querySelector('form');
        const timeFields = el.querySelectorAll('[data-time]');
        let lastDur = end - start;
        const read = () => {
          const ad = f.allDay.checked;
          const s = ad ? parseYmd(f.sd.value) : combine(f.sd.value, f.st.value);
          let e = ad ? addDays(parseYmd(f.ed.value), 1) : combine(f.ed.value, f.et.value);
          return { ad, s, e };
        };
        const refresh = () => {
          const ad = f.allDay.checked;
          timeFields.forEach((x) => (x.hidden = ad));
          const { s, e } = read();
          const slot = el.querySelector('#conflict-slot');
          if (ad || !(e > s) || isNaN(s)) {
            slot.innerHTML = !ad && e <= s ? `<div class="warn-box">${icon('alert')}<span>O fim precisa ser depois do início.</span></div>` : '';
            return;
          }
          const around = ctx.events(addDays(startOfDay(s), -1), addDays(startOfDay(e), 1));
          slot.innerHTML = conflictBox(conflictsFor(around, s, e, ev?.id));
        };
        // ao mudar o início, mantém a duração
        const onStart = () => {
          const { ad, s } = read();
          if (isNaN(s)) return;
          const ne = ad ? addDays(s, Math.max(0, Math.round(lastDur / 864e5) - 1)) : new Date(s.getTime() + lastDur);
          f.ed.value = ymd(ne);
          if (!ad) f.et.value = hm(ne);
          refresh();
        };
        f.sd.addEventListener('change', onStart);
        f.st.addEventListener('change', onStart);
        const onEnd = () => {
          const { s, e } = read();
          if (e > s) lastDur = e - s;
          refresh();
        };
        f.ed.addEventListener('change', onEnd);
        f.et.addEventListener('change', onEnd);
        f.allDay.addEventListener('change', refresh);
        refresh();

        el.querySelector('[data-act=as-task]')?.addEventListener('click', () => {
          close();
          openTaskForm(ctx, null, { title: f.elements.title.value, due: f.sd.value });
        });
        el.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
          const ok = await confirmDialog('Excluir compromisso?', `“${ev.title}” será removido.`, { ok: 'Excluir', danger: true });
          if (!ok) return;
          try {
            await data.deleteEvent(ev);
            close();
            toast('Compromisso excluído', 'ok');
          } catch (err) {
            toast(errMsg(err), 'error');
          }
        });
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const t = f.elements.title.value.trim();
          if (!t) {
            f.elements.title.focus();
            return toast('Dê um título ao compromisso', 'error');
          }
          const { ad, s, e: en } = read();
          if (isNaN(s) || isNaN(en) || en <= s) return toast('Verifique as datas e horários', 'error');
          const rem = f.reminder.value;
          const payload = {
            title: t,
            start: s,
            end: en,
            allDay: ad,
            location: f.location.value.trim(),
            description: f.description.value,
            reminderMin: rem === 'null' ? null : Number(rem),
            status: f.status.value,
            calendarId: f.calendarId?.value || calId,
          };
          if (prefill.taskId) payload.taskId = prefill.taskId;
          await busy(f.querySelector('[type=submit]'), async () => {
            try {
              await data.saveEvent(ev, payload);
              close();
              toast(ev ? 'Compromisso atualizado' : 'Compromisso criado', 'ok');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          });
        });
      },
    },
  );
}

// ---------------- Formulário de demanda ----------------
export function openTaskForm(ctx, task = null, prefill = {}) {
  const { data, settings } = ctx;
  if (!data.googleOn()) return openEventForm(ctx); // mostra o aviso de conectar
  const lists = data.st.taskLists;
  const blocks = task ? data.blocksForTask(task.id) : [];
  openModal(
    `<form data-form="task" novalidate>
      ${!task ? `<div class="tabs"><div class="segmented"><button type="button" data-act="as-event">Compromisso</button><button type="button" class="active">Demanda</button></div></div>` : ''}
      <div class="modal-body">
        ${task ? `<div style="margin-bottom:10px">${task.done ? '<span class="tag">Concluída</span>' : dueLabel(task.due)}</div>` : ''}
        <input class="input input-title" name="title" placeholder="O que precisa ser feito?" value="${esc(task?.title || prefill.title || '')}" required autofocus autocomplete="off" style="margin-bottom:16px">
        <div class="row">
          <label class="field"><span>Prazo</span><input class="input" type="date" name="due" value="${esc(task ? task.due || '' : prefill.due ?? ymd(new Date()))}"></label>
          ${!task && lists.length > 1 ? `<label class="field"><span>Lista</span><select class="input" name="listId">${lists.map((l) => `<option value="${esc(l.id)}" ${l.id === settings.taskList ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}</select></label>` : ''}
        </div>
        <label class="field"><span>Notas</span><textarea class="input" name="notes" rows="3" placeholder="Detalhes, links, próximos passos…">${esc(task?.notes || '')}</textarea></label>
        ${!task ? `<label class="check"><input type="checkbox" name="schedule"> Reservar horário no calendário depois de criar</label>` : ''}
        ${task ? `<div class="field-label" style="margin:6px 0 6px">Horários reservados</div>
          ${blocks.length ? blocks.map((b) => `<button type="button" class="item" data-block="${esc(b.id)}" style="--c:${esc(b.color)}"><span class="bar"></span><span class="what"><span class="t">${fWeekdayShort(b.start)}, ${fDayMonth(b.start)} · ${hm(b.start)}–${hm(b.end)}</span></span></button>`).join('') : '<p class="faint" style="margin:0 0 8px">Nenhum horário reservado.</p>'}
          ${!task.done ? `<button type="button" class="btn btn-sm" data-act="schedule">${icon('target')}Reservar horário</button>` : ''}` : ''}
      </div>
      <div class="modal-actions">
        ${task ? `<button type="button" class="btn btn-danger-ghost left" data-act="delete">${icon('trash')}Excluir</button>
          <button type="button" class="btn" data-act="toggle">${task.done ? 'Reabrir' : `${icon('check')}Concluir`}</button>` : '<button type="button" class="btn btn-ghost" data-close>Cancelar</button>'}
        <button type="submit" class="btn btn-primary">${task ? 'Salvar' : 'Criar demanda'}</button>
      </div>
    </form>`,
    {
      label: task ? 'Editar demanda' : 'Nova demanda',
      wide: true,
      onMount(el, close) {
        const f = el.querySelector('form');
        el.querySelector('[data-act=as-event]')?.addEventListener('click', () => {
          const d = f.due.value || ymd(ctx.state.date);
          close();
          openEventForm(ctx, null, { title: f.elements.title.value, start: combine(d, '09:00'), end: combine(d, '10:00') });
        });
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-act],[data-block]');
          if (!b) return;
          if (b.dataset.block) {
            const ev = blocks.find((x) => x.id === b.dataset.block);
            close();
            if (ev) openEventDetail(ctx, ev);
            return;
          }
          const act = b.dataset.act;
          if (act === 'schedule') {
            close();
            openScheduleTask(ctx, task);
          } else if (act === 'toggle') {
            try {
              await data.toggleTask(task);
              close();
              toast(task.done ? 'Demanda reaberta' : 'Demanda concluída', 'ok');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          } else if (act === 'delete') {
            const ok = await confirmDialog('Excluir demanda?', `“${task.title}” será removida do Google Tasks.`, { ok: 'Excluir', danger: true });
            if (!ok) return;
            try {
              await data.deleteTask(task);
              close();
              toast('Demanda excluída', 'ok');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          }
        });
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = f.elements.title.value.trim();
          if (!title) {
            f.elements.title.focus();
            return toast('Descreva a demanda', 'error');
          }
          const payload = { title, notes: f.notes.value, due: f.due.value || null };
          if (f.listId) payload.listId = f.listId.value;
          await busy(f.querySelector('[type=submit]'), async () => {
            try {
              const saved = await data.saveTask(task, payload);
              close();
              toast(task ? 'Demanda atualizada' : 'Demanda criada', 'ok');
              if (!task && f.schedule?.checked) openScheduleTask(ctx, saved);
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          });
        });
      },
    },
  );
}

// ---------------- Reservar horário ----------------
/** Procura o primeiro intervalo livre (sem eventos ocupados) a partir de um dia. */
export function findFreeSlot(events, fromDay, minutes, { startHour = 8, endHour = 19, days = 10, now = new Date() } = {}) {
  for (let i = 0; i < days; i++) {
    const day = addDays(startOfDay(fromDay), i);
    let t = new Date(day);
    t.setHours(startHour, 0, 0, 0);
    const limit = new Date(day);
    limit.setHours(endHour, 0, 0, 0);
    if (t < now) {
      t = new Date(now);
      t.setSeconds(0, 0);
      const m = t.getMinutes();
      t.setMinutes(m <= 0 ? 0 : m <= 30 ? 30 : 60);
    }
    const busyList = events
      .filter((e) => !e.allDay && !e.declined && e.status !== 'free' && e.source !== 'task' && e.end > t && e.start < limit)
      .sort((a, b) => a.start - b.start);
    for (const b of busyList) {
      if (addMinutes(t, minutes) <= b.start) break;
      if (b.end > t) {
        t = new Date(b.end);
        const m = t.getMinutes();
        if (m % 15) t.setMinutes(m + (15 - (m % 15)), 0, 0);
      }
    }
    if (addMinutes(t, minutes) <= limit) return t;
  }
  return null;
}

export function openScheduleTask(ctx, task) {
  const { data, settings } = ctx;
  const cals = data.writableCalendars();
  const today = startOfDay(new Date());
  const due = task.due ? parseYmd(task.due) : null;
  const evs = ctx.events(today, addDays(today, 14));
  const suggestion = findFreeSlot(evs, today, 60) || combine(ymd(addDays(today, 1)), '09:00');

  openModal(
    `<form novalidate>
      <div class="modal-body">
        <h2 class="modal-title">Reservar horário</h2>
        <p class="muted" style="margin:0 0 16px">${icon('target')} ${esc(task.title)}</p>
        <div class="row">
          <label class="field"><span>Dia</span><input class="input" type="date" name="d" value="${ymd(suggestion)}" required></label>
          <label class="field"><span>Início</span><input class="input" type="time" name="t" value="${hm(suggestion)}" step="300" required></label>
        </div>
        <label class="field"><span>Duração</span><select class="input" name="dur">${[15, 30, 45, 60, 90, 120, 180, 240].map((m) => `<option value="${m}" ${m === 60 ? 'selected' : ''}>${fDuration(m * 60e3)}</option>`).join('')}</select></label>
        ${cals.length > 1 ? `<label class="field"><span>Agenda</span><select class="input" name="cal">${cals.map((c) => `<option value="${esc(c.id)}" ${c.id === settings.defaultCalendar ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        <div id="sched-conflict"></div>
        <button type="button" class="btn btn-sm" data-act="next-free">${icon('search')}Encontrar horário livre</button>
        ${due ? `<p class="hint" style="margin:10px 0 0">Prazo da demanda: ${fRelativeDay(due)}</p>` : ''}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close>Cancelar</button>
        <button type="submit" class="btn btn-primary">Reservar</button>
      </div>
    </form>`,
    {
      label: 'Reservar horário',
      onMount(el, close) {
        const f = el.querySelector('form');
        const read = () => {
          const s = combine(f.d.value, f.t.value);
          return { s, e: addMinutes(s, Number(f.dur.value)) };
        };
        const refresh = () => {
          const { s, e } = read();
          if (isNaN(s)) return;
          const around = ctx.events(addDays(startOfDay(s), -1), addDays(startOfDay(s), 2));
          const list = around.filter((x) => !x.allDay && x.source !== 'task' && x.status !== 'free' && !x.declined && x.start < e && s < x.end);
          el.querySelector('#sched-conflict').innerHTML = conflictBox(list);
        };
        ['change', 'input'].forEach((t) => f.addEventListener(t, refresh));
        refresh();
        el.querySelector('[data-act=next-free]').addEventListener('click', () => {
          const { s } = read();
          const base = isNaN(s) ? new Date() : s;
          const evs2 = ctx.events(startOfDay(base), addDays(startOfDay(base), 14));
          const slot = findFreeSlot(evs2, base, Number(f.dur.value), { now: base > new Date() ? base : new Date() });
          if (!slot) return toast('Nenhum horário livre encontrado nos próximos dias', 'error');
          f.d.value = ymd(slot);
          f.t.value = hm(slot);
          refresh();
        });
        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const { s, e: en } = read();
          if (isNaN(s)) return toast('Escolha dia e horário', 'error');
          await busy(f.querySelector('[type=submit]'), async () => {
            try {
              await data.saveEvent(null, {
                title: task.title,
                start: s,
                end: en,
                allDay: false,
                description: task.notes || '',
                calendarId: f.cal?.value || settings.defaultCalendar,
                taskId: task.id,
                reminderMin: null,
                status: 'busy',
              });
              close();
              toast(`Reservado: ${fWeekdayShort(s)} ${hm(s)}`, 'ok');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          });
        });
      },
    },
  );
}
