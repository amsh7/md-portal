import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useHospitals, useProfiles, byId } from '../../lib/queries';
import { GOVERNORATES, Hospital } from '../../lib/types';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

const SECTORS = ['government', 'private', 'university', 'military'] as const;
const STATUSES = ['active', 'prospect', 'dormant'] as const;

export interface HospitalForm {
  name: string;
  name_ar: string;
  governorate: string;
  sector: string;
  status: string;
  assigned_rep_id: string;
  notes: string;
}

const emptyForm: HospitalForm = {
  name: '', name_ar: '', governorate: '', sector: '', status: 'prospect', assigned_rep_id: '', notes: '',
};

export function HospitalFormFields({
  form, setForm, canAssignRep,
}: {
  form: HospitalForm;
  setForm: (f: HospitalForm) => void;
  canAssignRep: boolean;
}) {
  const { t } = useTranslation();
  const { data: profiles } = useProfiles();
  const reps = (profiles ?? []).filter((p) => p.active && (p.role === 'sales_rep' || p.role === 'manager'));
  return (
    <div className="space-y-3">
      <Field label={t('crm.name')} required>
        <input className={inputCls} value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label={t('crm.nameAr')}>
        <input className={inputCls} dir="rtl" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('crm.governorate')}>
          <select className={inputCls} value={form.governorate} onChange={(e) => setForm({ ...form, governorate: e.target.value })}>
            <option value="">{t('common.none')}</option>
            {GOVERNORATES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
        <Field label={t('crm.sector')}>
          <select className={inputCls} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>
            <option value="">{t('common.none')}</option>
            {SECTORS.map((s) => <option key={s} value={s}>{t(`crm.sectors.${s}`)}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('crm.status')} required>
          <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`crm.statuses.${s}`)}</option>)}
          </select>
        </Field>
        <Field label={t('crm.assignedRep')}>
          <select
            className={inputCls}
            value={form.assigned_rep_id}
            disabled={!canAssignRep}
            onChange={(e) => setForm({ ...form, assigned_rep_id: e.target.value })}
          >
            <option value="">{t('crm.unassigned')}</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t('crm.paymentNotes')}>
        <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </Field>
    </div>
  );
}

export default function Hospitals() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: hospitals, isLoading } = useHospitals();
  const { data: profiles } = useProfiles();
  const profileMap = byId(profiles);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<HospitalForm>(emptyForm);

  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';
  const ar = i18n.language === 'ar';

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('hospitals').insert({
        name: form.name,
        name_ar: form.name_ar || null,
        governorate: form.governorate || null,
        sector: form.sector || null,
        status: form.status,
        assigned_rep_id: form.assigned_rep_id || null,
        notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hospitals'] });
      qc.invalidateQueries({ queryKey: ['locations'] });
      setCreating(false);
      setForm(emptyForm);
    },
  });

  const filtered = useMemo(
    () =>
      (hospitals ?? []).filter((h) => {
        const txt = `${h.name} ${h.name_ar ?? ''} ${h.governorate ?? ''}`.toLowerCase();
        return txt.includes(search.toLowerCase()) && (!statusFilter || h.status === statusFilter);
      }),
    [hospitals, search, statusFilter],
  );

  function displayName(h: Hospital) {
    return ar && h.name_ar ? h.name_ar : h.name;
  }

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} max-w-xs`}
          placeholder={t('common.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={`${inputCls} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`crm.statuses.${s}`)}</option>)}
        </select>
        <div className="ms-auto">
          {isAdminOrManager && (
            <PrimaryButton onClick={() => setCreating(true)}>+ {t('crm.newHospital')}</PrimaryButton>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('crm.name')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden sm:table-cell">{t('crm.governorate')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden md:table-cell">{t('crm.sector')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('crm.status')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden md:table-cell">{t('crm.assignedRep')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!filtered.length && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    hint={t('crm.emptyHospitals')}
                    action={isAdminOrManager ? (
                      <PrimaryButton onClick={() => setCreating(true)}>+ {t('crm.newHospital')}</PrimaryButton>
                    ) : undefined}
                  />
                </td>
              </tr>
            )}
            {filtered.map((h) => (
              <tr key={h.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5">
                  <Link to={`/crm/hospitals/${h.id}`} className="font-medium text-brand-red hover:underline">
                    {displayName(h)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 hidden sm:table-cell">{h.governorate ?? '—'}</td>
                <td className="px-4 py-2.5 hidden md:table-cell">{h.sector ? t(`crm.sectors.${h.sector}`) : '—'}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs rounded px-2 py-0.5 ${
                    h.status === 'active' ? 'bg-green-100 text-green-800'
                    : h.status === 'prospect' ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-200 text-gray-600'
                  }`}>
                    {t(`crm.statuses.${h.status}`)}
                  </span>
                </td>
                <td className="px-4 py-2.5 hidden md:table-cell">
                  {h.assigned_rep_id ? profileMap[h.assigned_rep_id]?.full_name ?? '—' : t('crm.unassigned')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title={t('crm.newHospital')} onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="space-y-4"
          >
            <HospitalFormFields form={form} setForm={setForm} canAssignRep={isAdminOrManager} />
            {create.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setCreating(false)}>
                {t('common.cancel')}
              </button>
              <PrimaryButton type="submit" disabled={create.isPending}>{t('common.save')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
