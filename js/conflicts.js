// Detecção de conflitos entre compromissos de trabalho (Outlook) e pessoais (Google)

const counts = (e) => !e.allDay && !e.declined && e.status !== 'free' && e.source !== 'task' && e.end > e.start;

/**
 * Marca em cada evento a lista de ids com quem ele conflita (ev.conflicts)
 * e retorna os pares em conflito [{a, b}].
 */
export function findConflicts(events) {
  const timed = events.filter(counts).sort((a, b) => a.start - b.start);
  const pairs = [];
  for (const e of events) e.conflicts = [];
  for (let i = 0; i < timed.length; i++) {
    const a = timed[i];
    for (let j = i + 1; j < timed.length; j++) {
      const b = timed[j];
      if (b.start >= a.end) break;
      if (a.source === b.source) continue; // só trabalho × pessoal
      if (a.start < b.end && b.start < a.end) {
        a.conflicts.push(b.id);
        b.conflicts.push(a.id);
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}

/** Eventos que conflitariam com um novo horário [start, end). */
export function conflictsFor(events, start, end, ignoreId) {
  return events.filter((e) => counts(e) && e.id !== ignoreId && e.source === 'outlook' && e.start < end && start < e.end);
}
