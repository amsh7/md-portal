import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProfiles, byId } from '../../lib/queries';
import { canApprove, isFinanceApprover } from '../../lib/roles';
import { OfficeRequest, OfficeRequestStatus, officeBadgeCls } from '../../lib/hr';
import { fmtDate, fmtQty } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

function StatusBadge({ status }: { status: OfficeRequestStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-0.5 ${officeBadgeCls(status)}`}>
      {t(`oreq.status.${status}`)}
    </span>
  );
}

export default function OfficeRequests() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const profileMap = byId(profiles);
  const ar = i18n.language === 'ar';

  const [creating, setCreating] = useState(false);
  const [item, setItem] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [deciding, setDeciding] = useState<{ req: OfficeRequest; approve: boolean } | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  const finance = isFinanceApprover(profile);
  const approver = canApprove(profile);

  const { data: requests, isLoading } = useQuery({
    queryKey: ['office_requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('office_requests').select('*')
        .order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data as OfficeRequest[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('office_requests').insert({
        item: item.trim(),
        qty: Number(qty) || 1,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office_requests'] });
      setCreating(false); setItem(''); setQty('1'); setNotes('');
    },
  });

  const decide = useMutation({
    mutationFn: async ({ req, approve }: { req: OfficeRequest; approve: boolean }) => {
      const { error } = await supabase.rpc('decide_office_request', {
        p_request_id: req.id,
        p_approve: approve,
        p_comment: comment || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office_requests'] });
      setDeciding(null); setComment(''); setError(null);
    },
    onError: () => setError(t('common.error')),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('office_requests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office_requests'] }),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (item.trim()) create.mutate();
  }

  function name(id: string | null) {
    if (!id) return '—';
    const p = profileMap[id];
    return p ? (ar && p.full_name_ar ? p.full_name_ar : p.full_name) : '—';
  }

  if (isLoading) return <Loading />;

  const all = requests ?? [];
  const mine = all.filter((r) => r.requester_id === profile?.id);
  const financeQueue = finance ? all.filter((r) => r.status === 'pending_finance') : [];
  const approvalQueue = approver ? all.filter((r) => r.status === 'pending_approval') : [];

  function table(rows: OfficeRequest[], queue: 'finance' | 'approval' | null, emptyHint: string) {
    return (
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('oreq.item')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('common.qty')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('users.name')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('common.date')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('po.statusLabel')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {!rows.length && <tr><td colSpan={6}><EmptyState hint={emptyHint} /></td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5 font-medium">
                  {r.item}
                  {r.notes && <div className="text-xs text-gray-500 font-normal">{r.notes}</div>}
                  {r.finance_comment && (
                    <div className="text-xs text-gray-500 font-normal">
                      {t('oreq.financeNote')}: {r.finance_comment}
                    </div>
                  )}
                  {r.decided_comment && (
                    <div className="text-xs text-gray-500 font-normal">
                      {t('hr.comment')}: {r.decided_comment}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-end">{fmtQty(r.qty)}</td>
                <td className="px-4 py-2.5">{name(r.requester_id)}</td>
                <td className="px-4 py-2.5">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 text-end">
                  {queue ? (
                    <div className="flex gap-2 justify-end">
                      <button
                        className="text-sm text-gray-600 border rounded px-3 py-1.5"
                        onClick={() => { setComment(''); setError(null); setDeciding({ req: r, approve: false }); }}
                      >
                        {t('counts.reject')}
                      </button>
                      <PrimaryButton onClick={() => { setComment(''); setError(null); setDeciding({ req: r, approve: true }); }}>
                        {queue === 'finance' ? t('oreq.confirmFunds') : t('counts.approve')}
                      </PrimaryButton>
                    </div>
                  ) : (
                    r.requester_id === profile?.id && r.status === 'pending_finance' && (
                      <button
                        className="text-gray-400 text-sm hover:text-brand-red"
                        onClick={() => window.confirm(t('hr.confirmCancel')) && remove.mutate(r.id)}
                      >
                        {t('common.cancel')}
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <p className="text-sm text-gray-500">{t('oreq.hint')}</p>

      {finance && (
        <div>
          <h2 className="font-semibold text-sm mb-2">{t('oreq.financeQueue')} ({financeQueue.length})</h2>
          {table(financeQueue, 'finance', t('oreq.noneWaiting'))}
        </div>
      )}

      {approver && (
        <div>
          <h2 className="font-semibold text-sm mb-2">{t('oreq.approvalQueue')} ({approvalQueue.length})</h2>
          {table(approvalQueue, 'approval', t('oreq.noneWaiting'))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-sm">{t('oreq.mine')}</h2>
          <PrimaryButton onClick={() => setCreating(true)}>{t('oreq.new')}</PrimaryButton>
        </div>
        {table(mine, null, t('oreq.noneMine'))}
      </div>

      {creating && (
        <Modal title={t('oreq.new')} onClose={() => setCreating(false)}>
          <form onSubmit={onCreate} className="space-y-3">
            <Field label={t('oreq.item')} required>
              <input
                required className={inputCls} value={item}
                placeholder={t('oreq.itemPlaceholder')}
                onChange={(e) => setItem(e.target.value)}
              />
            </Field>
            <Field label={t('common.qty')}>
              <input type="number" min="1" step="any" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label={t('hr.reason')}>
              <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {create.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </button>
              <PrimaryButton type="submit" disabled={create.isPending}>{t('hr.submit')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}

      {deciding && (
        <Modal
          title={deciding.approve ? t('counts.approve') : t('counts.reject')}
          onClose={() => setDeciding(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {name(deciding.req.requester_id)} · {deciding.req.item} × {fmtQty(deciding.req.qty)}
            </p>
            {deciding.req.status === 'pending_finance' && deciding.approve && (
              <p className="text-sm">{t('oreq.fundsQuestion')}</p>
            )}
            <Field label={t('hr.comment')}>
              <textarea className={inputCls} rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
            </Field>
            {error && <ErrorNote message={error} />}
            <div className="flex justify-end gap-2">
              <button className="text-sm text-gray-500 px-3" onClick={() => setDeciding(null)}>
                {t('common.cancel')}
              </button>
              <PrimaryButton disabled={decide.isPending} onClick={() => decide.mutate(deciding)}>
                {deciding.approve ? t('counts.approve') : t('counts.reject')}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
