// App.tsx — Root component: routing, theme, toast provider

import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';

// Auth pages
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';

// App pages
import DashboardPage from '@/pages/dashboard/DashboardPage';
import AssessmentPage from '@/pages/assessment/AssessmentPage';
import PatientListPage from '@/pages/patient/PatientListPage';
import PatientHistoryPage from '@/pages/patient/PatientHistoryPage';
import ResultsPage from '@/pages/results/ResultsPage';
import ModelManagementPage from '@/pages/admin/ModelManagementPage';
import UserManagementPage from '@/pages/admin/UserManagementPage';
import SettingsPage from '@/pages/settings/SettingsPage';

// Layout
import AppLayout from '@/components/layouts/AppLayout';

// Protected route wrapper
function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  const { theme } = useThemeStore();
  const { isAuthenticated, fetchMe } = useAuthStore();

  // Rehydrate user on page load if token exists
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token && isAuthenticated) {
      fetchMe().catch(() => {});
    }
  }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-mid)',
            backdropFilter: 'blur(20px)',
            borderRadius: '10px',
            fontSize: '0.9rem',
          },
          success: { iconTheme: { primary: '#10B981', secondary: 'white' } },
          error:   { iconTheme: { primary: '#EF4444', secondary: 'white' } },
        }}
      />

      <Routes>
        {/* Public */}
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/register"        element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/"                element={<Navigate to="/dashboard" replace />} />

        {/* Protected — inside AppLayout */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard"        element={<DashboardPage />} />
          <Route path="/assessment"       element={<AssessmentPage />} />
          <Route path="/patients"         element={<PatientListPage />} />
          <Route path="/patients/:id"     element={<PatientHistoryPage />} />
          <Route path="/results/:predictionId" element={<ResultsPage />} />
          <Route path="/settings"         element={<SettingsPage />} />

          {/* Admin only */}
          <Route path="/models" element={
            <ProtectedRoute adminOnly><ModelManagementPage /></ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute adminOnly><UserManagementPage /></ProtectedRoute>
          } />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
