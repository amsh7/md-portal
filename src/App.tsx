import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Placeholder from './pages/Placeholder';
import { navForRole } from './lib/roles';

function Guard({ children, path }: { children: JSX.Element; path: string }) {
  const { profile } = useAuth();
  if (!profile) return null;
  const allowed = navForRole(profile.role).some((i) => i.path === path);
  return allowed ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { session, profile, loading, signOut } = useAuth();
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        {t('common.loading')}
      </div>
    );
  }

  if (!session) return <Login />;

  if (profile && !profile.active) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-gray-700">{t('login.inactive')}</p>
        <button onClick={signOut} className="text-brand-red font-medium">
          {t('header.signOut')}
        </button>
      </div>
    );
  }

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="crm" element={<Guard path="/crm"><Placeholder moduleKey="crm" /></Guard>} />
          <Route path="inventory" element={<Guard path="/inventory"><Placeholder moduleKey="inventory" /></Guard>} />
          <Route path="purchasing" element={<Guard path="/purchasing"><Placeholder moduleKey="purchasing" /></Guard>} />
          <Route path="hr" element={<Guard path="/hr"><Placeholder moduleKey="hr" /></Guard>} />
          <Route path="attendance" element={<Guard path="/attendance"><Placeholder moduleKey="attendance" /></Guard>} />
          <Route path="users" element={<Guard path="/users"><Users /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
