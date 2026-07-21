import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useHospitals, useProfiles, byId } from '../../lib/queries';
import { DEAL_STAGES, Deal, DealStage } from '../../lib/types';
import { fmtDate, fmtMoney } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

interface DealForm {
  id?: string;
  hospital_id: string;
  title: string;
  stage: DealStage;
  expected_value: string;
  currency: string;
  expected_close: string;
  notes: string;
}

export function DealFormModal({ deal, fixedHospitalId, onClose }: { deal?: Deal; fixedHospitalId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: hospitals } = useHospitals();
  const [form, setForm] = useState<DealForm>({
    id: deal?.id,
    hospital_id: deal?.hospital_id ?? fixedHospitalId ?? '',
    title: deal?.title ?? '',
    stage: deal?.stage ?? 'lead',
    expected_value: deal?.expected_value != null ? String(deal.expected_value) : '',
    currency: deal?.currency ?? 'EGP',
    expected_close: deal?.expected_close ?? '',
    notes: deal?.notes ?? '',
  });

  // Reps can only file deals under their own hospitals (RLS enforces too)
  const selectableHospitals = (hospitals ?? []).filter(
    (h) => profile?.role !== 'sales_rep' || h.assigned_rep_id === profile.id,
  );

  const save = useMutation({
    mutationFn: async () => {
      const row = {
        hospital_id: form.hospital_id,
        title: form.title,
        stage: form.stage,
        expected_value: form.expected_value ? Number(form.expected_value) : null,
        currency: form.currency || 'EGP',
        expected_close: form.expected_close || null,
        notes: form.notes || null,
        owner_id: deal?.owner_id ?? profile?.id,
      };
      const { error } = form.id
        ? await supabase.from('deals').update(row).eq('id', form.id)
        : await supabase.from('deals').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['deals', form.hospital_id] });
      onClose();
    },
  });

  return (
    <Modal title={t(form.id ? 'crm.deal.edit' : 'crm.deal.new')} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
        <Field label={t('crm.hospital')} required>
          <select
            className={inputCls}
            required
            value={form.hospital_id}
            disabled={!!fixedHospitalId}
            onChange={(e) => setForm({ ...form, hospital_id: e.target.value })}
          >
            <option value="">—</option>
            {selectableHospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
        </Field>
        <Field label={t('crm.deal.title')} required>
          <input className={inputCls} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('crm.deal.stage')}>
            <select className={inputCls} value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value as DealStage })}>
              {DEAL_STAGES.map((s) => <option key={s} value={s}>{t(`crm.deal.stages.${s}`)}</option>)}
            </select>
          </Field>
          <Field label={t('crm.deal.expectedClose')}>
            <input type="date" className={inputCls} value={form.expected_close} onChange={(e) => setForm({ ...form, expected_close: e.target.value })} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('crm.deal.expectedValue')}>
            <input type="number" min="0" step="0.01" inputMode="decimal" className={inputCls} value={form.expected_value} onChange={(e) => setForm({ ...form, expected_value: e.target.value })} />
          </Field>
          <Field label={t('crm.deal.currency')}>
            <select className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {['EGP', 'USD', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('common.notes')}>
          <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        {save.isError && <ErrorNote message={t('common.error')} />}
        <div className="flex justify-end gap-2">
          <button type="button" className="text-sm text-gray-500 px-3" onClick={onClose}>{t('common.cancel')}</button>
          <PrimaryButton type="submit" disabled={save.isPending}>{t('common.save')}</PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export default function Deals() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { data: hospitals } = useHospitals();
  const { data: profiles } = useProfiles();
  const hospitalMap = byId(hospitals);
  const profileMap = byId(profiles);
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [editing, setEditing] = useState<Deal | null>(null);
  const [creating, setCreating] = useState(false);
  const ar = i18n.language === 'ar';

  const { data: deals, isLoading } = useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deals').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });

  const moveStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
      const { error } = await supabase.from('deals').update({ stage }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  });

  if (isLoading) return <Loading />;

  function hospitalName(id: string) {
    const h = hospitalMap[id];
    if (!h) return '—';
    return ar && h.name_ar ? h.name_ar : h.name;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex rounded border overflow-hidden text-sm">
          {(['kanban', 'table'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 ${view === v ? 'bg-brand-black text-white' : 'bg-white text-gray-600'}`}
            >
              {t(`crm.deal.${v === 'kanban' ? 'kanban' : 'table'}`)}
            </button>
          ))}
        </div>
        <div className="ms-auto">
          <PrimaryButton onClick={() => setCreating(true)}>+ {t('crm.deal.new')}</PrimaryButton>
        </div>
      </div>

      {!deals?.length ? (
        <div className="bg-white rounded-lg border">
          <EmptyState
            hint={t('crm.deal.empty')}
            action={<PrimaryButton onClick={() => setCreating(true)}>+ {t('crm.deal.new')}</PrimaryButton>}
          />
        </div>
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {DEAL_STAGES.map((stage) => {
            const col = deals.filter((d) => d.stage === stage);
            return (
              <div key={stage} className="bg-gray-50 rounded-lg border">
                <div className="px-3 py-2 border-b flex items-center justify-between">
                  <span className="text-xs font-bold uppercase text-gray-600">{t(`crm.deal.stages.${stage}`)}</span>
                  <span className="text-xs text-gray-400">{col.length}</span>
                </div>
                <div className="p-2 space-y-2 min-h-[60px]">
                  {col.map((d) => (
                    <div key={d.id} className="bg-white rounded border p-3 text-sm shadow-sm">
                      <button className="font-medium text-start hover:text-brand-red" onClick={() => setEditing(d)}>
                        {d.title}
                      </button>
                      <p className="text-xs text-gray-500 mt-1">{hospitalName(d.hospital_id)}</p>
                      <p className="text-xs text-gray-500">{fmtMoney(d.expected_value, d.currency)}</p>
                      <select
                        className="mt-2 w-full border rounded text-xs px-1 py-1"
                        value={d.stage}
                        onChange={(e) => moveStage.mutate({ id: d.id, stage: e.target.value as DealStage })}
                      >
                        {DEAL_STAGES.map((s) => <option key={s} value={s}>{t(`crm.deal.stages.${s}`)}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-2.5 text-start font-semibold">{t('crm.deal.title')}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t('crm.hospital')}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t('crm.deal.stage')}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t('crm.deal.expectedValue')}</th>
                <th className="px-4 py-2.5 text-start font-semibold hidden md:table-cell">{t('crm.deal.expectedClose')}</th>
                <th className="px-4 py-2.5 text-start font-semibold hidden md:table-cell">{t('crm.deal.owner')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {deals.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5">
                    <button className="font-medium text-brand-red hover:underline" onClick={() => setEditing(d)}>
                      {d.title}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">{hospitalName(d.hospital_id)}</td>
                  <td className="px-4 py-2.5">{t(`crm.deal.stages.${d.stage}`)}</td>
                  <td className="px-4 py-2.5 text-end">{fmtMoney(d.expected_value, d.currency)}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell">{fmtDate(d.expected_close)}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell">{d.owner_id ? profileMap[d.owner_id]?.full_name ?? '—' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && <DealFormModal onClose={() => setCreating(false)} />}
      {editing && <DealFormModal deal={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
