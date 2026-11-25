import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProfiles, byId } from '../../lib/queries';
import { WeeklyReport as WR, WeeklyReportDay, addDays, weekStartOf } from '../../lib/hr';
import { fmtDate } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, PrimaryButton, inputCls } from '../../components/ui';

function emptyWeek(weekStart: string): WeeklyReportDay[] {
  return Array.from({ length: 7 }, (_, i) => ({
    date: addDays(weekStart, i),
    time_in: '',
    time_out: '',
    notes: '',
  }));
}

function dayName(iso: string, lang: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long' });
}

export default function WeeklyReport() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const isRep = profile?.role === 'sales_rep';
  const { data: profiles } = useProfiles();
  const profileMap = byId(profiles);
  const ar = i18n.language === 'ar';

  // The 4 most recent FINISHED weeks (latest first).
  const weeks = useMemo(() => {
    const lastFinished = addDays(weekStartOf(new Date()), -7);
    return Array.from({ length: 4 }, (_, i) => addDays(lastFinished, -7 * i));
  }, []);
  const [week, setWeek] = useState(weeks[0]);
  const [days, setDays] = useState<WeeklyReportDay[]>(() => emptyWeek(weeks[0]));
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: reports, isLoading } = useQuery({
    queryKey: ['weekly_reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_reports').select('*')
        .order('week_start', { ascending: false }).limit(200);
      if (error) throw error;
      return data as WR[];
    },
  });

  const myReport = isRep
    ? (reports ?? []).find((r) => r.rep_id === profile!.id && r.week_start === week)
    : undefined;

  useEffect(() => {
    setSaveError(null);
    if (myReport?.days?.length) setDays(myReport.days);
    else setDays(emptyWeek(week));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, myReport?.id, myReport?.status]);

  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      const { error } = await supabase.from('weekly_reports').upsert(
        {
          rep_id: profile!.id,
          week_start: week,
          days,
          status: submit ? 'submitted' : 'draft',
        },
        { onConflict: 'rep_id,week_start' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekly_reports'] });
      setSaveError(null);
    },
    onError: (err) => {
      setSaveError(/after the week ends/i.test((err as Error).message ?? '') ? t('wr.tooEarly') : t('common.error'));
    },
  });

  function setDay(i: number, patch: Partial<WeeklyReportDay>) {
    setDays((d) => d.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  }

  function repName(id: string) {
    const p = profileMap[id];
    return p ? (ar && p.full_name_ar ? p.full_name_ar : p.full_name) : '—';
  }

  if (isLoading) return <Loading />;

  const submitted = myReport?.status === 'submitted';

  // -------- rep view: fill in my week --------
  const repView = isRep && (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label={t('wr.week')}>
          <select className={inputCls} value={week} onChange={(e) => setWeek(e.target.value)}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {fmtDate(w)} – {fmtDate(addDays(w, 6))}
              </option>
            ))}
          </select>
        </Field>
        {submitted ? (
          <span className="inline-block text-sm font-medium rounded-full px-3 py-1 bg-green-100 text-green-700">
            {t('wr.submittedOn')} {myReport?.submitted_at ? fmtDate(myReport.submitted_at) : ''}
          </span>
        ) : (
          <div className="flex gap-2">
            <button
              className="text-sm border rounded px-4 py-2 text-gray-600 hover:bg-gray-50"
              onClick={() => save.mutate(false)}
              disabled={save.isPending}
            >
              {t('wr.saveDraft')}
            </button>
            <PrimaryButton
              disabled={save.isPending}
              onClick={() => window.confirm(t('wr.confirmSubmit')) && save.mutate(true)}
            >
              {t('wr.submit')}
            </PrimaryButton>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-500">{t('wr.hint')}</p>
      {saveError && <ErrorNote message={saveError} />}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('wr.day')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('wr.timeIn')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('wr.timeOut')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('wr.where')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {days.map((d, i) => (
              <tr key={d.date}>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span className="font-medium">{dayName(d.date, i18n.language)}</span>
                  <span className="text-gray-400 text-xs"> {fmtDate(d.date)}</span>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="time" className={inputCls} value={d.time_in} disabled={submitted}
                    onChange={(e) => setDay(i, { time_in: e.target.value })}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="time" className={inputCls} value={d.time_out} disabled={submitted}
                    onChange={(e) => setDay(i, { time_out: e.target.value })}
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    className={inputCls} value={d.notes} disabled={submitted}
                    placeholder={t('wr.wherePlaceholder')}
                    onChange={(e) => setDay(i, { notes: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // -------- management view: read submitted reports --------
  const subs = (reports ?? []).filter((r) => r.status === 'submitted' && r.rep_id !== profile?.id);
  const managementView = !isRep && (
    <div className="space-y-4">
      {!subs.length && <EmptyState hint={t('wr.noneSubmitted')} />}
      {subs.map((r) => (
        <details key={r.id} className="bg-white rounded-lg border">
          <summary className="px-4 py-3 cursor-pointer flex flex-wrap gap-x-4 gap-y-1 items-center text-sm">
            <span className="font-semibold">{repName(r.rep_id)}</span>
            <span className="text-gray-500">{fmtDate(r.week_start)} – {fmtDate(addDays(r.week_start, 6))}</span>
            <span className="text-xs text-gray-400">
              {t('wr.submittedOn')} {r.submitted_at ? fmtDate(r.submitted_at) : ''}
            </span>
          </summary>
          <table className="w-full text-sm border-t">
            <tbody className="divide-y">
              {(r.days ?? []).map((d) => (
                <tr key={d.date}>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="font-medium">{dayName(d.date, i18n.language)}</span>
                    <span className="text-gray-400 text-xs"> {fmtDate(d.date)}</span>
                  </td>
                  <td className="px-4 py-2" dir="ltr">{d.time_in || '—'}</td>
                  <td className="px-4 py-2" dir="ltr">{d.time_out || '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{d.notes || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );

  return (
    <div className="max-w-4xl">
      {repView}
      {managementView}
    </div>
  );
}
