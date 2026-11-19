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

// ---------------- Detalhes ----------------
export function openEventDetail(ctx, ev) {
  const all = ctx.events(addDays(startOfDay(ev.start), -1), addDays(startOfDay(ev.end), 1));
  const conflicts = (ev.conflicts || []).map((id) => all.find((x) => x.id === id)).filter(Boolean);
  const editable = ev.source === 'google' && !ev.readOnly;

  const rows = [];
  rows.push(`<div class="detail-row">${icon('clock')}<div><b>${fRelativeDay(ev.start)}</b><br>${fRange(ev)}${ev.recurring ? ` · ${icon('repeat')} recorrente` : ''}</div></div>`);
  if (ev.location) rows.push(`<div class="detail-row">${icon('pin')}<div>${esc(ev.location)}</div></div>`);
  if (ev.organizer) rows.push(`<div class="detail-row">${icon('user')}<div>Organizador: ${esc(ev.organizer)}</div></div>`);
  if (ev.attendees?.length) {
    rows.push(`<div class="detail-row">${icon('users')}<div>${ev.attendees.length} participante${ev.attendees.length > 1 ? 's' : ''}: ${esc(ev.attendees.slice(0, 6).join(', '))}${ev.attendees.length > 6 ? '…' : ''}</div></div>`);
  }
  if (ev.status === 'tentative') rows.push(`<div class="detail-row">${icon('alert')}<div>Marcado como provisório</div></div>`);
  if (ev.status === 'free') rows.push(`<div class="detail-row">${icon('check')}<div>Aparece como disponível</div></div>`);

  openModal(
    `<div class="modal-head">
      <span class="color-dot" style="--c:${esc(ev.color)}"></span>
      <div class="grow"><h2 class="modal-title ${ev.done ? 'is-done' : ''}">${esc(ev.title)}</h2>${ev.done ? `<span class="tag tag-ok">${icon('check')}Concluído</span>` : sourceTag(ev)}</div>
      <button class="btn btn-ghost icon-btn" data-close aria-label="Fechar">${icon('x')}</button>
    </div>
    <div class="modal-body">
      ${conflicts.length && !ev.done ? conflictBox(conflicts) : ''}
      ${ev.meetingUrl ? `<a class="btn btn-primary btn-block" style="margin-bottom:12px" href="${esc(ev.meetingUrl)}" target="_blank" rel="noopener noreferrer">${icon('video')}Entrar na reunião</a>` : ''}
      ${rows.join('')}
      ${ev.description ? `<div class="detail-desc">${richText(ev.description)}</div>` : ''}
      ${ev.source === 'outlook' ? '<p class="hint" style="margin:12px 0 0">Reunião do Outlook (somente leitura). Para aceitar, recusar ou alterar, use o Outlook.</p>' : ''}
    </div>
    ${editable ? `<div class="modal-actions">
      <button class="btn btn-danger-ghost left icon-btn" data-act="delete" aria-label="Excluir" title="Excluir">${icon('trash')}</button>
      <button class="btn" data-act="edit">${icon('edit')}Editar</button>
      <button class="btn ${ev.done ? '' : 'btn-primary'}" data-act="toggle">${ev.done ? 'Reabrir' : `${icon('check')}Concluir`}</button>
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
            openItemForm(ctx, { event: ev });
          } else if (act === 'toggle') {
            close();
            toggleItem(ctx, ev);
          } else if (act === 'delete') {
            if (await confirmDelete(ev)) {
              try {
                await ctx.data.deleteEvent(ev);
                close();
                toast('Excluído', 'ok');
              } catch (err) {
                toast(errMsg(err), 'error');
              }
            }
          }
        });
      },
    },
  );
}

/** Concluir/reabrir um item, com aviso. */
export async function toggleItem(ctx, ev) {
  try {
    await ctx.data.toggleDone(ev);
    toast(ev.done ? 'Reaberto' : 'Concluído ✓', 'ok', 1800);
  } catch (err) {
    toast(errMsg(err), 'error');
  }
}

const confirmDelete = (ev) =>
  confirmDialog('Excluir?', ev.recurring ? 'Apenas esta ocorrência será excluída.' : `“${ev.title}” será removido do Google Agenda.`, { ok: 'Excluir', danger: true });

