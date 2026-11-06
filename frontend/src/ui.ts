import type { Event as VolunteerEvent, ParticipationStatus } from '../../contracts/volunteer-contract.ts';

export const statusLabels: Record<ParticipationStatus, string> = {
  not_invited: 'Not invited', invited: 'Awaiting reply', interested: 'Interested',
  details_submitted: 'Details received', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled',
};
export function dateLabel(event: Pick<VolunteerEvent, 'startsAt' | 'timeZone'>, long = false) {
  return new Intl.DateTimeFormat('en-US', { timeZone: event.timeZone, month: long ? 'long' : 'short', day: 'numeric', weekday: long ? 'long' : 'short' }).format(new Date(event.startsAt));
}
export function timeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}
export function wallTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
}
export function dateInput(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (name: string) => parts.find(p => p.type === name)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
/** Convert a wall-clock choice in the event's timezone, independent of browser timezone. */
export function zonedTimestamp(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  if (!Number.isFinite(desired)) throw new Error('Choose a valid date and time.');
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let candidate = desired;
  for (let pass = 0; pass < 3; pass++) {
    const p = formatter.formatToParts(new Date(candidate));
    const n = (name: string) => Number(p.find(part => part.type === name)?.value);
    const observed = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
    candidate += desired - observed;
  }
  if (dateInput(new Date(candidate).toISOString(), timeZone) !== date || wallTime(new Date(candidate).toISOString(), timeZone) !== time) throw new Error('That local time does not exist. Choose another time.');
  return new Date(candidate).toISOString();
}
