import { useEffect } from 'react';
import { create } from 'zustand';
import { COST_CENTERS } from './data';
import { trackAction, trackPersona } from './analytics';

export type Role = 'analyst' | 'approver' | 'admin';

export interface Persona {
  id: string;
  name: string;
  title: string;
  role: Role;
  initials: string;
  /** Row-level scope: cost centers this person may edit. */
  costCenters: string[];
  groups: string[]; // IdP groups mapped to the role
}

export const PERSONAS: Persona[] = [
  { id: 'jordan', name: 'Jordan Lee', title: 'Senior FP&A Analyst', role: 'analyst', initials: 'JL',
    costCenters: ['R&D', 'Marketing'], groups: ['fin-planning-contributors'] },
  { id: 'alex', name: 'Alex Rivera', title: 'VP Finance', role: 'approver', initials: 'AR',
    costCenters: COST_CENTERS, groups: ['fin-planning-approvers'] },
  { id: 'sam', name: 'Sam Okafor', title: 'Planning Administrator', role: 'admin', initials: 'SO',
    costCenters: COST_CENTERS, groups: ['fin-planning-admins'] },
];

export const ROLE_LABEL: Record<Role, string> = {
  analyst: 'Contributor',
  approver: 'Approver',
  admin: 'Administrator',
};

/** Single source of truth for access checks (UI gates + the Home access matrix). */
export const CAPABILITIES = [
  { id: 'view', label: 'View reports & actuals', roles: ['analyst', 'approver', 'admin'] },
  { id: 'forecast', label: 'Edit forecast drivers', roles: ['analyst', 'admin'] },
  { id: 'submit', label: 'Submit cost center budgets', roles: ['analyst'] },
  { id: 'approve', label: 'Approve / send back / lock', roles: ['approver'] },
  { id: 'actuals', label: 'Load & validate actuals', roles: ['admin'] },
  { id: 'admin', label: 'Manage users, roles & cycles', roles: ['admin'] },
] as const satisfies readonly { id: string; label: string; roles: Role[] }[];

export type Capability = (typeof CAPABILITIES)[number]['id'];

export const can = (p: Persona, cap: Capability) =>
  (CAPABILITIES.find((c) => c.id === cap)!.roles as readonly Role[]).includes(p.role);

export const canEditCostCenter = (p: Persona, cc: string) => can(p, 'submit') && p.costCenters.includes(cc);

type Theme = 'system' | 'light' | 'dark';

interface AppState {
  signedIn: boolean;
  personaId: string;
  theme: Theme;
  navCollapsed: boolean;
  paletteOpen: boolean;
  bannerDismissed: boolean;
  signIn: (personaId: string) => void;
  signOut: () => void;
  setPersona: (id: string) => void;
  setTheme: (t: Theme) => void;
  toggleNav: () => void;
  setPalette: (open: boolean) => void;
  dismissBanner: () => void;
}

const KEY = 'northwind.app.v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();

export const useApp = create<AppState>((set, get) => {
  const save = () => {
    const { signedIn, personaId, theme, navCollapsed, bannerDismissed } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ signedIn, personaId, theme, navCollapsed, bannerDismissed })); } catch { /* ignore */ }
  };
  const upd = (patch: Partial<AppState>) => { set(patch); save(); };
  return {
    signedIn: saved.signedIn ?? false,
    personaId: saved.personaId ?? 'jordan',
    theme: saved.theme ?? 'system',
    navCollapsed: saved.navCollapsed ?? false,
    bannerDismissed: saved.bannerDismissed ?? false,
    paletteOpen: false,
    signIn: (personaId) => { upd({ signedIn: true, personaId }); trackPersona(PERSONAS.find((p) => p.id === personaId)?.role ?? 'unknown'); },
    signOut: () => upd({ signedIn: false }),
    setPersona: (personaId) => {
      if (personaId !== get().personaId) { trackAction('switch_persona'); trackPersona(PERSONAS.find((p) => p.id === personaId)?.role ?? 'unknown'); }
      upd({ personaId });
    },
    setTheme: (theme) => { trackAction('theme_toggle'); upd({ theme }); },
    toggleNav: () => upd({ navCollapsed: !get().navCollapsed }),
    setPalette: (paletteOpen) => { if (paletteOpen) trackAction('command_palette'); set({ paletteOpen }); },
    dismissBanner: () => upd({ bannerDismissed: true }),
  };
});

export const usePersona = () => {
  const id = useApp((s) => s.personaId);
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
};

/** Apply the theme to <html data-theme>, following the OS when set to "system". */
export function useThemeEffect() {
  const theme = useApp((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