// ---------------- Formulário único ----------------
function needGoogle(ctx) {
  return openModal(
    `<div class="modal-body"><h2 class="modal-title">Conecte o Google</h2>
      <p class="muted">Tudo o que você cadastra é salvo no seu Google Agenda. Conecte sua conta nos Ajustes.</p></div>
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
 * Cadastro único: título, data, início e fim (ou dia inteiro). Sempre salvo no Google Agenda.
 * existing: { event? } (vazio = novo) · prefill: { start, end, allDay, title }
 */
export function openItemForm(ctx, existing = {}, prefill = {}) {
  const { data, settings } = ctx;
  if (!data.googleOn()) return needGoogle(ctx);
  const event = existing.event || null;
  const isNew = !event;
  const cals = data.writableCalendars();
  const now = new Date();

  let allDay;
  let start;
  let end;
  if (event) {
    ({ start, end, allDay } = event);
  } else if (prefill.start) {
    start = prefill.start;
    end = prefill.end || addMinutes(start, 60);
    allDay = !!prefill.allDay;
  } else {
    const base = startOfDay(ctx.state.date || now);
    const from = base < startOfDay(now) ? startOfDay(now) : base;
    start = new Date(from);
    if (sameDay(from, now)) start.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
    else start.setHours(9, 0, 0, 0);
    end = addMinutes(start, 60);
    allDay = false;
  }
  const defTime = allDay ? combine(ymd(start), `${String(Math.min(now.getHours() + 1, 23)).padStart(2, '0')}:00`) : start;
  const defEnd = allDay ? addMinutes(defTime, 60) : end;
  const endDay = allDay ? addDays(end, -1) : end;
  const multiDay = allDay ? !sameDay(start, endDay) : end - start > 864e5 || (!sameDay(start, end) && +end !== +startOfDay(end));
  const calId = event?.calendarId || settings.defaultCalendar || cals[0]?.id;
  const heading = isNew ? 'Novo' : 'Editar';

  openModal(
    `<form data-form="item" novalidate>
      <div class="modal-head">
        <div class="grow"><h2 class="modal-title">${heading}</h2>
          ${event?.done ? `<span class="tag tag-ok">${icon('check')}Concluído</span>` : ''}</div>
        <button type="button" class="btn btn-ghost icon-btn" data-close aria-label="Fechar">${icon('x')}</button>
      </div>
      <div class="modal-body">
        <input class="input input-title" name="title" placeholder="O que vai acontecer?" value="${esc(event?.title ?? prefill.title ?? '')}" required autofocus autocomplete="off">
        <div class="dt-grid">
          <label class="field dt-date"><span>Data</span><input class="input" type="date" name="d" value="${ymd(start)}" required></label>
          <label class="field dt-time" data-time><span>Início</span><input class="input" type="time" name="st" value="${hm(allDay ? defTime : start)}" step="300"></label>
          <label class="field dt-time" data-time><span>Fim</span><input class="input" type="time" name="et" value="${hm(allDay ? defEnd : end)}" step="300"></label>
        </div>
        <div class="dt-extra">
          <label class="check"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''}> Dia inteiro</label>
          <button type="button" class="link-btn" data-act="free" data-time>${icon('search')}Sugerir horário livre</button>
        </div>
        <label class="field" data-enddate ${allDay || multiDay ? '' : 'hidden'}><span>Termina em</span><input class="input" type="date" name="ed" value="${ymd(endDay)}"></label>
        <div id="conflict-slot"></div>
        ${isNew && cals.length > 1 ? `<label class="field"><span>Agenda</span><select class="input" name="calendarId">${cals.map((c) => `<option value="${esc(c.id)}" ${c.id === calId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>Local ou link</span><input class="input" name="location" value="${esc(event?.location || '')}" placeholder="Opcional" autocomplete="off"></label>
        <div class="row">
          <label class="field"><span>Lembrete</span><select class="input" name="reminder">${REMINDERS.map(([v, l]) => `<option value="${v}" ${(event?.reminderMin ?? null) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="field"><span>Mostrar como</span><select class="input" name="status"><option value="busy">Ocupado</option><option value="free" ${event?.status === 'free' ? 'selected' : ''}>Disponível</option></select></label>
        </div>
        <label class="field"><span>Descrição</span><textarea class="input" name="description" rows="3" placeholder="Opcional">${esc(event?.description || '')}</textarea></label>
        ${event?.recurring ? '<p class="hint">As alterações valem só para esta ocorrência.</p>' : ''}
      </div>
      <div class="modal-actions">
        ${!isNew ? `<button type="button" class="btn btn-danger-ghost left icon-btn" data-act="delete" aria-label="Excluir" title="Excluir">${icon('trash')}</button>
          <button type="button" class="btn" data-act="toggle">${event.done ? 'Reabrir' : `${icon('check')}Concluir`}</button>` : '<button type="button" class="btn btn-ghost" data-close>Cancelar</button>'}
        <button type="submit" class="btn btn-primary">${isNew ? 'Criar' : 'Salvar'}</button>
      </div>
    </form>`,
    {
      label: heading,
      wide: true,
      onMount(el, close) {
        const f = el.querySelector('form');
        const F = f.elements;
        const endField = el.querySelector('[data-enddate]');
        let lastDur = allDay ? 60 * 60e3 : end - start;
        const timedMultiDay = !allDay && multiDay;

        const read = () => {
          const ad = F.allDay.checked;
          const showEnd = !endField.hidden;
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

        const sync = () => {
          const ad = F.allDay.checked;
          el.querySelectorAll('[data-time]').forEach((x) => (x.hidden = ad));
          endField.hidden = !(ad || timedMultiDay);
          if (ad && !F.ed.value) F.ed.value = F.d.value;
          refreshConflicts();
        };

        const onStart = () => {
          const { ad, s } = read();
          if (ad) {
            if (F.ed.value < F.d.value) F.ed.value = F.d.value;
            return refreshConflicts();
          }
          if (isNaN(s)) return refreshConflicts();
          const ne = new Date(s.getTime() + lastDur);
          F.et.value = hm(ne);
          if (!endField.hidden) F.ed.value = ymd(ne);
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

        el.querySelector('[data-act=toggle]')?.addEventListener('click', () => {
          close();
          toggleItem(ctx, event);
        });

        el.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
          if (!(await confirmDelete(event))) return;
          try {
            await data.deleteEvent(event);
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
            status: F.status.value,
            calendarId: F.calendarId?.value || calId,
          };
          await busy(f.querySelector('[type=submit]'), async () => {
            try {
              await data.saveEvent(event, payload);
              close();
              toast(isNew ? 'Criado' : 'Alterações salvas', 'ok');
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
