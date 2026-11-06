// Pure roster helpers shared by both backends.
import type { EventRecord, HoursRow, PublicEvent, Shift, Signup } from './schema';

/** A signup "counts" toward a shift while confirmed or attended. */
export const counts = (s: Signup) => s.status === 'confirmed' || s.status === 'attended';

export function filledFor(shiftId: string, signups: Signup[]): number {
  return signups.filter((s) => s.shiftId === shiftId && counts(s)).length;
}

export interface Gap {
  shift: Shift;
  filled: number;
  missing: number;
}

/** Shifts that still need people, biggest gap first, then earliest start. */
export function gaps(event: EventRecord, signups: Signup[]): Gap[] {
  return event.shifts
    .map((shift) => {
      const filled = filledFor(shift.id, signups);
      return { shift, filled, missing: Math.max(0, shift.needed - filled) };
    })
    .filter((g) => g.missing > 0)
    .sort((a, b) => b.missing - a.missing || a.shift.start.localeCompare(b.shift.start));
}

export function totals(event: EventRecord, signups: Signup[]) {
  const needed = event.shifts.reduce((n, s) => n + s.needed, 0);
  const filled = event.shifts.reduce((n, s) => n + Math.min(s.needed, filledFor(s.id, signups)), 0);
  return { needed, filled, open: needed - filled };
}

/** Strip everything private: no names, no contacts, no tokens. */
export function toPublic(event: EventRecord, signups: Signup[]): PublicEvent {
  return {
    slug: event.slug,
    title: event.title,
    date: event.date,
    location: event.location,
    studentsWelcome: event.studentsWelcome,
    shifts: event.shifts.map((s) => ({ ...s, filled: filledFor(s.id, signups) })),
  };
}

const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const hoursBetween = (start: string, end: string) => Math.max(0, (mins(end) - mins(start)) / 60);

/** Students marked attended, with their hours. This is all the advisor ever sees. */
export function studentHours(event: EventRecord, signups: Signup[]): HoursRow[] {
  return signups
    .filter((s) => s.isStudent && s.status === 'attended')
    .flatMap((s) => {
      const shift = event.shifts.find((x) => x.id === s.shiftId);
      if (!shift) return [];
      return [{ signupId: s.id, name: s.name, role: shift.role, start: shift.start, end: shift.end, hours: hoursBetween(shift.start, shift.end), confirmed: s.hoursConfirmed }];
    });
}

/** "07:00" -> "7:00 AM" */
export function formatTime(t: string): string {
  const [hStr, m] = t.split(':');
  const h = Number(hStr);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

export const shiftLabel = (s: Pick<Shift, 'role' | 'start' | 'end'>) =>
  `${s.role}, ${formatTime(s.start)}–${formatTime(s.end)}`;
