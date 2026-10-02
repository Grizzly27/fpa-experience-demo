import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BarChart3, Library, Waypoints } from 'lucide-react';
import { PageHeader, Tabs } from '../components/ui/primitives';
import { Page } from '../components/motion';
import { VarianceView } from './reporting/VarianceView';
import { BridgeView } from './reporting/BridgeView';
import { LibraryView } from './reporting/LibraryView';

export default function ReportingPage() {
  const { search } = useLocation(); // keep ?p=period when switching tabs
  return (
    <Page>
      <PageHeader
        eyebrow="Governed semantic layer"
        title="Reporting"
        description="Plan vs actuals, operating income bridges and a report library, all reading the same curated actuals."
      />
      <Tabs tabs={[
        { to: `/reporting/variance${search}`, label: 'Plan vs actuals', icon: BarChart3 },
        { to: `/reporting/bridge${search}`, label: 'Operating income bridge', icon: Waypoints },
        { to: '/reporting/library', label: 'Report library', icon: Library },
      ]} />
      <Routes>
        <Route index element={<Navigate to="variance" replace />} />
        <Route path="variance" element={<VarianceView />} />
        <Route path="bridge" element={<BridgeView />} />
        <Route path="library" element={<LibraryView />} />
      </Routes>
    </Page>
  );
}
