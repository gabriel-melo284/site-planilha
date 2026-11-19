// Utilitários de data (sempre no fuso local do dispositivo)

export const MIN = 60e3;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const endOfDay = (d) => addDays(startOfDay(d), 1);
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const addMinutes = (d, n) => new Date(d.getTime() + n * MIN);
export const addMonths = (d, n) => {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
};
export const startOfWeek = (d, weekStart = 0) => {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() - weekStart + 7) % 7));
};
export const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const isToday = (d) => sameDay(d, new Date());

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const combine = (dateStr, timeStr) => {
  const d = parseYmd(dateStr);
  const [h, m] = String(timeStr || '00:00').split(':').map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
};
export const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();
export const overlaps = (aS, aE, bS, bE) => aS < bE && bS < aE;

const fmt = (opts) => new Intl.DateTimeFormat('pt-BR', opts);
const F = {
  weekdayShort: fmt({ weekday: 'short' }),
  weekdayLong: fmt({ weekday: 'long' }),
  dayMonth: fmt({ day: 'numeric', month: 'short' }),
  dayMonthLong: fmt({ day: 'numeric', month: 'long' }),
  monthYear: fmt({ month: 'long', year: 'numeric' }),
  monthShort: fmt({ month: 'short' }),
  full: fmt({ weekday: 'long', day: 'numeric', month: 'long' }),
  fullYear: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
};
const clean = (s) => s.replace(/\./g, '').replace(/ de /g, ' de ');
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const fWeekdayShort = (d) => cap(clean(F.weekdayShort.format(d)));
export const fWeekdayLong = (d) => cap(F.weekdayLong.format(d));
export const fDayMonth = (d) => clean(F.dayMonth.format(d));
export const fDayMonthLong = (d) => F.dayMonthLong.format(d);
export const fMonthYear = (d) => cap(F.monthYear.format(d));
export const fMonthShort = (d) => cap(clean(F.monthShort.format(d)));
export const fFull = (d) => cap(d.getFullYear() === new Date().getFullYear() ? F.full.format(d) : F.fullYear.format(d));

export function fRelativeDay(d) {
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return fFull(d);
}

export function fDuration(ms) {
  const m = Math.round(ms / MIN);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${pad(r)}` : `${h}h`;
}

export function fRange(ev) {
  if (ev.allDay) {
    const days = Math.round((startOfDay(ev.end) - startOfDay(ev.start)) / DAY);
    if (days <= 1) return 'Dia inteiro';
    return `${fDayMonth(ev.start)} – ${fDayMonth(addDays(ev.end, -1))}`;
  }
  if (sameDay(ev.start, ev.end) || +ev.end === +startOfDay(addDays(ev.start, 1))) {
    return `${hm(ev.start)} – ${hm(ev.end)}`;
  }
  return `${fDayMonth(ev.start)} ${hm(ev.start)} – ${fDayMonth(ev.end)} ${hm(ev.end)}`;
}

export function fCountdown(target, now = new Date()) {
  const ms = target - now;
  if (ms <= 0) return 'agora';
  const m = Math.round(ms / MIN);
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `em ${h}h${m % 60 ? pad(m % 60) : ''}`;
  return `em ${Math.round(h / 24)} dias`;
}
