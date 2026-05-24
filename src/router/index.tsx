import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import LoginPage from '../pages/auth/LoginPage';
import AppShell from '../components/layout/AppShell';

// Pages Modules List
import DashboardPage from '../pages/dashboard/DashboardPage';
import JobsListPage from '../pages/jobs/JobsListPage';
import JobDetailPage from '../pages/jobs/JobDetailPage';
import JobCreatePage from '../pages/jobs/JobCreatePage';
import ClientsPage from '../pages/clients/ClientsPage';
import ReportsPage from '../pages/reports/ReportsPage';
import SettingsPage from '../pages/settings/SettingsPage';

const PrivateRoute = () => {
  const token = useAuthStore((state) => state.token);
  return token ? (
    <AppShell>
      <Outlet />
    </AppShell>
  ) : (
    <Navigate to="/login" replace />
  );
};

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public auth login gateway */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected administrative workspaces */}
        <Route element={<PrivateRoute />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/jobs" element={<JobsListPage />} />
          <Route path="/jobs/new" element={<JobCreatePage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Fallback routing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
