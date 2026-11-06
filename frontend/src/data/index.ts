import type { VolunteerApp } from '../../../contracts/volunteer-contract.ts';
import { DemoVolunteerApp } from './demo.ts';
import { HttpVolunteerApp } from './http.ts';

export { DemoVolunteerApp, VolunteerAppError, appErrorMessage } from './demo.ts';
export { HttpVolunteerApp } from './http.ts';
export const demoApi = new DemoVolunteerApp();
const apiMode = import.meta.env.VITE_DATA_MODE === 'api';
const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const connection: { mode: 'demo' | 'api'; roster: boolean; messaging: boolean; signup: boolean; eventCreation: boolean; baseUrl?: string } = {
  mode: apiMode ? 'api' : 'demo', roster: !apiMode, messaging: !apiMode, signup: !apiMode,
  eventCreation: true, ...(apiMode ? { baseUrl } : {}),
};
// Swap only this adapter as B adds domain routes. Unsupported live actions stay explicit.
export const api: VolunteerApp = apiMode
  ? new HttpVolunteerApp({ baseUrl, timeZone: import.meta.env.VITE_EVENT_TIME_ZONE || 'America/Los_Angeles' })
  : demoApi;
export function resetDemo(): void { demoApi.reset(); }
