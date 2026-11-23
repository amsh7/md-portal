import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useHospitals, byId } from '../../lib/queries';
import { Quotation, QuotationStatus, qBadgeCls } from '../../lib/purchasing';
import { fmtDate } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

export function QuoteStatusBadge({ status }: { status: QuotationStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-0.5 ${qBadgeCls(status)}`}>
      {t(`quote.status.${status}`)}
    </span>
  );
}

export default function Quotations() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: hospitals } = useHospitals();
  const hospitalMap = byId(hospitals);
  const [creating, setCreating] = useState(false);
  const [hospitalId, setHospitalId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const ar = i18n.language === 'ar';

  const { data: quotes, isLoading } = useQuery({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Quotation[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: qNo, error: numErr } = await supabase.rpc('next_doc_number', { p_kind: 'q' });
      if (numErr) throw numErr;
      const { data, error } = await supabase
        .from('quotations')
        .insert({ q_no: qNo, hospital_id: hospitalId, valid_until: validUntil || null })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
      setCreating(false);
      navigate(`/purchasing/quotes/${id}`);
    },
  });

  function hospitalName(id: string) {
    const h = hospitalMap[id];
    return h ? (ar && h.name_ar ? h.name_ar : h.name) : '—';
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (hospitalId) create.mutate();
  }

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <PrimaryButton onClick={() => { setHospitalId(''); setValidUntil(''); setCreating(true); }}>
          {t('quote.new')}
        </PrimaryButton>
      </div>
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('quote.no')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('crm.hospital')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('common.date')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden sm:table-cell">{t('quote.validUntil')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('po.statusLabel')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!quotes?.length && (
              <tr><td colSpan={5}><EmptyState hint={t('quote.empty')} /></td></tr>
            )}
            {quotes?.map((q) => (
              <tr key={q.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5" dir="ltr">
                  <Link to={`/purchasing/quotes/${q.id}`} className="font-medium text-brand-red hover:underline">
                    {q.q_no}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{hospitalName(q.hospital_id)}</td>
                <td className="px-4 py-2.5">{fmtDate(q.created_at)}</td>
                <td className="px-4 py-2.5 hidden sm:table-cell">{fmtDate(q.valid_until)}</td>
                <td className="px-4 py-2.5"><QuoteStatusBadge status={q.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title={t('quote.new')} onClose={() => setCreating(false)}>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t('crm.hospital')} required>
              <select className={inputCls} value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} autoFocus>
                <option value="">—</option>
                {(hospitals ?? []).map((h) => (
                  <option key={h.id} value={h.id}>{ar && h.name_ar ? h.name_ar : h.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t('quote.validUntil')}>
              <input type="date" className={inputCls} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </Field>
            {create.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-600 border rounded px-4 py-2" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </button>
              <PrimaryButton type="submit" disabled={create.isPending || !hospitalId}>
                {t('common.save')}
              </PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
