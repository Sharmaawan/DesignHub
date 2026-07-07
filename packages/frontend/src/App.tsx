import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import TemplatesPage from './pages/TemplatesPage';
import BrandHubPage from './pages/BrandHubPage';
import SocialConnectionsPage from './pages/SocialConnectionsPage';
import EditorPage from './pages/EditorPage';
import ProfileSettingsPage from './pages/ProfileSettingsPage';
import SubscriptionBillingPage from './pages/SubscriptionBillingPage';
import WorkspaceSettingsPage from './pages/WorkspaceSettingsPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  // A token in localStorage only proves *a* session existed — `user` itself
  // (name/avatar/id used throughout the app, including the new collaboration
  // presence feature) was never re-hydrated on a fresh load/reload, only ever
  // set in-memory by an actual login()/register() call. That's almost certainly
  // what was behind the sidebar showing a generic "User" fallback after a reload
  // earlier in this project's history.
  const { token, user, loadUser } = useAuthStore();
  useEffect(() => {
    if (token && !user) loadUser();
  }, [token, user, loadUser]);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            background: '#1B1B2F',
            color: '#fff',
            fontSize: '14px',
          },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/editor/:projectId" element={
          <ProtectedRoute><EditorPage /></ProtectedRoute>
        } />
        <Route path="/editor" element={
          <ProtectedRoute><EditorPage /></ProtectedRoute>
        } />
        <Route path="/projects" element={
          <ProtectedRoute><DashboardPage initialSection="projects" /></ProtectedRoute>
        } />
        <Route path="/templates" element={
          <ProtectedRoute><TemplatesPage /></ProtectedRoute>
        } />
        <Route path="/brand" element={
          <ProtectedRoute><BrandHubPage /></ProtectedRoute>
        } />
        <Route path="/social" element={
          <ProtectedRoute><SocialConnectionsPage /></ProtectedRoute>
        } />
        <Route path="/settings/profile" element={
          <ProtectedRoute><ProfileSettingsPage /></ProtectedRoute>
        } />
        <Route path="/settings/subscription" element={
          <ProtectedRoute><SubscriptionBillingPage /></ProtectedRoute>
        } />
        <Route path="/settings/workspace" element={
          <ProtectedRoute><WorkspaceSettingsPage /></ProtectedRoute>
        } />
        <Route path="/" element={
          <ProtectedRoute><DashboardPage /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
