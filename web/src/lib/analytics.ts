/**
 * Anonymous usage analytics for the public demo.
 *
 * - Random visitor/session ids only; nothing typed into the app (e.g. the demo email) is ever sent.
 * - Honors Do Not Track and Global Privacy Control, never runs on localhost, and the site owner's
 *   browser is excluded once they unlock the Traffic dashboard.
 * - Engaged time = 15s heartbeats while the tab is visible and the user was active in the last minute.
 */

const ENDPOINT: string | undefined = import.meta.env.VITE_ANALYTICS_URL;
const OWNER_FLAG = 'fpa.owner';
const SESSION_IDLE_MS = 30 * 60 * 1000;
const HEARTBEAT_MS = 15_000;

type EventType = 'session_start' | 'page_view' | 'heartbeat' | 'persona' | 'action';
interface Ev { t: EventType; v: string; s: string; p?: string; a?: string; persona?: string; ref?: string; utm?: string; dur?: number; new?: boolean; tz?: string; lang?: string; scr?: string }

const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export function trackingEnabled(): boolean {
  if (!ENDPOINT || typeof window === 'undefined') return false;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !location.search.includes('track=1')) return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return false;
  return safe(() => localStorage.getItem(OWNER_FLAG) !== '1', true);
}

export function excludeThisBrowser(on: boolean) {
  safe(() => (on ? localStorage.setItem(OWNER_FLAG, '1') : localStorage.removeItem(OWNER_FLAG)), undefined);
}
export const isExcluded = () => safe(() => localStorage.getItem(OWNER_FLAG) === '1', false);

let queue: Ev[] = [];
let visitor = '';
let session = '';
let started = false;
let lastActive = Date.now();
let lastBeat = Date.now();

function ids() {
  let isNew = false;
  visitor = safe(() => localStorage.getItem('fpa.vid') ?? '', '');
  if (!visitor) {
    visitor = crypto.randomUUID();
    isNew = true;
    safe(() => localStorage.setItem('fpa.vid', visitor), undefined);
  }
  const prev = safe(() => JSON.parse(sessionStorage.getItem('fpa.sid') ?? 'null') as { id: string; at: number } | null, null);
  const fresh = !prev || Date.now() - prev.at > SESSION_IDLE_MS;
  session = fresh ? crypto.randomUUID() : prev!.id;
  touchSession();
  return { isNew, fresh };
}

function touchSession() {
  safe(() => sessionStorage.setItem('fpa.sid', JSON.stringify({ id: session, at: Date.now() })), undefined);
}

function push(e: Omit<Ev, 'v' | 's'>) {
  if (!started) return;
  queue.push({ ...e, v: visitor, s: session });
  touchSession();
  if (queue.length >= 20) flush();
}

function flush(useBeacon = false) {
  if (!queue.length || !ENDPOINT) return;
  const body = JSON.stringify({ events: queue.splice(0, 25) });
  // text/plain keeps this a "simple" request: no CORS preflight
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon(`${ENDPOINT}/collect`, new Blob([body], { type: 'text/plain' }));
  } else {
    fetch(`${ENDPOINT}/collect`, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, keepalive: true }).catch(() => {});
  }
}

export function initAnalytics() {
  if (started || !trackingEnabled()) return;
  started = true;
  const { isNew, fresh } = ids();
  if (fresh) {
    const ref = safe(() => (document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''), '');
    push({
      t: 'session_start',
      new: isNew,
      ref: ref === location.hostname ? '' : ref,
      utm: new URLSearchParams(location.search).get('utm_source') ?? '',
      tz: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, ''),
      lang: navigator.language,
      scr: `${screen.width}x${screen.height}`,
    });
  }
  const active = () => { lastActive = Date.now(); };
  ['pointerdown', 'keydown', 'scroll', 'pointermove'].forEach((ev) => window.addEventListener(ev, active, { passive: true }));
  setInterval(() => {
    const now = Date.now();
    if (document.visibilityState === 'visible' && now - lastActive < 60_000) {
      push({ t: 'heartbeat', dur: Math.min(60, Math.round((now - lastBeat) / 1000)) });
    }
    lastBeat = now;
    flush();
  }, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
    else lastBeat = Date.now(); // don't count hidden time
  });
  window.addEventListener('pagehide', () => flush(true));
}

let lastPage = { p: '', at: 0 };
export function trackPage(path: string) {
  // ignore an immediate repeat of the same page (re-mounts, StrictMode double effects)
  if (lastPage.p === path && Date.now() - lastPage.at < 1000) return;
  lastPage = { p: path, at: Date.now() };
  push({ t: 'page_view', p: path.slice(0, 80) });
}

export function trackPersona(role: string) {
  push({ t: 'persona', persona: role });
}

/** Key interactions shown in the dashboard's engagement breakdown. */
export type ActionName =
  | 'forecast_edit' | 'forecast_version' | 'budget_submit' | 'budget_approve' | 'budget_reject' | 'budget_lock'
  | 'assistant_question' | 'command_palette' | 'switch_persona' | 'run_load' | 'export_csv' | 'theme_toggle';

let lastAction = { name: '', at: 0 };
export function trackAction(name: ActionName) {
  // collapse bursts (e.g. rapid grid edits) into one event per 3s per action
  if (lastAction.name === name && Date.now() - lastAction.at < 3000) return;
  lastAction = { name, at: Date.now() };
  push({ t: 'action', a: name });
}

/**
 * Email the visitor chose to type on the sign-in screen (optional, disclosed next to the field).
 * Sent immediately and independent of the anonymous tracking queue, because the visitor explicitly submitted it.
 */
export function submitLead(email: string) {
  if (!ENDPOINT) return;
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !location.search.includes('track=1')) return;
  if (!visitor) ids();
  const body = JSON.stringify({ events: [{ t: 'lead', v: visitor, s: session, email: email.trim().slice(0, 160) }] });
  fetch(`${ENDPOINT}/collect`, { method: 'POST', body, headers: { 'content-type': 'text/plain' }, keepalive: true }).catch(() => {});
}
