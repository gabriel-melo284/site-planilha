import test from 'node:test';
import assert from 'node:assert/strict';
import { findConflicts, conflictsFor } from '../js/conflicts.js';
import { layoutDay } from '../js/views/timeline.js';

const ev = (id, source, s, e, extra = {}) => ({ id, source, start: new Date(`2026-11-19T${s}:00`), end: new Date(`2026-11-19T${e}:00`), allDay: false, status: 'busy', ...extra });

test('conflito só entre trabalho e pessoal', () => {
  const list = [
    ev('w1', 'outlook', '10:00', '11:00'),
    ev('w2', 'outlook', '10:30', '11:30'),
    ev('p1', 'google', '10:45', '12:00'),
    ev('p2', 'google', '11:00', '11:15'), // sobrepõe w2
    ev('w3', 'outlook', '13:00', '14:00'),
    ev('p3', 'google', '14:00', '15:00'), // encosta, não conflita
    ev('w4', 'outlook', '15:00', '16:00', { status: 'free' }),
    ev('p4', 'google', '15:00', '16:00'),
  ];
  const pairs = findConflicts(list);
  const ids = pairs.map((p) => [p.a.id, p.b.id].sort().join('-')).sort();
  assert.deepEqual(ids, ['p1-w1', 'p1-w2', 'p2-w2']);
  assert.deepEqual(list.find((e) => e.id === 'p3').conflicts, []);
});

test('conflictsFor avisa reuniões do Outlook no novo horário', () => {
  const list = [ev('w1', 'outlook', '10:00', '11:00'), ev('p1', 'google', '10:00', '11:00')];
  const r = conflictsFor(list, new Date('2026-11-19T10:30:00'), new Date('2026-11-19T11:30:00'));
  assert.deepEqual(r.map((e) => e.id), ['w1']);
});

test('layout coloca sobrepostos lado a lado', () => {
  const segs = layoutDay([{ s: 600, e: 660 }, { s: 630, e: 690 }, { s: 700, e: 720 }]);
  assert.equal(segs[0].cols, 2);
  assert.equal(segs[1].col, 1);
  assert.equal(segs[2].cols, 1);
});

import { findFreeSlot } from '../js/views/forms.js';
test('horário livre pula reuniões e respeita o expediente', () => {
  const day = new Date('2026-11-19T00:00:00');
  const list = [ev('w1', 'outlook', '08:00', '09:30'), ev('p1', 'google', '09:30', '10:10'), ev('w2', 'outlook', '11:00', '12:00')];
  const now = new Date('2026-11-19T07:00:00');
  assert.equal(findFreeSlot(list, day, 45, { now }).toTimeString().slice(0, 5), '10:15');
  assert.equal(findFreeSlot(list, day, 60, { now }).toTimeString().slice(0, 5), '12:00');
  // depois do expediente → próximo dia às 8h
  const late = findFreeSlot(list, day, 60, { now: new Date('2026-11-19T18:30:00') });
  assert.equal(late.toISOString(), new Date('2026-11-20T08:00:00').toISOString());
});
