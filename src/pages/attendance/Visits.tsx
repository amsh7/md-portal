import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useHospitals, byId } from '../../lib/queries';
import { VISIT_PURPOSES, Visit, VisitPurpose } from '../../lib/hr';
import { getPosition } from '../../lib/geo';
import { fmtDate, fmtTime } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, PrimaryButton, inputCls } from '../../components/ui';

export default function Visits() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: hospitals } = useHospitals();
  const hospitalMap = byId(hospitals);
  const [hospitalId, setHospitalId] = useState('');
  const [purpose, setPurpose] = useState<VisitPurpose>('shelf_count');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const ar = i18n.language === 'ar';

  const { data: visits, isLoading } = useQuery({
    queryKey: ['visits', 'mine', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('visits').select('*')
        .eq('rep_id', profile!.id)
        .order('ts', { ascending: false }).limit(50);
      if (error) throw error;
      return data as Visit[];
    },
  });

  const log = useMutation({
    mutationFn: async () => {
      const pos = await getPosition();
      const { error } = await supabase.from('visits').insert({
        hospital_id: hospitalId,
        purpose,
        notes: notes || null,
        lat: pos?.lat ?? null,
        lng: pos?.lng ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits'] });
      setHospitalId(''); setNotes(''); setPurpose('shelf_count');
      setMessage(t('att.visitLogged'));
      setTimeout(() => setMessage(null), 3000);
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (hospitalId) log.mutate();
  }

  function hospitalName(id: string) {
    const h = hospitalMap[id];
    return h ? (ar && h.name_ar ? h.name_ar : h.name) : '—';
  }

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-4 max-w-2xl">
      <form onSubmit={onSubmit} className="bg-white rounded-lg border p-4 space-y-3">
        <h2 className="font-semibold text-sm">{t('att.newVisit')}</h2>
        <Field label={t('crm.hospital')} required>
          <select className={`${inputCls} text-base`} required value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
            <option value="">—</option>
            {(hospitals ?? []).map((h) => (
              <option key={h.id} value={h.id}>{ar && h.name_ar ? h.name_ar : h.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('att.purpose')}>
          <select className={`${inputCls} text-base`} value={purpose} onChange={(e) => setPurpose(e.target.value as VisitPurpose)}>
            {VISIT_PURPOSES.map((p) => <option key={p} value={p}>{t(`att.purposes.${p}`)}</option>)}
          </select>
        </Field>
        <Field label={t('common.notes')}>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {log.isError && <ErrorNote message={t('common.error')} />}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-green-700">{message}</span>
          <PrimaryButton type="submit" disabled={log.isPending || !hospitalId} className="py-3 px-6">
            {t('att.logVisit')}
          </PrimaryButton>
        </div>
        <p className="text-xs text-gray-400">{t('att.gpsNote')}</p>
      </form>

      <div className="bg-white rounded-lg border">
        <h2 className="px-4 py-2.5 border-b font-semibold text-sm">{t('att.myVisits')}</h2>
        <div className="divide-y">
          {!visits?.length && <EmptyState hint={t('att.noVisits')} />}
          {visits?.map((v) => (
            <div key={v.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-medium">{hospitalName(v.hospital_id)}</p>
                <p className="text-xs text-gray-500">
                  {t(`att.purposes.${v.purpose}`)}
                  {v.notes ? ` — ${v.notes}` : ''}
                </p>
              </div>
              <span className="text-xs text-gray-400 shrink-0" dir="ltr">
                {fmtDate(v.ts)} {fmtTime(v.ts)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
