import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useProfiles, byId } from '../../lib/queries';
import { LeaveRequest, leaveDays } from '../../lib/hr';
import { fmtDate, fmtQty } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';
import { LeaveStatusBadge } from './MyLeave';

export default function Approvals() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const profileMap = byId(profiles);
  const [deciding, setDeciding] = useState<{ req: LeaveRequest; approve: boolean } | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ar = i18n.language === 'ar';

  const { data: requests, isLoading } = useQuery({
    queryKey: ['leave_requests', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests').select('*')
        .order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data as LeaveRequest[];
    },
  });

  const decide = useMutation({
    mutationFn: async ({ req, approve }: { req: LeaveRequest; approve: boolean }) => {
      const { error } = await supabase.rpc('decide_leave', {
        p_request_id: req.id,
        p_approve: approve,
        p_comment: comment || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave_requests'] });
      qc.invalidateQueries({ queryKey: ['my_leave'] });
      qc.invalidateQueries({ queryKey: ['leave_balance'] });
      setDeciding(null);
      setComment('');
      setError(null);
    },
    onError: (err) => {
      setError(/exceeds/i.test((err as Error).message ?? '') ? t('hr.exceeds') : t('common.error'));
    },
  });

  async function openAttachment(path: string) {
    const { data, error } = await supabase.storage.from('leave-docs').createSignedUrl(path, 300);
    if (!error && data) window.open(data.signedUrl, '_blank');
  }

  if (isLoading) return <Loading />;

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const decided = (requests ?? []).filter((r) => r.status !== 'pending').slice(0, 30);

  function employeeName(id: string) {
    const p = profileMap[id];
    return p ? (ar && p.full_name_ar ? p.full_name_ar : p.full_name) : '—';
  }

  function row(r: LeaveRequest, actions: boolean) {
    return (
      <tr key={r.id}>
        <td className="px-4 py-2.5 font-medium">{employeeName(r.employee_id)}</td>
        <td className="px-4 py-2.5">{t(`hr.types.${r.type}`)}</td>
        <td className="px-4 py-2.5">
          {fmtDate(r.start_date)}{r.start_date !== r.end_date && <> – {fmtDate(r.end_date)}</>}
          {r.half_day && <span className="text-xs text-gray-400"> ({t('hr.halfDay')})</span>}
          {r.type === 'permission' && r.start_time && (
            <span className="text-xs text-gray-400" dir="ltr"> {r.start_time.slice(0, 5)}–{r.end_time?.slice(0, 5)}</span>
          )}
          {r.reason && <div className="text-xs text-gray-500">{r.reason}</div>}
          {r.attachment_path && (
            <button className="text-xs text-brand-red hover:underline" onClick={() => openAttachment(r.attachment_path!)}>
              {t('hr.viewAttachment')}
            </button>
          )}
        </td>
        <td className="px-4 py-2.5 text-end">{r.type === 'permission' ? '—' : fmtQty(leaveDays(r))}</td>
        <td className="px-4 py-2.5">
          {actions ? (
            <div className="flex gap-2 justify-end">
              <button
                className="text-sm text-gray-600 border rounded px-3 py-1.5"
                onClick={() => { setComment(''); setError(null); setDeciding({ req: r, approve: false }); }}
              >
                {t('counts.reject')}
              </button>
              <PrimaryButton onClick={() => { setComment(''); setError(null); setDeciding({ req: r, approve: true }); }}>
                {t('counts.approve')}
              </PrimaryButton>
            </div>
          ) : (
            <LeaveStatusBadge status={r.status} />
          )}
        </td>
      </tr>
    );
  }

  const head = (
    <thead>
      <tr className="border-b bg-gray-50">
        <th className="px-4 py-2.5 text-start font-semibold">{t('users.name')}</th>
        <th className="px-4 py-2.5 text-start font-semibold">{t('hr.type')}</th>
        <th className="px-4 py-2.5 text-start font-semibold">{t('hr.dates')}</th>
        <th className="px-4 py-2.5 text-end font-semibold">{t('hr.days')}</th>
        <th className="px-4 py-2.5" />
      </tr>
    </thead>
  );

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h2 className="font-semibold text-sm mb-2">{t('hr.pending')} ({pending.length})</h2>
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            {head}
            <tbody className="divide-y">
              {!pending.length && <tr><td colSpan={5}><EmptyState hint={t('hr.nonePending')} /></td></tr>}
              {pending.map((r) => row(r, true))}
            </tbody>
          </table>
        </div>
      </div>

      {!!decided.length && (
        <div>
          <h2 className="font-semibold text-sm mb-2">{t('hr.recentDecisions')}</h2>
          <div className="bg-white rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              {head}
              <tbody className="divide-y">{decided.map((r) => row(r, false))}</tbody>
            </table>
          </div>
        </div>
      )}

      {deciding && (
        <Modal
          title={deciding.approve ? t('counts.approve') : t('counts.reject')}
          onClose={() => setDeciding(null)}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              {employeeName(deciding.req.employee_id)} · {t(`hr.types.${deciding.req.type}`)} ·{' '}
              {fmtQty(leaveDays(deciding.req))} {t('hr.days')}
            </p>
            {deciding.approve && <p className="text-sm">{t('hr.confirmApprove')}</p>}
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
