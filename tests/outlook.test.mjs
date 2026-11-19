import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseIcs, expandRange, findMeetingLink } from '../js/outlook.js';

process.env.TZ = 'America/Sao_Paulo';
const ics = readFileSync(new URL('./fixtures-outlook.ics', import.meta.url), 'utf8');
const parsed = parseIcs(ics);
const iso = (d) => d.toISOString();

test('expande recorrência semanal com EXDATE e exceção', () => {
  const evs = expandRange(parsed, new Date('2026-11-09T03:00:00Z'), new Date('2026-11-21T03:00:00Z'));
  const daily = evs.filter((e) => e.seriesId === 'daily-standup').sort((a, b) => a.start - b.start);
  // 9..20 nov = 10 dias úteis, menos o EXDATE de 13/11
  assert.equal(daily.length, 9);
  assert.ok(!daily.some((e) => iso(e.start).startsWith('2026-11-13')));
  const moved = daily.find((e) => iso(e.start).startsWith('2026-11-18'));
  assert.equal(moved.title, 'Daily (remarcada)');
  assert.equal(iso(moved.start), '2026-11-18T14:00:00.000Z');
  assert.equal(iso(daily[0].start), '2026-11-09T12:30:00.000Z');
  assert.ok(daily[0].meetingUrl.startsWith('https://teams.microsoft.com/l/meetup-join/'));
});

test('dia inteiro, status, organizador e cancelados', () => {
  const evs = expandRange(parsed, new Date('2026-11-19T03:00:00Z'), new Date('2026-11-21T03:00:00Z'));
  const hol = evs.find((e) => e.seriesId === 'holiday');
  assert.equal(hol.allDay, true);
  assert.equal(hol.status, 'free');
  assert.equal(hol.start.getDate(), 20);
  const rev = evs.find((e) => e.seriesId === 'review');
  assert.equal(rev.status, 'tentative');
  assert.equal(rev.organizer, 'Ana Souza');
  assert.ok(!evs.some((e) => e.seriesId === 'cancel'));
});

test('fuso Windows não declarado usa mapeamento IANA', () => {
  const evs = expandRange(parsed, new Date('2026-11-19T03:00:00Z'), new Date('2026-11-20T03:00:00Z'));
  const call = evs.find((e) => e.seriesId === 'undeclared-tz');
  assert.equal(iso(call.start), '2026-11-19T17:00:00.000Z'); // 9h PST = 17h UTC
});

test('vários calendários separados', () => {
  const p = parseIcs(ics + '\r\n#AGENDA-SPLIT#\r\n' + ics.replaceAll('UID:', 'UID:b-'));
  const evs = expandRange(p, new Date('2026-11-19T03:00:00Z'), new Date('2026-11-20T03:00:00Z'));
  assert.equal(evs.filter((e) => e.title === 'Revisão trimestral').length, 2);
});

test('link de reunião', () => {
  assert.equal(findMeetingLink('veja https://meet.google.com/abc-defg-hij.'), 'https://meet.google.com/abc-defg-hij');
  assert.equal(findMeetingLink('nada aqui'), null);
});
