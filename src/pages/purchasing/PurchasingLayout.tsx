import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

export default function PurchasingLayout() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium rounded-t border-b-2 whitespace-nowrap ${
      isActive ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-800'
    }`;

  // POs: admin/manager/warehouse. Quotations: admin/manager/sales_rep. (RLS enforces.)
  const showPos = profile && ['admin', 'manager', 'warehouse'].includes(profile.role);
  const showQuotes = profile && ['admin', 'manager', 'sales_rep'].includes(profile.role);

  return (
    <div>
      <div className="flex gap-1 border-b mb-4 overflow-x-auto">
        {showPos && <NavLink to="/purchasing" end className={tabCls}>{t('po.title')}</NavLink>}
        {showQuotes && (
          <NavLink to={showPos ? '/purchasing/quotes' : '/purchasing'} end className={tabCls}>
            {t('quote.title')}
          </NavLink>
        )}
      </div>
      <Outlet />
    </div>
  );
}
