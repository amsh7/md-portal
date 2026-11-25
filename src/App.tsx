import { Suspense, lazy, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import { navForRole } from './lib/roles';

// Each page loads on demand (code-splitting keeps the first load small).
const Signup = lazy(() => import('./pages/Signup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Users = lazy(() => import('./pages/Users'));
const CrmLayout = lazy(() => import('./pages/crm/CrmLayout'));
const Hospitals = lazy(() => import('./pages/crm/Hospitals'));
const HospitalDetail = lazy(() => import('./pages/crm/HospitalDetail'));
const Deals = lazy(() => import('./pages/crm/Deals'));
const InventoryLayout = lazy(() => import('./pages/inventory/InventoryLayout'));
const Stock = lazy(() => import('./pages/inventory/Stock'));
const Movements = lazy(() => import('./pages/inventory/Movements'));
const Counts = lazy(() => import('./pages/inventory/Counts'));
const CountEditor = lazy(() => import('./pages/inventory/CountEditor'));
const Invoices = lazy(() => import('./pages/inventory/Invoices'));
const Products = lazy(() => import('./pages/inventory/Products'));
const Locations = lazy(() => import('./pages/inventory/Locations'));
const PurchasingLayout = lazy(() => import('./pages/purchasing/PurchasingLayout'));
const PurchaseOrders = lazy(() => import('./pages/purchasing/PurchaseOrders'));
const PoEditor = lazy(() => import('./pages/purchasing/PoEditor'));
const Quotations = lazy(() => import('./pages/purchasing/Quotations'));
const QuotationEditor = lazy(() => import('./pages/purchasing/QuotationEditor'));
const HrLayout = lazy(() => import('./pages/hr/HrLayout'));
const MyLeave = lazy(() => import('./pages/hr/MyLeave'));
const Approvals = lazy(() => import('./pages/hr/Approvals'));
const OfficeRequests = lazy(() => import('./pages/hr/OfficeRequests'));
const AnnouncementsAdmin = lazy(() => import('./pages/hr/AnnouncementsAdmin'));
const AttendanceLayout = lazy(() => import('./pages/attendance/AttendanceLayout'));
const CheckIn = lazy(() => import('./pages/attendance/CheckIn'));
const Visits = lazy(() => import('./pages/attendance/Visits'));
const WeeklyReport = lazy(() => import('./pages/attendance/WeeklyReport'));
const Reports = lazy(() => import('./pages/attendance/Reports'));

/** Hash-aware pre-login routing (HashRouter only mounts after sign-in). */
function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

/** Index tab: POs for admin/manager/warehouse; sales reps land on Quotations. */
function PurchasingIndex() {
  const { profile } = useAuth();
  if (profile?.role === 'sales_rep') return <Quotations />;
  return <PurchaseOrders />;
}

function Guard({ children, path }: { children: JSX.Element; path: string }) {
  const { profile } = useAuth();
  if (!profile) return null;
  const allowed = navForRole(profile.role).some((i) => i.path === path);
  return allowed ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { session, profile, loading, signOut } = useAuth();
  const { t } = useTranslation();
  const hash = useHash();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        {t('common.loading')}
      </div>
    );
  }

  if (!session) {
    return hash.startsWith('#/signup') ? (
      <Suspense fallback={<div className="min-h-screen bg-brand-black" />}>
        <Signup />
      </Suspense>
    ) : (
      <Login />
    );
  }

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
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center text-gray-400">
            {t('common.loading')}
          </div>
        }
      >
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="crm" element={<Guard path="/crm"><CrmLayout /></Guard>}>
            <Route index element={<Hospitals />} />
            <Route path="deals" element={<Deals />} />
          </Route>
          <Route path="crm/hospitals/:id" element={<Guard path="/crm"><HospitalDetail /></Guard>} />
          <Route path="inventory" element={<Guard path="/inventory"><InventoryLayout /></Guard>}>
            <Route index element={<Stock />} />
            <Route path="movements" element={<Movements />} />
            <Route path="counts" element={<Counts />} />
            <Route path="counts/:id" element={<CountEditor />} />
            <Route path="invoices" element={<Invoices />} />
            <Route path="products" element={<Products />} />
            <Route path="locations" element={<Locations />} />
          </Route>
          <Route path="purchasing" element={<Guard path="/purchasing"><PurchasingLayout /></Guard>}>
            <Route index element={<PurchasingIndex />} />
            <Route path="pos/:id" element={<PoEditor />} />
            <Route path="quotes" element={<Quotations />} />
            <Route path="quotes/:id" element={<QuotationEditor />} />
          </Route>
          <Route path="hr" element={<Guard path="/hr"><HrLayout /></Guard>}>
            <Route index element={<MyLeave />} />
            <Route path="requests" element={<OfficeRequests />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="announcements" element={<AnnouncementsAdmin />} />
          </Route>
          <Route path="attendance" element={<Guard path="/attendance"><AttendanceLayout /></Guard>}>
            <Route index element={<CheckIn />} />
            <Route path="visits" element={<Visits />} />
            <Route path="weekly" element={<WeeklyReport />} />
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="users" element={<Guard path="/users"><Users /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </HashRouter>
  );
}
