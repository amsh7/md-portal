import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { canApprove } from '../../lib/roles';
import { useHospitals, useProducts, useProfiles, byId } from '../../lib/queries';
import { ShelfCount, ShelfCountLine, lineFlag } from '../../lib/counts';
import { fmtDate, fmtQty } from '../../lib/format';
import { EmptyState, ErrorNote, Loading, PrimaryButton } from '../../components/ui';
import { CountStatusBadge } from './Counts';

export default function CountEditor() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: hospitals } = useHospitals();
  const { data: products } = useProducts();
  const { data: profiles } = useProfiles();
  const hospitalMap = byId(hospitals);
  const productMap = byId(products);
  const profileMap = byId(profiles);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const ar = i18n.language === 'ar';

  const { data: count, isLoading } = useQuery({
    queryKey: ['count', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('shelf_counts').select('*').eq('id', id).single();
      if (error) throw error;
      return data as ShelfCount;
    },
  });

  const { data: lines } = useQuery({
    queryKey: ['count_lines', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shelf_count_lines')
        .select('*')
        .eq('shelf_count_id', id)
        .order('lot_no');
      if (error) throw error;
      return data as ShelfCountLine[];
    },
  });

  // Seed the local inputs once the lines arrive
  useEffect(() => {
    if (lines) {
      setCounted((prev) =>
        Object.keys(prev).length ? prev : Object.fromEntries(lines.map((l) => [l.id, String(l.counted_qty)])),
      );
    }
  }, [lines]);

  const isAM = profile?.role === 'admin' || profile?.role === 'manager';
  const isMine = count?.rep_id === profile?.id;
  const editable = count?.status === 'draft' && (isMine || isAM);
  // Shelf counts: manager (Wael) OR the GM/approver may decide (Ahmed's rule, Nov 2026).
  const canDecide = count?.status === 'submitted' && (isAM || canApprove(profile));

  async function persistLines() {
    for (const l of lines ?? []) {
      const c = Number(counted[l.id] ?? l.counted_qty);
      if (c !== l.counted_qty) {
        const { error } = await supabase
          .from('shelf_count_lines')
          .update({ counted_qty: c, usage_qty: l.expected_qty - c })
          .eq('id', l.id);
        if (error) throw error;
      }
    }
  }

  const saveDraft = useMutation({
    mutationFn: persistLines,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['count_lines', id] });
      setMessage(t('users.saved'));
      setTimeout(() => setMessage(null), 2500);
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      await persistLines();
      const { error } = await supabase.from('shelf_counts').update({ status: 'submitted' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['count', id] });
      qc.invalidateQueries({ queryKey: ['counts'] });
    },
  });

  const approve = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('approve_shelf_count', { p_count_id: id });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (invoiceId) => {
      qc.invalidateQueries();
      setMessage(invoiceId ? t('counts.approvedMsg') : t('counts.approvedNoUsage'));
    },
  });

  const reject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('shelf_counts').update({ status: 'rejected' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['count', id] });
      qc.invalidateQueries({ queryKey: ['counts'] });
      setMessage(t('counts.rejectedMsg'));
    },
  });

  if (isLoading || !count) return <Loading />;

  const hospital = hospitalMap[count.hospital_id];
  const hospitalName = hospital ? (ar && hospital.name_ar ? hospital.name_ar : hospital.name) : '—';

  function usageOf(l: ShelfCountLine) {
    const c = counted[l.id];
    return l.expected_qty - (c === undefined || c === '' ? l.counted_qty : Number(c));
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/inventory/counts" className="text-sm text-gray-400 hover:text-brand-red">←</Link>
        <h1 className="text-lg font-bold">{hospitalName}</h1>
        <CountStatusBadge status={count.status} />
        <span className="text-sm text-gray-500">{fmtDate(count.counted_at)}</span>
        <span className="text-sm text-gray-400">{profileMap[count.rep_id]?.full_name}</span>
        {message && <span className="text-sm text-green-700 ms-auto">{message}</span>}
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.product')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.lot')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('counts.expected')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('counts.counted')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('counts.usage')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!lines?.length && (
              <tr><td colSpan={5}><EmptyState hint={t('counts.emptyLines')} /></td></tr>
            )}
            {lines?.map((l) => {
              const usage = usageOf(l);
              const flag = lineFlag({ expected_qty: l.expected_qty, usage_qty: usage });
              return (
                <tr key={l.id}>
                  <td className="px-4 py-2.5">{productMap[l.product_id]?.name ?? '—'}</td>
                  <td className="px-4 py-2.5" dir="ltr">{l.lot_no}</td>
                  <td className="px-4 py-2.5 text-end">{fmtQty(l.expected_qty)}</td>
                  <td className="px-4 py-2.5 text-end">
                    {editable ? (
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="1"
                        className="w-24 border rounded px-2 py-2 text-end text-base"
                        value={counted[l.id] ?? String(l.counted_qty)}
                        onChange={(e) => setCounted({ ...counted, [l.id]: e.target.value })}
                      />
                    ) : (
                      fmtQty(l.counted_qty)
                    )}
                  </td>
                  <td className={`px-4 py-2.5 text-end font-medium ${
                    flag === 'negative' ? 'text-brand-red' : flag === 'large' ? 'text-amber-600' : ''
                  }`}>
                    {fmtQty(usage)}
                    {flag && (
                      <div className="text-xs font-normal">{t(`counts.${flag}`)}</div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(saveDraft.isError || submit.isError || approve.isError || reject.isError) && (
        <ErrorNote message={t('common.error')} />
      )}

      <div className="flex gap-2 justify-end">
        {editable && (
          <>
            <button
              className="text-sm text-gray-600 border rounded px-4 py-2"
              disabled={saveDraft.isPending}
              onClick={() => saveDraft.mutate()}
            >
              {t('counts.saveDraft')}
            </button>
            <PrimaryButton
              disabled={submit.isPending || !lines?.length}
              onClick={() => window.confirm(t('counts.confirmSubmit')) && submit.mutate()}
            >
              {t('counts.submit')}
            </PrimaryButton>
          </>
        )}
        {canDecide && (
          <>
            <button
              className="text-sm text-gray-600 border rounded px-4 py-2"
              disabled={reject.isPending}
              onClick={() => window.confirm(t('counts.confirmReject')) && reject.mutate()}
            >
              {t('counts.reject')}
            </button>
            <PrimaryButton
              disabled={approve.isPending}
              onClick={() => window.confirm(t('counts.confirmApprove')) && approve.mutate()}
            >
              {t('counts.approve')}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}
