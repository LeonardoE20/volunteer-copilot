// Demo-mode "AI". Foundation placeholder; the rehearsal build replaces this with the
// rule-based parser and message templates in shared/.
import type { LocalAi } from './local';

export const mockAi: LocalAi = {
  async parse() {
    return {
      title: 'New event',
      date: '',
      location: '',
      shifts: [{ role: 'Volunteer', start: '09:00', end: '12:00', needed: 4, adultsOnly: false }],
      todos: [],
      advisorName: '',
      contactPreference: 'any',
      studentsWelcome: true,
    };
  },
  async draft() {
    return [];
  },
};
