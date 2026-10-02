import { useMemo } from 'react';
import { create } from 'zustand';
import { trackAction } from './analytics';
import { DEFAULT_ASSUMPTIONS, runForecast, type Assumptions, type Overrides } from './forecast';

export interface LogEntry {
  id: string;
  at: number;
  kind: 'edit' | 'update' | 'version';
  text: string;
  impact?: number; // change in FY27 operating income caused by this edit
  author: string;
}

export interface Version {
  id: string;
  name: string;
  at: number;
  assumptions: Assumptions;
  overrides: Overrides;
  operatingIncome: number;
  revenue: number;
}

interface Model { assumptions: Assumptions; overrides: Overrides }

interface State extends Model {
  past: Model[];
  future: Model[];
  log: LogEntry[];
  versions: Version[];
  lastImpact?: { id: string; value: number; text: string };
}

type Action =
  | { type: 'cells'; row: string; values: Record<number, number | null>; text: string }
  | { type: 'batch'; edits: { row: string; idx: number; value: number }[]; text: string }
  | { type: 'assumption'; patch: Partial<Assumptions>; text: string }
  | { type: 'undo' } | { type: 'redo' }
  | { type: 'update'; text: string }
  | { type: 'saveVersion'; name: string }
  | { type: 'loadVersion'; id: string }
  | { type: 'reset' };
export type ForecastAction = Action;

const KEY = 'northwind.forecast.v1';
const uid = () => Math.random().toString(36).slice(2, 10);
export const AUTHOR = 'Jordan Lee';

const opInc = (m: Model) => runForecast(m.assumptions, m.overrides).out.operatingIncome;

function seedLog(): LogEntry[] {
  const now = Date.now();
  return [
    { id: uid(), at: now - 1000 * 60 * 60 * 26, kind: 'update', author: 'Priya Natarajan',
      text: 'Platform rewrite contractors roll off in Dec. R&D contractor spend should normalize to ~$190K/mo in FY27.' },
    { id: uid(), at: now - 1000 * 60 * 60 * 5, kind: 'update', author: 'Marcus Webb',
      text: 'Retail channel partner confirmed for FY27; expect Q2 units to run ~10% above seasonal trend again.' },
  ];
}

function initial(): State {
  const fresh: State = { assumptions: DEFAULT_ASSUMPTIONS, overrides: {}, past: [], future: [], log: seedLog(), versions: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { ...fresh, ...s, past: [], future: [], lastImpact: undefined };
    }
  } catch { /* storage unavailable: start fresh */ }
  return fresh;
}

function commit(state: State, next: Model, text: string, kind: LogEntry['kind'] = 'edit'): State {
  const impact = opInc(next) - opInc(state);
  const entry: LogEntry = { id: uid(), at: Date.now(), kind, text, impact, author: AUTHOR };
  return {
    ...state, ...next,
    past: [...state.past, { assumptions: state.assumptions, overrides: state.overrides }].slice(-100),
    future: [],
    log: [entry, ...state.log].slice(0, 200),
    lastImpact: { id: entry.id, value: impact, text },
  };
}

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'cells': {
      const row = { ...(state.overrides[a.row] ?? {}) };
      for (const [i, v] of Object.entries(a.values)) {
        if (v === null) delete row[Number(i)]; else row[Number(i)] = v;
      }
      const overrides = { ...state.overrides, [a.row]: row };
      if (!Object.keys(row).length) delete overrides[a.row];
      return commit(state, { assumptions: state.assumptions, overrides }, a.text);
    }
    case 'batch': {
      const overrides: Overrides = { ...state.overrides };
      for (const e of a.edits) overrides[e.row] = { ...(overrides[e.row] ?? {}), [e.idx]: e.value };
      return commit(state, { assumptions: state.assumptions, overrides }, a.text);
    }
    case 'assumption':
      return commit(state, { assumptions: { ...state.assumptions, ...a.patch }, overrides: state.overrides }, a.text);
    case 'undo': {
      const prev = state.past.at(-1);
      if (!prev) return state;
      return { ...state, ...prev, past: state.past.slice(0, -1), future: [{ assumptions: state.assumptions, overrides: state.overrides }, ...state.future], lastImpact: undefined };
    }
    case 'redo': {
      const nxt = state.future[0];
      if (!nxt) return state;
      return { ...state, ...nxt, future: state.future.slice(1), past: [...state.past, { assumptions: state.assumptions, overrides: state.overrides }], lastImpact: undefined };
    }
    case 'update':
      return { ...state, log: [{ id: uid(), at: Date.now(), kind: 'update', text: a.text, author: AUTHOR }, ...state.log] };
    case 'saveVersion': {
      const { out } = runForecast(state.assumptions, state.overrides);
      const v: Version = { id: uid(), name: a.name, at: Date.now(), assumptions: state.assumptions, overrides: state.overrides, operatingIncome: out.operatingIncome, revenue: out.revenue };
      return {
        ...state,
        versions: [v, ...state.versions].slice(0, 20),
        log: [{ id: uid(), at: Date.now(), kind: 'version', text: `Saved version "${a.name}"`, author: AUTHOR }, ...state.log],
      };
    }
    case 'loadVersion': {
      const v = state.versions.find((x) => x.id === a.id);
      if (!v) return state;
      return commit(state, { assumptions: v.assumptions, overrides: v.overrides }, `Loaded version "${v.name}"`, 'version');
    }
    case 'reset':
      return { ...state, ...commit(state, { assumptions: DEFAULT_ASSUMPTIONS, overrides: {} }, 'Reset to base case', 'version') };
  }
}

interface Store { state: State; dispatch: (a: Action) => void }

export const useForecastStore = create<Store>((set) => ({
  state: initial(),
  dispatch: (a) => set((s) => {
    if (a.type === 'cells' || a.type === 'batch' || a.type === 'assumption') trackAction('forecast_edit');
    else if (a.type === 'saveVersion') trackAction('forecast_version');
    const state = reducer(s.state, a);
    try {
      const { assumptions, overrides, log, versions } = state;
      localStorage.setItem(KEY, JSON.stringify({ assumptions, overrides, log, versions }));
    } catch { /* ignore */ }
    return { state };
  }),
}));

export function useForecast() {
  const state = useForecastStore((s) => s.state);
  const dispatch = useForecastStore((s) => s.dispatch);
  const result = useMemo(() => runForecast(state.assumptions, state.overrides), [state.assumptions, state.overrides]);
  const baseCase = useMemo(() => runForecast(DEFAULT_ASSUMPTIONS).out, []);
  return { state, dispatch, ...result, baseCase };
}

/** Read-only access to the latest saved forecast (used to seed the FY27 budget). */
export function loadSavedForecast(): Model {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return { assumptions: s.assumptions, overrides: s.overrides };
    }
  } catch { /* ignore */ }
  return { assumptions: DEFAULT_ASSUMPTIONS, overrides: {} };
}
