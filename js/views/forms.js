// Detalhes e formulário único de criação/edição (compromisso ou demanda, com data e horário)
import { esc, icon, openModal, richText, toast, confirmDialog, busy } from '../ui.js';
import { addDays, addMinutes, combine, fRange, fRelativeDay, hm, startOfDay, ymd, parseYmd, sameDay } from '../dates.js';
import { conflictsFor } from '../conflicts.js';
import { sourceTag } from './list.js';

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

/** Bloco de horário de uma demanda (o próximo; se não houver, o mais recente). */
function blockOf(ctx, task) {
  const blocks = ctx.data.blocksForTask(task.id);
  return blocks.find((b) => b.end > new Date()) || blocks[blocks.length - 1] || null;
}

/** Abre uma demanda para edição (com o horário reservado, se existir). */
export function openTask(ctx, task) {
  openItemForm(ctx, { task, event: blockOf(ctx, task) });
}

// ---------------- Detalhes ----------------
export function openEventDetail(ctx, ev) {
  if (ev.source === 'task') return openTask(ctx, ev.task);
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
  if (task) rows.push(`<div class="detail-row">${icon('tasks')}<div>Demanda${task.done ? ' <b>concluída</b>' : ' pendente'}</div></div>`);

  openModal(
    `<div class="modal-head">
      <span class="color-dot" style="--c:${esc(ev.color)}"></span>
      <div class="grow"><h2 class="modal-title">${esc(ev.title)}</h2>${task ? '<span class="tag tag-warn">' + icon('tasks') + 'Demanda</span>' : sourceTag(ev)}</div>
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
      <button class="btn btn-danger-ghost left icon-btn" data-act="delete" aria-label="Excluir" title="Excluir">${icon('trash')}</button>
      ${task ? `<button class="btn" data-act="toggle">${task.done ? 'Reabrir' : `${icon('check')}Concluir`}</button>` : ''}
      <button class="btn btn-primary" data-act="edit">${icon('edit')}Editar</button>
    </div>` : ''}`,
    {
      label: ev.title,
      onMount(el, close) {
        el.addEventListener('click', async (e) => {
          const t = e.target.closest('[data-act]');
          if (!t) return;
          e.preventDefault();
          const act = t.dataset.act;
          if (act === 'edit') {
            close();
            openItemForm(ctx, { event: ev, task });
          } else if (act === 'toggle') {
            try {
              await ctx.data.toggleTask(task);
              close();
              toast(task.done ? 'Demanda reaberta' : 'Demanda concluída ✓', 'ok');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          } else if (act === 'delete') {
            const msg = task
              ? `A demanda “${task.title}” e o horário reservado serão excluídos.`
              : ev.recurring
                ? 'Apenas esta ocorrência será excluída.'
                : `“${ev.title}” será removido do Google Agenda.`;
            const ok = await confirmDialog(task ? 'Excluir demanda?' : 'Excluir compromisso?', msg, { ok: 'Excluir', danger: true });
            if (!ok) return;
            try {
              await ctx.data.deleteItem({ event: ev, task });
              close();
              toast('Excluído', 'ok');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          }
        });
      },
    },
  );
}

// ---------------- Formulário único ----------------
function needGoogle(ctx) {
  return openModal(
    `<div class="modal-body"><h2 class="modal-title">Conecte o Google</h2>
      <p class="muted">Compromissos pessoais e demandas são salvos no seu Google Agenda e Google Tasks. Conecte sua conta nos Ajustes.</p></div>
     <div class="modal-actions"><button class="btn btn-ghost" data-close>Agora não</button><button class="btn btn-primary" data-act="go">Ir para Ajustes</button></div>`,
    {
      onMount: (el, close) =>
        el.querySelector('[data-act=go]').addEventListener('click', () => {
          close();
          ctx.navigate('settings');
        }),
    },
  );
}

/**
 * existing: { event?, task? } (vazio = novo)
 * prefill: { start, end, allDay, isTask, title }
 */
export function openItemForm(ctx, existing = {}, prefill = {}) {
  const { data, settings } = ctx;
  if (!data.googleOn()) return needGoogle(ctx);
  const event = existing.event || null;
  const task = existing.task || (event?.taskId ? data.st.tasks.find((t) => t.id === event.taskId) : null) || null;
  const isNew = !event && !task;
  const cals = data.writableCalendars();
  const lists = data.st.taskLists;
  const now = new Date();

  let isTask = isNew ? !!prefill.isTask : !!task;
  let allDay;
  let start;
  let end;
  if (event) {
    ({ start, end, allDay } = event);
  } else if (task) {
    allDay = true;
    start = task.due ? parseYmd(task.due) : startOfDay(now);
    end = addDays(start, 1);
  } else if (prefill.start) {
    start = prefill.start;
    end = prefill.end || addMinutes(start, 60);
    allDay = !!prefill.allDay;
  } else {
    // sugestão: próximo horário livre (demandas) ou a próxima hora cheia
    const base = startOfDay(ctx.state.date || now);
    const from = base < startOfDay(now) ? startOfDay(now) : base;
    const slot = isTask ? findFreeSlot(ctx.events(from, addDays(from, 10)), from, 60) : null;
    start = slot || new Date(from);
    if (!slot) {
      if (sameDay(from, now)) start.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
      else start.setHours(9, 0, 0, 0);
    }
    end = addMinutes(start, 60);
    allDay = false;
  }
  // horário padrão para quando "dia inteiro" for desmarcado
  const defTime = allDay ? combine(ymd(start), `${String(Math.min(now.getHours() + 1, 23)).padStart(2, '0')}:00`) : start;
  const defEnd = allDay ? addMinutes(defTime, 60) : end;
  const endDay = allDay ? addDays(end, -1) : end;
  const multiDay = allDay ? !sameDay(start, endDay) : end - start > 864e5 || (!sameDay(start, end) && +end !== +startOfDay(end));
  const calId = event?.calendarId || settings.defaultCalendar || cals[0]?.id;
  const title = event?.title ?? task?.title ?? prefill.title ?? '';
  const description = event?.description ?? task?.notes ?? '';
  const heading = isNew ? 'Novo' : isTask ? 'Editar demanda' : 'Editar compromisso';

  openModal(
    `<form data-form="item" novalidate>
      <div class="modal-head">
        <div class="grow"><h2 class="modal-title">${heading}</h2>
          ${!isNew && task ? `<span class="tag ${task.done ? '' : 'tag-warn'}">${icon('tasks')}${task.done ? 'Demanda concluída' : 'Demanda'}</span>` : ''}</div>
        <button type="button" class="btn btn-ghost icon-btn" data-close aria-label="Fechar">${icon('x')}</button>
      </div>
      <div class="modal-body">
        <input class="input input-title" name="title" placeholder="${isTask ? 'O que precisa ser feito?' : 'Título'}" value="${esc(title)}" required autofocus autocomplete="off">
        ${isNew ? `<label class="switch-row">
          <input type="checkbox" name="isTask" ${isTask ? 'checked' : ''}>
          <span class="switch" aria-hidden="true"></span>
          <span class="switch-text"><b>É uma demanda</b><small>Aparece na aba Demandas e pode ser marcada como concluída</small></span>
        </label>` : ''}
        <div class="dt-grid">
          <label class="field dt-date"><span>Data</span><input class="input" type="date" name="d" value="${ymd(start)}" required></label>
          <label class="field dt-time" data-time><span>Início</span><input class="input" type="time" name="st" value="${hm(allDay ? defTime : start)}" step="300"></label>
          <label class="field dt-time" data-time><span>Fim</span><input class="input" type="time" name="et" value="${hm(allDay ? defEnd : end)}" step="300"></label>
        </div>
        <div class="dt-extra">
          <label class="check"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''}> <span data-allday-label>${isTask ? 'Sem horário definido' : 'Dia inteiro'}</span></label>
          <button type="button" class="link-btn" data-act="free" data-time>${icon('search')}Sugerir horário livre</button>
        </div>
        <label class="field" data-enddate ${multiDay ? '' : 'hidden'}><span>Termina em</span><input class="input" type="date" name="ed" value="${ymd(endDay)}"></label>
        <div id="conflict-slot"></div>
        ${isNew && cals.length > 1 ? `<label class="field" data-cal><span>Agenda</span><select class="input" name="calendarId">${cals.map((c) => `<option value="${esc(c.id)}" ${c.id === calId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        ${isNew && lists.length > 1 ? `<label class="field" data-tasklist><span>Lista de demandas</span><select class="input" name="listId">${lists.map((l) => `<option value="${esc(l.id)}" ${l.id === settings.taskList ? 'selected' : ''}>${esc(l.title)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Local ou link</span><input class="input" name="location" value="${esc(event?.location || '')}" placeholder="Opcional" autocomplete="off"></label>
        <div class="row">
          <label class="field"><span>Lembrete</span><select class="input" name="reminder">${REMINDERS.map(([v, l]) => `<option value="${v}" ${(event?.reminderMin ?? null) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field" data-status><span>Mostrar como</span><select class="input" name="status"><option value="busy">Ocupado</option><option value="free" ${event?.status === 'free' ? 'selected' : ''}>Disponível</option></select></label>
        </div>
        <label class="field"><span data-desc-label>${isTask ? 'Notas' : 'Descrição'}</span><textarea class="input" name="description" rows="3" placeholder="Opcional">${esc(description)}</textarea></label>
        ${event?.recurring ? '<p class="hint">As alterações valem só para esta ocorrência.</p>' : ''}
      </div>
      <div class="modal-actions">
        ${!isNew ? `<button type="button" class="btn btn-danger-ghost left icon-btn" data-act="delete" aria-label="Excluir" title="Excluir">${icon('trash')}</button>` : ''}
        ${task ? `<button type="button" class="btn" data-act="toggle">${task.done ? 'Reabrir' : `${icon('check')}Concluir`}</button>` : `<button type="button" class="btn btn-ghost" data-close>Cancelar</button>`}
        <button type="submit" class="btn btn-primary">${isNew ? 'Criar' : 'Salvar'}</button>
      </div>
    </form>`,
    {
      label: heading,
      wide: true,
      onMount(el, close) {
        const f = el.querySelector('form');
        const F = f.elements;
        let lastDur = allDay ? 60 * 60e3 : end - start;

        const read = () => {
          const ad = F.allDay.checked;
          const showEnd = !el.querySelector('[data-enddate]').hidden;
          if (ad) {
            const s = parseYmd(F.d.value);
            const last = showEnd && F.ed.value ? parseYmd(F.ed.value) : s;
            return { ad, s, e: addDays(last < s ? s : last, 1) };
          }
          const s = combine(F.d.value, F.st.value);
          let e = combine(showEnd && F.ed.value ? F.ed.value : F.d.value, F.et.value);
          if (e <= s && !showEnd) e = addDays(e, 1); // termina depois da meia-noite
          return { ad, s, e };
        };

        const timedMultiDay = !allDay && multiDay;
        const sync = () => {
          const ad = F.allDay.checked;
          const tk = F.isTask ? F.isTask.checked : isTask;
          el.querySelectorAll('[data-time]').forEach((x) => (x.hidden = ad));
          el.querySelector('[data-allday-label]').textContent = tk ? 'Sem horário definido' : 'Dia inteiro';
          el.querySelector('[data-desc-label]').textContent = tk ? 'Notas' : 'Descrição';
          F.title.placeholder = tk ? 'O que precisa ser feito?' : 'Título';
          const tl = el.querySelector('[data-tasklist]');
          if (tl) tl.hidden = !tk;
          // demanda sem horário não vai para o calendário: esconde as opções do evento
          const noEvent = tk && ad;
          const cal = el.querySelector('[data-cal]');
          if (cal) cal.hidden = noEvent;
          el.querySelector('[data-status]').hidden = tk;
          F.location.closest('.field').hidden = noEvent;
          F.reminder.closest('.row').hidden = noEvent;
          el.querySelector('[data-enddate]').hidden = !((ad && !tk) || (!ad && timedMultiDay));
          refreshConflicts();
        };

        const refreshConflicts = () => {
          const slot = el.querySelector('#conflict-slot');
          const { ad, s, e } = read();
          if (ad || isNaN(s) || isNaN(e)) {
            slot.innerHTML = '';
            return;
          }
          const around = ctx.events(addDays(startOfDay(s), -1), addDays(startOfDay(e), 1));
          slot.innerHTML = conflictBox(conflictsFor(around, s, e, event?.id));
        };

        // ao mudar data/início, mantém a duração
        const onStart = () => {
          const { ad, s } = read();
          if (ad || isNaN(s)) return refreshConflicts();
          const ne = new Date(s.getTime() + lastDur);
          F.et.value = hm(ne);
          if (!el.querySelector('[data-enddate]').hidden) F.ed.value = ymd(ne);
          refreshConflicts();
        };
        F.d.addEventListener('change', onStart);
        F.st.addEventListener('change', onStart);
        const onEnd = () => {
          const { s, e } = read();
          if (e > s) lastDur = e - s;
          refreshConflicts();
        };
        F.et.addEventListener('change', onEnd);
        F.ed.addEventListener('change', onEnd);
        F.allDay.addEventListener('change', sync);
        F.isTask?.addEventListener('change', sync);
        sync();

        el.querySelector('[data-act=free]').addEventListener('click', () => {
          const { s, e } = read();
          const dur = isNaN(e - s) || e <= s ? 60 : Math.round((e - s) / 60e3);
          const base = isNaN(s) ? new Date() : startOfDay(s);
          const fromNow = base > new Date() ? base : new Date();
          const evs = ctx.events(startOfDay(fromNow), addDays(startOfDay(fromNow), 14)).filter((x) => x.id !== event?.id);
          const slot = findFreeSlot(evs, fromNow, dur, { now: fromNow });
          if (!slot) return toast('Nenhum horário livre nos próximos dias', 'error');
          F.d.value = ymd(slot);
          F.st.value = hm(slot);
          F.et.value = hm(addMinutes(slot, dur));
          refreshConflicts();
          toast(`Horário livre: ${fRelativeDay(slot).toLowerCase()} às ${hm(slot)}`, 'ok', 2200);
        });

        el.querySelector('[data-act=toggle]')?.addEventListener('click', async () => {
          try {
            await data.toggleTask(task);
            close();
            toast(task.done ? 'Demanda reaberta' : 'Demanda concluída ✓', 'ok');
          } catch (err) {
            toast(errMsg(err), 'error');
          }
        });

        el.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
          const msg = task
            ? `“${task.title}”${event ? ' e o horário reservado' : ''} serão excluídos.`
            : event?.recurring
              ? 'Apenas esta ocorrência será excluída.'
              : `“${event.title}” será removido do Google Agenda.`;
          const ok = await confirmDialog(task ? 'Excluir demanda?' : 'Excluir compromisso?', msg, { ok: 'Excluir', danger: true });
          if (!ok) return;
          try {
            await data.deleteItem({ event, task });
            close();
            toast('Excluído', 'ok');
          } catch (err) {
            toast(errMsg(err), 'error');
          }
        });

        f.addEventListener('submit', async (e) => {
          e.preventDefault();
          const t = F.title.value.trim();
          if (!t) {
            F.title.focus();
            return toast('Dê um título', 'error');
          }
          const asTask = F.isTask ? F.isTask.checked : isTask;
          const { ad, s, e: en } = read();
          if (isNaN(s) || isNaN(en) || en <= s) return toast('Verifique a data e os horários', 'error');
          const rem = F.reminder.value;
          const payload = {
            title: t,
            start: s,
            end: en,
            allDay: ad,
            location: F.location.value.trim(),
            description: F.description.value,
            reminderMin: rem === 'null' ? null : Number(rem),
            status: asTask ? 'busy' : F.status.value,
            calendarId: F.calendarId?.value || calId,
            listId: F.listId?.value || settings.taskList,
            isTask: asTask,
          };
          await busy(f.querySelector('[type=submit]'), async () => {
            try {
              await data.saveItem({ event, task }, payload);
              close();
              toast(isNew ? (asTask ? 'Demanda criada' : 'Compromisso criado') : 'Alterações salvas', 'ok');
            } catch (err) {
              toast(errMsg(err), 'error');
            }
          });
        });
      },
    },
  );
}

// ---------------- Horário livre ----------------
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
