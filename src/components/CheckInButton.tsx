import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { AttendanceLog } from '../lib/hr';
import { getPosition } from '../lib/geo';
import { fmtTime } from '../lib/format';

/** Big mobile-first check-in/check-out button with today's state.
 *  GPS is attached when allowed; never blocks (spec §6.5). */
export default function CheckInButton({ dark = false }: { dark?: boolean }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const { data: todayLogs } = useQuery({
    queryKey: ['attendance', 'today', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_logs').select('*')
        .eq('employee_id', profile!.id)
        .gte('ts', dayStart.toISOString())
        .order('ts');
      if (error) throw error;
      return data as AttendanceLog[];
    },
  });

  const last = todayLogs?.length ? todayLogs[todayLogs.length - 1] : undefined;
  const checkedIn = last?.type === 'check_in';

  const log = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const { error } = await supabase.from('attendance_logs').insert({
        type: checkedIn ? 'check_out' : 'check_in',
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
  });

  return (
    <div className="flex items-center gap-4">
      <button
        disabled={log.isPending}
        onClick={() => log.mutate()}
        className={`font-bold rounded-lg px-8 py-4 text-base disabled:opacity-50 ${
          checkedIn
            ? dark
              ? 'bg-white text-brand-black hover:bg-gray-100'
              : 'bg-white border-2 border-brand-black text-brand-black hover:bg-gray-50'
            : 'bg-brand-red text-white hover:bg-red-700'
        }`}
      >
        {log.isPending ? t('common.loading') : checkedIn ? t('att.checkOut') : t('att.checkIn')}
      </button>
      <div className={`text-sm ${dark ? 'text-gray-300' : 'text-gray-500'}`}>
        {checkedIn && last
          ? t('att.checkedInAt', { time: fmtTime(last.ts) })
          : t('att.notCheckedIn')}
        {log.isError && <p className="text-brand-red">{t('common.error')}</p>}
      </div>
    </div>
  );
}
