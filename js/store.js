// Persistência local (somente neste navegador)

const P = 'agenda.';

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(P + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    if (value === undefined || value === null) localStorage.removeItem(P + key);
    else localStorage.setItem(P + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearAll() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(P))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* ignora */ }
}

export const DEFAULTS = {
  workerUrl: '',
  accessKey: '',
  demo: false,
  theme: 'system', // system | light | dark
  weekStart: 0, // 0 = domingo, 1 = segunda
  dayStartHour: 7,
  refreshMin: 5,
  workName: 'Trabalho (Outlook)',
  workColor: '#2563eb',
  showWork: true,
  calendars: {}, // id do Google → { visible, color }
  defaultCalendar: null,
  view: 'week',
  notify: { enabled: false, lead: 10, tasks: true, taskTime: '09:00' },
};

export function loadSettings() {
  const s = load('settings', {});
  return { ...DEFAULTS, ...s, notify: { ...DEFAULTS.notify, ...(s.notify || {}) }, calendars: { ...(s.calendars || {}) } };
}

export function saveSettings(s) {
  save('settings', s);
}
