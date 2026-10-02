import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Sidebar } from './components/shell/Sidebar';
import { Topbar } from './components/shell/Topbar';
import { CommandPalette } from './components/shell/CommandPalette';
import { SignIn } from './components/shell/SignIn';
import { useApp, useThemeEffect } from './lib/app';
import { initAnalytics, trackPage } from './lib/analytics';

initAnalytics();

const HomePage = lazy(() => import('./pages/HomePage'));
const IntakePage = lazy(() => import('./pages/IntakePage'));
const ActualsPage = lazy(() => import('./pages/ActualsPage'));
const ReportingPage = lazy(() => import('./pages/ReportingPage'));
const AssistantPage = lazy(() => import('./pages/AssistantPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const TrafficPage = lazy(() => import('./pages/TrafficPage'));

function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-64 animate-pulse rounded bg-surface-3" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />)}</div>
      <div className="h-80 animate-pulse rounded-lg bg-surface-2" />
    </div>
  );
}

function Shell() {
  const { pathname } = useLocation();
  useEffect(() => { trackPage(pathname); }, [pathname]);
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 py-6 lg:px-6">
          <Suspense fallback={<Loading />}>
            <Routes location={pathname}>
              <Route path="/" element={<HomePage />} />
              <Route path="/intake/*" element={<IntakePage />} />
              <Route path="/actuals/*" element={<ActualsPage />} />
              <Route path="/reporting/*" element={<ReportingPage />} />
              <Route path="/assistant" element={<AssistantPage />} />
              <Route path="/admin/*" element={<AdminPage />} />
              <Route path="/traffic" element={<TrafficPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}

export default function App() {
  useThemeEffect();
  const signedIn = useApp((s) => s.signedIn);
  useEffect(() => { if (!signedIn) trackPage('/sign-in'); }, [signedIn]);
  return (
    <MotionConfig reducedMotion="user">
      <HashRouter>{signedIn ? <Shell /> : <SignIn />}</HashRouter>
    </MotionConfig>
  );
}
