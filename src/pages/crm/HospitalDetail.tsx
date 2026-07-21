import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useLocations, useProducts, useProfiles, byId } from '../../lib/queries';
import { Activity, Contact, Deal, Hospital, StockRow } from '../../lib/types';
import { fmtDate, fmtMoney, fmtQty } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';
import { HospitalFormFields, HospitalForm } from './Hospitals';
import { DealFormModal } from './Deals';

type Tab = 'info' | 'contacts' | 'deals' | 'activity' | 'stock';

export default function HospitalDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('info');
  const ar = i18n.language === 'ar';

  const { data: hospital, isLoading } = useQuery({
    queryKey: ['hospital', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('hospitals').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Hospital;
    },
  });

  if (isLoading || !hospital) return <Loading />;

  const canEdit =
    profile?.role === 'admin' || profile?.role === 'manager' ||
    (profile?.role === 'sales_rep' && hospital.assigned_rep_id === profile.id);

  const name = ar && hospital.name_ar ? hospital.name_ar : hospital.name;
  const tabs: Tab[] = ['info', 'contacts', 'deals', 'activity', 'stock'];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/crm" className="text-sm text-gray-400 hover:text-brand-red">←</Link>
        <h1 className="text-xl font-bold">{name}</h1>
        <span className="text-xs bg-gray-200 rounded px-2 py-0.5">{t(`crm.statuses.${hospital.status}`)}</span>
        {!canEdit && <span className="text-xs text-gray-400">({t('common.readOnly')})</span>}
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${
              tab === tb ? 'border-brand-red text-brand-red' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t(`crm.tabs.${tb}`)}
          </button>
        ))}
      </div>

      {tab === 'info' && <InfoTab hospital={hospital} canEdit={canEdit} canAssignRep={profile?.role === 'admin' || profile?.role === 'manager'} />}
      {tab === 'contacts' && <ContactsTab hospitalId={hospital.id} canEdit={canEdit} />}
      {tab === 'deals' && <DealsTab hospital={hospital} canEdit={canEdit} />}
      {tab === 'activity' && <ActivityTab hospitalId={hospital.id} canEdit={canEdit} />}
      {tab === 'stock' && <StockTab hospitalId={hospital.id} />}
    </div>
  );
}

