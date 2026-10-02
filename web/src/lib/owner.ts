import { create } from 'zustand';
import { excludeThisBrowser } from './analytics';

/**
 * Site-owner access to the Traffic dashboard. The passphrase is checked server-side on every
 * request; the browser keeps it only for this tab session (sessionStorage), never in code or the repo.
 */
const ENDPOINT: string | undefined = import.meta.env.VITE_ANALYTICS_URL;
const KEY = 'fpa.ownerKey';

export interface Named { name: string; value: number }
export interface Kpis { visitors: number; sessions: number; pageviews: number; avgEngaged: number; bounceRate: number; returningRate: number }
export interface SessionRow {
  id: string; visitor: string; start: string; end: string; engaged: number; persona: string | null; new: boolean;
  ref: string; country: string; region: string; city: string; device: string; browser: string; os: string;
  pages: { p: string; ts: string }[]; actions: number; email?: string | null;
}
export interface Lead { email: string; start: string; end: string; engaged: number; pages: number; city: string; country: string; device: string; ref: string; session: string }
export interface FeedRow { ts: string; t: string; p: string; a: string; persona: string; country: string; city: string; device: string; s: string }
export interface Stats {
  generatedAt: string; days: number; kpis: Kpis; previous: Kpis; hourly: boolean;
  series: { t: string; visitors: number; sessions: number; pageviews: number }[];
  heatmapUtc: number[];
  pages: Named[]; referrers: Named[]; countries: Named[]; cities: Named[]; devices: Named[]; browsers: Named[]; os: Named[];
  personas: Named[]; actions: Named[]; funnel: Named[];
  live: { id: string; page: string; country: string; city: string; device: string; since: string }[];
  sessions: SessionRow[]; feed: FeedRow[]; leads: Lead[];
}

export class Unauthorized extends Error {}

const read = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };

interface OwnerState {
  key: string | null;
  unlock: (key: string) => Promise<void>;
  lock: () => void;
}

export const useOwner = create<OwnerState>((set) => ({
  key: read(),
  unlock: async (key) => {
    await fetchStats(key, 1); // throws Unauthorized on a bad passphrase
    try { sessionStorage.setItem(KEY, key); } catch { /* ignore */ }
    excludeThisBrowser(true); // the owner's own visits shouldn't count as traffic
    set({ key });
  },
  lock: () => {
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    set({ key: null });
  },
}));

export async function fetchStats(key: string, days: number): Promise<Stats> {
  if (!ENDPOINT) throw new Error('Analytics endpoint not configured');
  const r = await fetch(`${ENDPOINT}/stats?days=${days}`, { headers: { 'x-admin-key': key }, cache: 'no-store' });
  if (r.status === 401) throw new Unauthorized('Incorrect passphrase');
  if (!r.ok) throw new Error(`Analytics request failed (${r.status})`);
  return r.json();
}

/** Friendly names for app routes. */
export function pageLabel(p: string): string {
  const path = p.split('?')[0];
  const map: Record<string, string> = {
    '/': 'Home', '/sign-in': 'Sign-in',
    '/intake/forecast': 'Forecast · drivers', '/intake/submissions': 'Forecast · submissions',
    '/actuals/close': 'Actuals · close', '/actuals/loads': 'Actuals · loads', '/actuals/quality': 'Actuals · quality',
    '/actuals/mapping': 'Actuals · mapping', '/actuals/ledger': 'Actuals · ledger',
    '/reporting/variance': 'Reporting · variance', '/reporting/bridge': 'Reporting · bridge', '/reporting/library': 'Reporting · library',
    '/assistant': 'AI Assistant',
    '/admin/users': 'Admin · users', '/admin/sso': 'Admin · SSO', '/admin/cycles': 'Admin · cycles',
    '/admin/integrations': 'Admin · integrations', '/admin/audit': 'Admin · audit', '/admin/architecture': 'Admin · architecture',
    '/traffic': 'Traffic',
  };
  return map[path] ?? path;
}

export const ACTION_LABEL: Record<string, string> = {
  forecast_edit: 'Edited the forecast', forecast_version: 'Saved a forecast version', budget_submit: 'Submitted a budget',
  budget_approve: 'Approved a budget', budget_reject: 'Sent a budget back', budget_lock: 'Locked a budget',
  assistant_question: 'Asked the AI assistant', command_palette: 'Opened command palette', switch_persona: 'Switched persona',
  run_load: 'Ran a data load', export_csv: 'Exported a CSV', theme_toggle: 'Changed theme',
};

export const PERSONA_LABEL: Record<string, string> = { analyst: 'Contributor', approver: 'Approver', admin: 'Administrator' };
