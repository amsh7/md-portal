import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useHospitals, useProfiles, byId } from '../../lib/queries';
import { AttendanceLog, Visit } from '../../lib/hr';
import { fmtDate, fmtQty, fmtTime } from '../../lib/format';
import { EmptyState, inputCls } from '../../components/ui';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function Reports() {
  const { t, i18n } = useTranslation();
  const { data: profiles } = useProfiles();
  const { data: hospitals } = useHospitals();
  const profileMap = byId(profiles);
  const hospitalMap = byId(hospitals);
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(thisMonth());
  const ar = i18n.language === 'ar';

  const { data: dayLogs } = useQuery({
    queryKey: ['attendance', 'report', date],
    queryFn: async () => {
      const from = new Date(`${date}T00:00:00`);
      const to = new Date(from.getTime() + 86400000);
      const { data, error } = await supabase
        .from('attendance_logs').select('*')
        .gte('ts', from.toISOString()).lt('ts', to.toISOString())
        .order('ts');
      if (error) throw error;
      return data as AttendanceLog[];
    },
  });

  const { data: monthVisits } = useQuery({
    queryKey: ['visits', 'report', month],
    queryFn: async () => {
      const from = new Date(`${month}-01T00:00:00`);
      const to = new Date(from);
      to.setMonth(to.getMonth() + 1);
      const { data, error } = await supabase
        .from('visits').select('*')
        .gte('ts', from.toISOString()).lt('ts', to.toISOString())
        .order('ts', { ascending: false }).limit(500);
      if (error) throw error;
      return data as Visit[];
    },
  });

  function personName(id: string) {
    const p = profileMap[id];
    return p ? (ar && p.full_name_ar ? p.full_name_ar : p.full_name) : '—';
  }

  // attendance per employee: first check-in, last check-out
  const byEmployee: Record<string, { firstIn: string | null; lastOut: string | null }> = {};
  for (const l of dayLogs ?? []) {
    const e = (byEmployee[l.employee_id] ??= { firstIn: null, lastOut: null });
    if (l.type === 'check_in' && !e.firstIn) e.firstIn = l.ts;
    if (l.type === 'check_out') e.lastOut = l.ts;
  }

  // visits per rep
  const visitsByRep: Record<string, Visit[]> = {};
  for (const v of monthVisits ?? []) (visitsByRep[v.rep_id] ??= []).push(v);

  return (
    <div className="space-y-6 max-w-3xl">
      <section>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="font-semibold text-sm">{t('att.attendanceReport')}</h2>
          <input type="date" className={`${inputCls} w-auto`} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-2.5 text-start font-semibold">{t('users.name')}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t('att.checkIn')}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t('att.checkOut')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!Object.keys(byEmployee).length && (
                <tr><td colSpan={3}><EmptyState hint={t('att.noLogs')} /></td></tr>
              )}
              {Object.entries(byEmployee).map(([eid, e]) => (
                <tr key={eid}>
                  <td className="px-4 py-2.5 font-medium">{personName(eid)}</td>
                  <td className="px-4 py-2.5 text-end" dir="ltr">{fmtTime(e.firstIn)}</td>
                  <td className="px-4 py-2.5 text-end" dir="ltr">{fmtTime(e.lastOut)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="flex items-center gap-3 mb-2">
          <h2 className="font-semibold text-sm">{t('att.visitsReport')}</h2>
          <input type="month" className={`${inputCls} w-auto`} value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {!Object.keys(visitsByRep).length ? (
          <div className="bg-white rounded-lg border"><EmptyState hint={t('att.noVisits')} /></div>
        ) : (
          <div className="space-y-3">
            {Object.entries(visitsByRep).map(([rid, vs]) => (
              <div key={rid} className="bg-white rounded-lg border">
                <div className="px-4 py-2.5 border-b flex items-center justify-between">
                  <span className="font-semibold text-sm">{personName(rid)}</span>
                  <span className="text-xs text-gray-500">{t('att.visitCount', { n: fmtQty(vs.length) })}</span>
                </div>
                <div className="divide-y">
                  {vs.map((v) => (
                    <div key={v.id} className="px-4 py-2 flex items-center justify-between text-sm gap-3">
                      <span>
                        {hospitalMap[v.hospital_id]
                          ? (ar && hospitalMap[v.hospital_id].name_ar) || hospitalMap[v.hospital_id].name
                          : '—'}
                        <span className="text-xs text-gray-500"> · {t(`att.purposes.${v.purpose}`)}</span>
                      </span>
                      <span className="text-xs text-gray-400 shrink-0" dir="ltr">{fmtDate(v.ts)} {fmtTime(v.ts)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
