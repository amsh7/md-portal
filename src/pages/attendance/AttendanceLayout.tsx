import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

export default function AttendanceLayout() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const tabCls = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-2 text-sm font-medium rounded-t border-b-2 whitespace-nowrap ${
      isActive ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-800'
    }`;

  const showReports = profile && ['admin', 'manager', 'hr'].includes(profile.role);

  return (
    <div>
      <div className="flex gap-1 border-b mb-4 overflow-x-auto">
        <NavLink to="/attendance" end className={tabCls}>{t('att.checkTab')}</NavLink>
        <NavLink to="/attendance/visits" className={tabCls}>{t('att.visits')}</NavLink>
        {showReports && <NavLink to="/attendance/reports" className={tabCls}>{t('att.reports')}</NavLink>}
      </div>
      <Outlet />
    </div>
  );
}
