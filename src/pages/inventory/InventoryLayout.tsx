import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

export default function InventoryLayout() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium rounded-t border-b-2 whitespace-nowrap ${
      isActive ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-800'
    }`;

  const showMovements = profile && ['admin', 'manager', 'warehouse'].includes(profile.role);
  const showLocations = profile?.role === 'admin';

  return (
    <div>
      <div className="flex gap-1 border-b mb-4 overflow-x-auto">
        <NavLink to="/inventory" end className={tabCls}>{t('inv.stock')}</NavLink>
        {showMovements && <NavLink to="/inventory/movements" className={tabCls}>{t('inv.movements')}</NavLink>}
        <NavLink to="/inventory/products" className={tabCls}>{t('inv.products')}</NavLink>
        {showLocations && <NavLink to="/inventory/locations" className={tabCls}>{t('inv.locations')}</NavLink>}
      </div>
      <Outlet />
    </div>
  );
}
