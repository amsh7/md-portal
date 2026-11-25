import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { LEAVE_TYPES, LeaveBalance, LeaveRequest, LeaveStatus, LeaveType, leaveBadgeCls, leaveDays } from '../../lib/hr';
import { fmtDate, fmtQty } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-0.5 ${leaveBadgeCls(status)}`}>
      {t(`hr.status.${status}`)}
    </span>
  );
}

export default function MyLeave() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  const [type, setType] = useState<LeaveType>('annual');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [halfDay, setHalfDay] = useState(false);
  const [timeFrom, setTimeFrom] = useState('');
  const [timeTo, setTimeTo] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const year = new Date().getFullYear();

  const { data: balance } = useQuery({
    queryKey: ['leave_balance', profile?.id, year],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_balances').select('*')
        .eq('employee_id', profile!.id).eq('year', year).maybeSingle();
      if (error) throw error;
      return (data ?? {
        employee_id: profile!.id, year,
        annual_total: 30, annual_used: 0, sick_total: 7, sick_used: 0,
      }) as LeaveBalance;
    },
  });

  const { data: requests, isLoading } = useQuery({
    queryKey: ['my_leave', profile?.id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests').select('*')
        .eq('employee_id', profile!.id)
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as LeaveRequest[];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      let attachment_path: string | null = null;
      if (file) {
        const path = `${profile!.id}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, '_')}`;
        const { error: upErr } = await supabase.storage.from('leave-docs').upload(path, file);
        if (upErr) throw upErr;
        attachment_path = path;
      }
      const isPermission = type === 'permission';
      const { error } = await supabase.from('leave_requests').insert({
        type,
        start_date: start,
        end_date: isPermission || halfDay ? start : end,
        half_day: isPermission ? false : halfDay,
        start_time: isPermission ? timeFrom : null,
        end_time: isPermission ? timeTo : null,
        reason: reason || null,
        attachment_path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my_leave'] });
      setRequesting(false);
      setType('annual'); setStart(''); setEnd(''); setHalfDay(false);
      setTimeFrom(''); setTimeTo(''); setReason(''); setFile(null);
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leave_requests').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_leave'] }),
  });

  const isPermission = type === 'permission';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!start) return;
    if (isPermission ? timeFrom && timeTo : halfDay || end) submit.mutate();
  }

  if (isLoading) return <Loading />;

  const annualLeft = balance ? balance.annual_total - balance.annual_used : null;
  const sickLeft = balance ? balance.sick_total - balance.sick_used : null;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">{t('hr.annual')}</p>
          <p className="text-2xl font-bold">
            {annualLeft != null ? fmtQty(annualLeft) : '—'}
            <span className="text-sm font-normal text-gray-400"> / {balance ? fmtQty(balance.annual_total) : '—'}</span>
          </p>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <p className="text-xs text-gray-500">{t('hr.sick')}</p>
          <p className="text-2xl font-bold">
            {sickLeft != null ? fmtQty(sickLeft) : '—'}
            <span className="text-sm font-normal text-gray-400"> / {balance ? fmtQty(balance.sick_total) : '—'}</span>
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <PrimaryButton onClick={() => setRequesting(true)}>{t('hr.newRequest')}</PrimaryButton>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('hr.type')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('hr.dates')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('hr.days')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('po.statusLabel')}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {!requests?.length && (
              <tr><td colSpan={5}><EmptyState hint={t('hr.empty')} /></td></tr>
            )}
            {requests?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2.5">{t(`hr.types.${r.type}`)}</td>
                <td className="px-4 py-2.5">
                  {fmtDate(r.start_date)}{r.start_date !== r.end_date && <> – {fmtDate(r.end_date)}</>}
                  {r.half_day && <span className="text-xs text-gray-400"> ({t('hr.halfDay')})</span>}
                  {r.type === 'permission' && r.start_time && (
                    <span className="text-xs text-gray-400" dir="ltr"> {r.start_time.slice(0, 5)}–{r.end_time?.slice(0, 5)}</span>
                  )}
                  {r.review_comment && <div className="text-xs text-gray-500">{r.review_comment}</div>}
                </td>
                <td className="px-4 py-2.5 text-end">{r.type === 'permission' ? '—' : fmtQty(leaveDays(r))}</td>
                <td className="px-4 py-2.5"><LeaveStatusBadge status={r.status} /></td>
                <td className="px-4 py-2.5 text-end">
                  {r.status === 'pending' && (
                    <button
                      className="text-gray-400 text-sm hover:text-brand-red"
                      onClick={() => window.confirm(t('hr.confirmCancel')) && cancel.mutate(r.id)}
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {requesting && (
        <Modal title={t('hr.newRequest')} onClose={() => setRequesting(false)}>
          <form onSubmit={onSubmit} className="space-y-3">
            <Field label={t('hr.type')}>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
                {LEAVE_TYPES.map((lt) => <option key={lt} value={lt}>{t(`hr.types.${lt}`)}</option>)}
              </select>
            </Field>
            {!isPermission && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={halfDay} onChange={(e) => setHalfDay(e.target.checked)} />
                {t('hr.halfDay')}
              </label>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={isPermission || halfDay ? t('common.date') : t('hr.from')} required>
                <input type="date" required className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              {!isPermission && !halfDay && (
                <Field label={t('hr.to')} required>
                  <input type="date" required min={start} className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
                </Field>
              )}
            </div>
            {isPermission && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('hr.timeFrom')} required>
                  <input type="time" required className={inputCls} value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
                </Field>
                <Field label={t('hr.timeTo')} required>
                  <input type="time" required className={inputCls} value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
                </Field>
              </div>
            )}
            <Field label={t('hr.reason')}>
              <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label={t('hr.attachment')}>
              <input
                type="file"
                className="text-sm"
                accept="image/*,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            {submit.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setRequesting(false)}>
                {t('common.cancel')}
              </button>
              <PrimaryButton type="submit" disabled={submit.isPending}>{t('hr.submit')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
