import { Navigate, Route, Routes } from 'react-router-dom';
import { ClipboardList, SlidersHorizontal } from 'lucide-react';
import { PageHeader, Tabs } from '../components/ui/primitives';
import { Page } from '../components/motion';
import { useMyQueue } from '../components/shell/Sidebar';
import { ForecastView } from './intake/ForecastView';
import { SubmissionsView } from './intake/SubmissionsView';

export default function IntakePage() {
  const queue = useMyQueue();
  return (
    <Page>
      <PageHeader
        eyebrow="FY27 planning cycle"
        title="Forecast Intake"
        description="Driver-based forecast maintained by FP&A, and cost center budgets submitted by owners and approved by finance."
      />
      <Tabs tabs={[
        { to: '/intake/forecast', label: 'Driver forecast', icon: SlidersHorizontal },
        { to: '/intake/submissions', label: 'Cost center submissions', icon: ClipboardList, count: queue },
      ]} />
      <Routes>
        <Route index element={<Navigate to="forecast" replace />} />
        <Route path="forecast" element={<ForecastView />} />
        <Route path="submissions" element={<SubmissionsView />} />
      </Routes>
    </Page>
  );
}
