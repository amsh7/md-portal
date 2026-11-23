import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { AttendanceLog } from '../../lib/hr';
import { fmtDate, fmtTime } from '../../lib/format';
import { EmptyState, Loading } from '../../components/ui';
import CheckInButton from '../../components/CheckInButton';

export default function CheckIn() {
  const { t } = useTranslation();
  const { profile } = useAuth();

  const weekAgo = new Date(Date.now() - 7 * 86400000);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['attendance', 'recent', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs').select('*')
        .eq('employee_id', profile!.id)
        .gte('ts', weekAgo.toISOString())
        .order('ts', { ascending: false });
      if (error) throw error;
      return data as AttendanceLog[];
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-lg border p-5">
        <CheckInButton />
        <p className="text-xs text-gray-400 mt-3">{t('att.gpsNote')}</p>
      </div>

      <div className="bg-white rounded-lg border">
        <h2 className="px-4 py-2.5 border-b font-semibold text-sm">{t('att.lastWeek')}</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y">
            {!logs?.length && (
              <tr><td><EmptyState hint={t('att.noLogs')} /></td></tr>
            )}
            {logs?.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2.5">{fmtDate(l.ts)}</td>
                <td className="px-4 py-2.5">{t(l.type === 'check_in' ? 'att.checkIn' : 'att.checkOut')}</td>
                <td className="px-4 py-2.5 text-end" dir="ltr">{fmtTime(l.ts)}</td>
                <td className="px-4 py-2.5 text-end text-xs text-gray-400">
                  {l.lat != null ? t('att.withGps') : t('att.noGps')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
