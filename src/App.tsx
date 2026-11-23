import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import CrmLayout from './pages/crm/CrmLayout';
import Hospitals from './pages/crm/Hospitals';
import HospitalDetail from './pages/crm/HospitalDetail';
import Deals from './pages/crm/Deals';
import InventoryLayout from './pages/inventory/InventoryLayout';
import Stock from './pages/inventory/Stock';
import Movements from './pages/inventory/Movements';
import Counts from './pages/inventory/Counts';
import CountEditor from './pages/inventory/CountEditor';
import Invoices from './pages/inventory/Invoices';
import Products from './pages/inventory/Products';
import Locations from './pages/inventory/Locations';
import PurchasingLayout from './pages/purchasing/PurchasingLayout';
import PurchaseOrders from './pages/purchasing/PurchaseOrders';
import PoEditor from './pages/purchasing/PoEditor';
import Quotations from './pages/purchasing/Quotations';
import QuotationEditor from './pages/purchasing/QuotationEditor';
import HrLayout from './pages/hr/HrLayout';
import MyLeave from './pages/hr/MyLeave';
import Approvals from './pages/hr/Approvals';
import AnnouncementsAdmin from './pages/hr/AnnouncementsAdmin';
import AttendanceLayout from './pages/attendance/AttendanceLayout';
import CheckIn from './pages/attendance/CheckIn';
import Visits from './pages/attendance/Visits';
import Reports from './pages/attendance/Reports';
import { navForRole } from './lib/roles';

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

  if (!session) return hash.startsWith('#/signup') ? <Signup /> : <Login />;

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
            <Route path="approvals" element={<Approvals />} />
            <Route path="announcements" element={<AnnouncementsAdmin />} />
          </Route>
          <Route path="attendance" element={<Guard path="/attendance"><AttendanceLayout /></Guard>}>
            <Route index element={<CheckIn />} />
            <Route path="visits" element={<Visits />} />
            <Route path="reports" element={<Reports />} />
          </Route>
          <Route path="users" element={<Guard path="/users"><Users /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
