import type { Named, SessionRow, Stats } from './owner';

/**
 * Clearly-labelled SAMPLE traffic so the owner can preview the dashboard before real visits arrive.
 * Deterministic (seeded) so the preview doesn't jump around between refreshes.
 */
function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
}
const pick = <T,>(r: () => number, xs: [T, number][]): T => {
  const total = xs.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of xs) { if ((x -= w) <= 0) return v; }
  return xs[0][0];
};

const PATHS: [string, number][] = [
  ['/intake/forecast', 10], ['/reporting/variance', 8], ['/intake/submissions', 7], ['/assistant', 6], ['/actuals/close', 4],
  ['/reporting/bridge', 4], ['/admin/users', 3], ['/actuals/loads', 3], ['/admin/architecture', 3], ['/reporting/library', 2],
];
const PLACES: [[string, string, string], number][] = [
  [['US', 'Missouri', 'St. Louis'], 6], [['US', 'Illinois', 'Chicago'], 5], [['US', 'New York', 'New York'], 5],
  [['US', 'California', 'San Francisco'], 4], [['US', 'Texas', 'Austin'], 3], [['US', 'Washington', 'Seattle'], 2],
  [['GB', 'England', 'London'], 2], [['CA', 'Ontario', 'Toronto'], 1],
];

