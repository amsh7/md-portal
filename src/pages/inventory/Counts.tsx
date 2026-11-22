import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useHospitals, useProfiles, byId } from '../../lib/queries';
import { ShelfCount, createShelfCount } from '../../lib/counts';
import { fmtDate } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

export function CountStatusBadge({ status }: { status: ShelfCount['status'] }) {
  const { t } = useTranslation();
  const cls =
    status === 'approved' ? 'bg-green-100 text-green-800'
    : status === 'submitted' ? 'bg-yellow-100 text-yellow-800'
    : status === 'rejected' ? 'bg-red-100 text-red-700'
    : 'bg-gray-200 text-gray-600';
  return <span className={`text-xs rounded px-2 py-0.5 ${cls}`}>{t(`counts.statuses.${status}`)}</span>;
}

export default function Counts() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { data: hospitals } = useHospitals();
  const { data: profiles } = useProfiles();
  const hospitalMap = byId(hospitals);
  const profileMap = byId(profiles);
  const [choosing, setChoosing] = useState(false);
  const [hospitalId, setHospitalId] = useState('');
  const ar = i18n.language === 'ar';

  const { data: counts, isLoading } = useQuery({
    queryKey: ['counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shelf_counts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as ShelfCount[];
    },
  });

  const start = useMutation({
    mutationFn: () => createShelfCount(hospitalId),
    onSuccess: (id) => navigate(`/inventory/counts/${id}`),
  });

  // Reps start counts only for their own hospitals; managers/admin for any.
  const startable = (hospitals ?? []).filter(
    (h) => profile?.role !== 'sales_rep' || h.assigned_rep_id === profile.id,
  );

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <PrimaryButton onClick={() => setChoosing(true)}>+ {t('counts.new')}</PrimaryButton>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('crm.hospital')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('counts.countedAt')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden sm:table-cell">{t('counts.rep')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('crm.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!counts?.length && (
              <tr><td colSpan={4}><EmptyState hint={t('counts.empty')} /></td></tr>
            )}
            {counts?.map((c) => {
              const h = hospitalMap[c.hospital_id];
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <Link to={`/inventory/counts/${c.id}`} className="font-medium text-brand-red hover:underline">
                      {h ? (ar && h.name_ar ? h.name_ar : h.name) : '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{fmtDate(c.counted_at)}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">{profileMap[c.rep_id]?.full_name ?? '—'}</td>
                  <td className="px-4 py-2.5"><CountStatusBadge status={c.status} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {choosing && (
        <Modal title={t('counts.new')} onClose={() => setChoosing(false)}>
          <form onSubmit={(e) => { e.preventDefault(); start.mutate(); }} className="space-y-3">
            <Field label={t('counts.chooseHospital')} required>
              <select className={inputCls} required value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
                <option value="">—</option>
                {startable.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </Field>
            {start.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setChoosing(false)}>{t('common.cancel')}</button>
              <PrimaryButton type="submit" disabled={start.isPending || !hospitalId}>{t('counts.start')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
