import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { CURRENCIES, PoStatus, PurchaseOrder, poBadgeCls } from '../../lib/purchasing';
import { fmtDate } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

export function PoStatusBadge({ status }: { status: PoStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-0.5 ${poBadgeCls(status)}`}>
      {t(`po.status.${status}`)}
    </span>
  );
}

export default function PurchaseOrders() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const isAM = profile?.role === 'admin' || profile?.role === 'manager';

  const { data: pos, isLoading } = useQuery({
    queryKey: ['pos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as PurchaseOrder[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: poNo, error: numErr } = await supabase.rpc('next_doc_number', { p_kind: 'po' });
      if (numErr) throw numErr;
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert({ po_no: poNo, supplier: supplier.trim(), currency })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['pos'] });
      setCreating(false);
      navigate(`/purchasing/pos/${id}`);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (supplier.trim()) create.mutate();
  }

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      {isAM && (
        <div className="flex justify-end">
          <PrimaryButton onClick={() => { setSupplier(''); setCurrency('EGP'); setCreating(true); }}>
            {t('po.new')}
          </PrimaryButton>
        </div>
      )}
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('po.no')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('po.supplier')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden sm:table-cell">{t('po.currency')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('common.date')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('po.statusLabel')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!pos?.length && (
              <tr><td colSpan={5}><EmptyState hint={t('po.empty')} /></td></tr>
            )}
            {pos?.map((po) => (
              <tr key={po.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5" dir="ltr">
                  <Link to={`/purchasing/pos/${po.id}`} className="font-medium text-brand-red hover:underline">
                    {po.po_no}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{po.supplier}</td>
                <td className="px-4 py-2.5 hidden sm:table-cell">{po.currency}</td>
                <td className="px-4 py-2.5">{fmtDate(po.created_at)}</td>
                <td className="px-4 py-2.5"><PoStatusBadge status={po.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title={t('po.new')} onClose={() => setCreating(false)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t('po.supplier')} required>
              <input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} autoFocus />
            </Field>
            <Field label={t('po.currency')}>
              <select className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            {create.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-600 border rounded px-4 py-2" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </button>
              <PrimaryButton type="submit" disabled={create.isPending || !supplier.trim()}>
                {t('common.save')}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
