import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInput, wallTime, zonedTimestamp } from '../ui.ts';

const zone = 'America/Los_Angeles';

test('a November event at 15:00 Los Angeles uses Pacific standard time', () => {
  const timestamp = zonedTimestamp('2026-11-14', '15:00', zone);
  assert.equal(timestamp, '2026-11-14T23:00:00.000Z');
  assert.equal(dateInput(timestamp, zone), '2026-11-14');
  assert.equal(wallTime(timestamp, zone), '15:00');
});

test('a summer event at 15:00 Los Angeles uses daylight saving time', () => {
  assert.equal(zonedTimestamp('2026-07-14', '15:00', zone), '2026-07-14T22:00:00.000Z');
});

test('nonexistent spring-forward wall time is rejected rather than shifted', () => {
  assert.throws(() => zonedTimestamp('2026-03-08', '02:30', zone), /local time does not exist/);
  assert.equal(zonedTimestamp('2026-03-08', '01:30', zone), '2026-03-08T09:30:00.000Z');
  assert.equal(zonedTimestamp('2026-03-08', '03:30', zone), '2026-03-08T10:30:00.000Z');
});