function InfoTab({ hospital, canEdit, canAssignRep }: { hospital: Hospital; canEdit: boolean; canAssignRep: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const profileMap = byId(profiles);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<HospitalForm>({
    name: hospital.name,
    name_ar: hospital.name_ar ?? '',
    governorate: hospital.governorate ?? '',
    sector: hospital.sector ?? '',
    status: hospital.status,
    assigned_rep_id: hospital.assigned_rep_id ?? '',
    notes: hospital.notes ?? '',
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('hospitals')
        .update({
          name: form.name,
          name_ar: form.name_ar || null,
          governorate: form.governorate || null,
          sector: form.sector || null,
          status: form.status,
          assigned_rep_id: form.assigned_rep_id || null,
          notes: form.notes || null,
        })
        .eq('id', hospital.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hospital', hospital.id] });
      qc.invalidateQueries({ queryKey: ['hospitals'] });
      setEditing(false);
    },
  });

  const rows: [string, string][] = [
    [t('crm.name'), hospital.name],
    [t('crm.nameAr'), hospital.name_ar ?? '—'],
    [t('crm.governorate'), hospital.governorate ?? '—'],
    [t('crm.sector'), hospital.sector ? t(`crm.sectors.${hospital.sector}`) : '—'],
    [t('crm.assignedRep'), hospital.assigned_rep_id ? profileMap[hospital.assigned_rep_id]?.full_name ?? '—' : t('crm.unassigned')],
    [t('crm.paymentNotes'), hospital.notes ?? '—'],
  ];

  return (
    <div className="bg-white rounded-lg border p-5 max-w-2xl">
      <dl className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-3 gap-2 text-sm">
            <dt className="text-gray-500">{k}</dt>
            <dd className="col-span-2 whitespace-pre-wrap">{v}</dd>
          </div>
        ))}
      </dl>
      {canEdit && (
        <div className="mt-4">
          <PrimaryButton onClick={() => setEditing(true)}>{t('common.edit')}</PrimaryButton>
        </div>
      )}
      {editing && (
        <Modal title={t('crm.editHospital')} onClose={() => setEditing(false)}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
            <HospitalFormFields form={form} setForm={setForm} canAssignRep={canAssignRep} />
            {save.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </button>
              <PrimaryButton type="submit" disabled={save.isPending}>{t('common.save')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function ContactsTab({ hospitalId, canEdit }: { hospitalId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts', hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('*').eq('hospital_id', hospitalId).order('name');
      if (error) throw error;
      return data as Contact[];
    },
  });

  const save = useMutation({
    mutationFn: async (c: Partial<Contact>) => {
      const row = {
        hospital_id: hospitalId,
        name: c.name,
        role_title: c.role_title || null,
        phone: c.phone || null,
        notes: c.notes || null,
      };
      const { error } = c.id
        ? await supabase.from('contacts').update(row).eq('id', c.id)
        : await supabase.from('contacts').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', hospitalId] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: async (cid: string) => {
      const { error } = await supabase.from('contacts').delete().eq('id', cid);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts', hospitalId] }),
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      {canEdit && (
        <PrimaryButton onClick={() => setEditing({})}>+ {t('crm.contact.new')}</PrimaryButton>
      )}
      <div className="bg-white rounded-lg border divide-y">
        {!contacts?.length && <EmptyState hint={t('crm.contact.empty')} />}
        {contacts?.map((c) => (
          <div key={c.id} className="px-4 py-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-medium text-sm">{c.name}</p>
              <p className="text-xs text-gray-500">{c.role_title ?? ''}</p>
              {c.phone && <p className="text-sm mt-1" dir="ltr">{c.phone}</p>}
              {c.notes && <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap">{c.notes}</p>}
            </div>
            {canEdit && (
              <div className="shrink-0 text-sm space-x-3 rtl:space-x-reverse">
                <button className="text-brand-red" onClick={() => setEditing(c)}>{t('common.edit')}</button>
                <button
                  className="text-gray-400"
                  onClick={() => window.confirm(t('common.confirmDelete')) && remove.mutate(c.id)}
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {editing && (
        <Modal title={t(editing.id ? 'crm.contact.edit' : 'crm.contact.new')} onClose={() => setEditing(null)}>
          <form
            onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(editing); }}
            className="space-y-3"
          >
            <Field label={t('crm.contact.name')} required>
              <input className={inputCls} required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label={t('crm.contact.roleTitle')}>
              <input className={inputCls} value={editing.role_title ?? ''} onChange={(e) => setEditing({ ...editing, role_title: e.target.value })} />
            </Field>
            <Field label={t('crm.contact.phone')}>
              <input className={inputCls} dir="ltr" inputMode="tel" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            </Field>
            <Field label={t('common.notes')}>
              <textarea className={inputCls} rows={2} value={editing.notes ?? ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
            {save.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <PrimaryButton type="submit" disabled={save.isPending}>{t('common.save')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function DealsTab({ hospital, canEdit }: { hospital: Hospital; canEdit: boolean }) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);

  const { data: deals, isLoading } = useQuery({
    queryKey: ['deals', hospital.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('deals').select('*').eq('hospital_id', hospital.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      {canEdit && <PrimaryButton onClick={() => setCreating(true)}>+ {t('crm.deal.new')}</PrimaryButton>}
      <div className="bg-white rounded-lg border divide-y">
        {!deals?.length && <EmptyState hint={t('crm.deal.empty')} />}
        {deals?.map((d) => (
          <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-medium text-sm">{d.title}</p>
              <p className="text-xs text-gray-500">
                {t(`crm.deal.stages.${d.stage}`)} · {fmtMoney(d.expected_value, d.currency)} · {fmtDate(d.expected_close)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {creating && (
        <DealFormModal
          fixedHospitalId={hospital.id}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function ActivityTab({ hospitalId, canEdit }: { hospitalId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: profiles } = useProfiles();
  const profileMap = byId(profiles);
  const [type, setType] = useState<'call' | 'meeting' | 'note'>('note');
  const [body, setBody] = useState('');

  const { data: activities, isLoading } = useQuery({
    queryKey: ['activities', hospitalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('hospital_id', hospitalId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Activity[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('activities').insert({ hospital_id: hospitalId, type, body });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['activities', hospitalId] });
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3 max-w-2xl">
      {canEdit && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (body.trim()) add.mutate(); }}
          className="bg-white rounded-lg border p-4 space-y-2"
        >
          <div className="flex gap-2">
            <select className={`${inputCls} w-auto`} value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              {(['note', 'call', 'meeting'] as const).map((tp) => (
                <option key={tp} value={tp}>{t(`crm.activity.types.${tp}`)}</option>
              ))}
            </select>
            <input
              className={inputCls}
              placeholder={t('crm.activity.body')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <PrimaryButton type="submit" disabled={add.isPending || !body.trim()}>{t('common.add')}</PrimaryButton>
          </div>
          {add.isError && <ErrorNote message={t('common.error')} />}
        </form>
      )}
      <div className="bg-white rounded-lg border divide-y">
        {!activities?.length && <EmptyState hint={t('crm.activity.empty')} />}
        {activities?.map((a) => (
          <div key={a.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-gray-500">
                {t(`crm.activity.types.${a.type}`)} · {profileMap[a.created_by]?.full_name ?? ''}
              </span>
              <span className="text-xs text-gray-400">{fmtDate(a.created_at)}</span>
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap">{a.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StockTab({ hospitalId }: { hospitalId: string }) {
  const { t } = useTranslation();
  const { data: locations } = useLocations();
  const { data: products } = useProducts();
  const productMap = byId(products);
  const location = (locations ?? []).find((l) => l.hospital_id === hospitalId);

  const { data: stock, isLoading } = useQuery({
    queryKey: ['stock', location?.id],
    enabled: !!location,
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_on_hand').select('*').eq('location_id', location!.id);
      if (error) throw error;
      return data as StockRow[];
    },
  });

  if (isLoading) return <Loading />;

  return (
    <div className="bg-white rounded-lg border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="px-4 py-2.5 text-start font-semibold">{t('inv.product')}</th>
            <th className="px-4 py-2.5 text-start font-semibold">{t('inv.lot')}</th>
            <th className="px-4 py-2.5 text-start font-semibold">{t('inv.expiry')}</th>
            <th className="px-4 py-2.5 text-end font-semibold">{t('inv.qty')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {!stock?.length && (
            <tr><td colSpan={4}><EmptyState hint={t('crm.stockEmpty')} /></td></tr>
          )}
          {stock?.map((s) => (
            <tr key={`${s.product_id}-${s.lot_no}`}>
              <td className="px-4 py-2.5">{productMap[s.product_id]?.name ?? s.product_id}</td>
              <td className="px-4 py-2.5" dir="ltr">{s.lot_no}</td>
              <td className="px-4 py-2.5">{fmtDate(s.expiry_date)}</td>
              <td className="px-4 py-2.5 text-end">{fmtQty(s.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
