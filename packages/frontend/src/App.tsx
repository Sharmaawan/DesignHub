import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './stores/authStore';

// Every page used to be a static import, so visiting /login alone pulled in the
// editor's Konva/react-konva code, DOCX/PDF/XLSX import libraries, and every other
// page's code too — one ~1MB bundle for any single page. Lazy-loading per route
// means each page only downloads and parses its own code the first time it's
// actually visited, which is what was making the whole site feel slow to load.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const BrandHubPage = lazy(() => import('./pages/BrandHubPage'));
const SocialConnectionsPage = lazy(() => import('./pages/SocialConnectionsPage'));
const EditorPage = lazy(() => import('./pages/EditorPage'));
const ProfileSettingsPage = lazy(() => import('./pages/ProfileSettingsPage'));
const SubscriptionBillingPage = lazy(() => import('./pages/SubscriptionBillingPage'));
const WorkspaceSettingsPage = lazy(() => import('./pages/WorkspaceSettingsPage'));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="w-8 h-8 border-3 border-canva-purple border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
      <Suspense fallback={<RouteLoadingFallback />}>
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
      </Suspense>
    </BrowserRouter>
  );
}
