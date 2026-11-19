// Lembretes no navegador (funcionam enquanto o app estiver aberto, inclusive em segundo plano)
import { load, save } from './store.js';
import { hm, ymd } from './dates.js';

let timer = null;

export const supported = () => 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');

export async function requestPermission() {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

export async function show(title, body, tag) {
  if (permission() !== 'granted') return false;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      return true;
    }
  } catch { /* cai para Notification direto */ }
  try {
    new Notification(title, opts);
    return true;
  } catch {
    return false;
  }
}

/**
 * Agenda verificações periódicas.
 * getData() → { events, tasks, settings }
 * onInApp(msg) → mostra aviso dentro do app também
 */
export function startReminders(getData, onInApp) {
  stopReminders();
  const tick = () => {
    const { events, tasks, settings } = getData();
    const cfg = settings.notify;
    if (!cfg.enabled) return;
    const now = Date.now();
    const sent = load('notified', {});
    let changed = false;
    const lead = Math.max(0, Number(cfg.lead) || 0) * 60e3;

    for (const e of events) {
      if (e.allDay || e.declined || e.source === 'task') continue;
      const fireAt = e.start.getTime() - lead;
      const key = `${e.id}@${e.start.getTime()}`;
      if (now >= fireAt && now < e.start.getTime() + 60e3 && !sent[key]) {
        sent[key] = now;
        changed = true;
        const mins = Math.round((e.start.getTime() - now) / 60e3);
        const when = mins > 0 ? `Começa em ${mins} min (${hm(e.start)})` : `Começando agora (${hm(e.start)})`;
        const where = e.location ? ` · ${e.location}` : '';
        show(e.title, when + where, key);
        onInApp?.(`${e.title} — ${when.toLowerCase()}`);
      }
    }

    if (cfg.tasks && tasks.length) {
      const [h, m] = String(cfg.taskTime || '09:00').split(':').map(Number);
      const target = new Date();
      target.setHours(h || 0, m || 0, 0, 0);
      const dayKey = 'tasks@' + ymd(new Date());
      if (now >= target.getTime() && !sent[dayKey]) {
        const today = ymd(new Date());
        const due = tasks.filter((t) => !t.done && t.due && t.due <= today);
        sent[dayKey] = now;
        changed = true;
        if (due.length) {
          const late = due.filter((t) => t.due < today).length;
          const body = due.slice(0, 4).map((t) => '• ' + t.title).join('\n') + (due.length > 4 ? `\n+${due.length - 4}` : '');
          show(`${due.length} demanda${due.length > 1 ? 's' : ''} para hoje${late ? ` (${late} atrasada${late > 1 ? 's' : ''})` : ''}`, body, dayKey);
        }
      }
    }

    if (changed) {
      // limpa registros com mais de 3 dias
      for (const [k, v] of Object.entries(sent)) if (now - v > 3 * 864e5) delete sent[k];
      save('notified', sent);
    }
  };
  tick();
  timer = setInterval(tick, 30e3);
}

export function stopReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}