export function sampleStats(days: number): Stats {
  const r = rng(days * 97 + 7);
  const now = Date.now();
  const n = Math.round(days <= 1 ? 9 : days * 5.5);
  // ~30% of sessions come from returning visitors, like real traffic
  const pool = Array.from({ length: Math.max(1, Math.round(n * 0.72)) }, () => Math.floor(r() * 0xffffff).toString(16).padStart(6, '0'));
  const sessions: SessionRow[] = Array.from({ length: n }, () => {
    // more traffic in recent days and during US business hours
    const ago = Math.pow(r(), 1.4) * days * 86400_000;
    const start = new Date(now - ago);
    start.setUTCHours(13 + Math.floor(r() * 10), Math.floor(r() * 60));
    if (start.getTime() > now) start.setTime(now - r() * 3600_000);
    const nPages = 1 + Math.floor(Math.pow(r(), 0.8) * 7);
    let t = start.getTime();
    const pages = [{ p: '/sign-in', ts: new Date(t).toISOString() }, { p: '/', ts: new Date((t += 20_000)).toISOString() }];
    for (let k = 1; k < nPages; k++) pages.push({ p: pick(r, PATHS), ts: new Date((t += (20 + r() * 140) * 1000)).toISOString() });
    const [country, region, city] = pick(r, PLACES);
    const signedIn = r() > 0.15;
    return {
      id: Math.floor(r() * 0xffffff).toString(16).padStart(6, '0'),
      visitor: pool[Math.floor(r() * pool.length)],
      start: start.toISOString(), end: new Date(t + 15_000).toISOString(),
      engaged: Math.round((t - start.getTime()) / 1000 * (0.6 + r() * 0.3)),
      persona: signedIn ? pick(r, [['analyst', 5], ['approver', 3], ['admin', 2]]) : null,
      new: r() > 0.25,
      ref: pick(r, [['linkedin.com', 6], ['', 4], ['google.com', 1], ['github.com', 1]]),
      country, region, city,
      device: pick(r, [['Desktop', 7], ['Mobile', 3], ['Tablet', 0.5]]),
      browser: pick(r, [['Chrome', 6], ['Safari', 3], ['Edge', 2], ['Firefox', 0.7]]),
      os: pick(r, [['Windows', 5], ['macOS', 4], ['iOS', 2], ['Android', 1]]),
      pages: signedIn ? pages : pages.slice(0, 1),
      actions: signedIn ? Math.floor(r() * 6) : 0,
    };
  }).sort((a, b) => b.start.localeCompare(a.start));

  const count = (xs: string[], k = 8): Named[] => {
    const m = new Map<string, number>();
    xs.forEach((x) => m.set(x || 'Unknown', (m.get(x || 'Unknown') ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, value]) => ({ name, value }));
  };

  const hourly = days <= 2;
  const step = hourly ? 3600_000 : 86400_000;
  const startT = Math.floor((now - days * 86400_000) / step) * step;
  const series = [];
  for (let t = startT; t <= now; t += step) {
    const inB = sessions.filter((s) => { const x = Date.parse(s.start); return x >= t && x < t + step; });
    series.push({ t: new Date(t).toISOString(), visitors: new Set(inB.map((s) => s.visitor)).size, sessions: inB.length, pageviews: inB.reduce((a, s) => a + s.pages.length, 0) });
  }
  const heat = Array(168).fill(0);
  sessions.forEach((s) => s.pages.forEach((p) => { const d = new Date(p.ts); heat[((d.getUTCDay() + 6) % 7) * 24 + d.getUTCHours()] += 1; }));

  const pv = sessions.reduce((a, s) => a + s.pages.length, 0);
  const kpis = {
    visitors: new Set(sessions.map((s) => s.visitor)).size,
    sessions: sessions.length,
    pageviews: pv,
    avgEngaged: Math.round(sessions.reduce((a, s) => a + s.engaged, 0) / Math.max(1, sessions.length)),
    bounceRate: sessions.filter((s) => s.pages.length <= 1).length / Math.max(1, sessions.length),
    returningRate: sessions.filter((s) => !s.new).length / Math.max(1, sessions.length),
  };
  const previous = { ...kpis, visitors: Math.round(kpis.visitors * 0.72), sessions: Math.round(kpis.sessions * 0.7), pageviews: Math.round(pv * 0.64), avgEngaged: Math.round(kpis.avgEngaged * 0.88), bounceRate: kpis.bounceRate * 1.15, returningRate: kpis.returningRate * 0.8 };

  const live = sessions.slice(0, 3).map((s, i) => ({ id: s.id, page: s.pages.at(-1)!.p, country: s.country, city: s.city, device: s.device, since: new Date(now - (i + 1) * 140_000).toISOString() }));
  const feed = sessions.slice(0, 12).flatMap((s) => s.pages.slice(-2).reverse().map((p) => ({ ts: p.ts, t: 'page_view', p: p.p, a: '', persona: '', country: s.country, city: s.city, device: s.device, s: s.id })));

  return {
    generatedAt: new Date(now).toISOString(), days, kpis, previous, hourly, series, heatmapUtc: heat,
    pages: count(sessions.flatMap((s) => s.pages.map((p) => p.p)), 10),
    referrers: count(sessions.map((s) => s.ref || 'Direct')),
    countries: count(sessions.map((s) => s.country)),
    cities: count(sessions.map((s) => `${s.city}, ${s.region}, ${s.country}`)),
    devices: count(sessions.map((s) => s.device)), browsers: count(sessions.map((s) => s.browser)), os: count(sessions.map((s) => s.os)),
    personas: count(sessions.filter((s) => s.persona).map((s) => s.persona!)),
    actions: [
      { name: 'forecast_edit', value: Math.round(n * 0.5) }, { name: 'assistant_question', value: Math.round(n * 0.35) },
      { name: 'budget_approve', value: Math.round(n * 0.2) }, { name: 'switch_persona', value: Math.round(n * 0.18) },
      { name: 'command_palette', value: Math.round(n * 0.1) }, { name: 'export_csv', value: Math.round(n * 0.06) },
    ],
    funnel: [
      { name: 'Visited', value: n },
      { name: 'Signed in', value: sessions.filter((s) => s.persona).length },
      { name: 'Explored 3+ pages', value: sessions.filter((s) => s.pages.length >= 3).length },
      { name: 'Interacted', value: sessions.filter((s) => s.actions > 0).length },
    ],
    live, sessions: sessions.slice(0, 60), feed,
    leads: sessions.slice(0, 3).filter((_, i) => i !== 1).map((s, i) => ({
      email: ['jamie.sample@example.com', 'taylor.preview@example.org'][i], start: s.start, end: s.end, engaged: s.engaged,
      pages: s.pages.length, city: s.city, country: s.country, device: s.device, ref: s.ref, session: s.id,
    })),
  };
}
