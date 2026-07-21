import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function CrmLayout() {
  const { t } = useTranslation();
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium rounded-t border-b-2 ${
      isActive ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-800'
    }`;
  return (
    <div>
      <div className="flex gap-1 border-b mb-4">
        <NavLink to="/crm" end className={tabCls}>
          {t('crm.hospitals')}
        </NavLink>
        <NavLink to="/crm/deals" className={tabCls}>
          {t('crm.deals')}
        </NavLink>
      </div>
      <Outlet />
    </div>
  );
}
