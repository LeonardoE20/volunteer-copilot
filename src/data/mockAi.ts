// Demo-mode "AI": the rule-based parser and message templates. Runs entirely in the browser.
import type { LocalAi } from './local';
import { ruleBasedParse } from '../../shared/parser';
import { planOutreach, withTemplateText } from '../../shared/outreach';

export const mockAi: LocalAi = {
  async parse(note) {
    // A short pause so the demo reads as "working", without pretending to be slow AI.
    await new Promise((r) => setTimeout(r, 250));
    return ruleBasedParse(note);
  },
  async draft(roster, shiftId, kind, signupUrl) {
    return withTemplateText(planOutreach(roster, shiftId, kind, signupUrl));
  },
};
