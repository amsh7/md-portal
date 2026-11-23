import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

export default function HrLayout() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium rounded-t border-b-2 whitespace-nowrap ${
      isActive ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-800'
    }`;

  const isHr = profile && ['admin', 'hr'].includes(profile.role);

  return (
    <div>
      <div className="flex gap-1 border-b mb-4 overflow-x-auto">
        <NavLink to="/hr" end className={tabCls}>{t('hr.myLeave')}</NavLink>
        {isHr && <NavLink to="/hr/approvals" className={tabCls}>{t('hr.approvals')}</NavLink>}
        {isHr && <NavLink to="/hr/announcements" className={tabCls}>{t('dashboard.announcements')}</NavLink>}
      </div>
      <Outlet />
    </div>
  );
}
