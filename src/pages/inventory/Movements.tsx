import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useLocations, useProducts, useProfiles, byId } from '../../lib/queries';
import { MovementType, StockMovement } from '../../lib/types';
import { fmtDate, fmtQty } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

interface MovementForm {
  type: MovementType;
  product_id: string;
  lot_no: string;
  expiry_date: string;
  qty: string;
  from_location_id: string;
  to_location_id: string;
  reason: string;
  adj_direction: 'increase' | 'decrease';
}

const emptyForm: MovementForm = {
  type: 'receive', product_id: '', lot_no: '', expiry_date: '', qty: '',
  from_location_id: '', to_location_id: '', reason: '', adj_direction: 'increase',
};

// Manual movement types only — 'usage' is written by shelf-count approval (Phase 3)
const MANUAL_TYPES: MovementType[] = ['receive', 'transfer', 'return', 'adjustment'];

export default function Movements() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: products } = useProducts();
  const { data: locations } = useLocations();
  const { data: profiles } = useProfiles();
  const productMap = byId(products);
  const locationMap = byId(locations);
  const profileMap = byId(profiles);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MovementForm>(emptyForm);

  const canInsert = profile?.role === 'admin' || profile?.role === 'warehouse';
  const canVoid = profile?.role === 'admin';

  const { data: movements, isLoading } = useQuery({
    queryKey: ['movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as StockMovement[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      let from: string | null = null;
      let to: string | null = null;
      if (form.type === 'receive') to = form.to_location_id;
      else if (form.type === 'transfer' || form.type === 'return') {
        from = form.from_location_id;
        to = form.to_location_id;
      } else if (form.type === 'adjustment') {
        if (form.adj_direction === 'increase') to = form.to_location_id;
        else from = form.from_location_id;
      }
      const { error } = await supabase.from('stock_movements').insert({
        type: form.type,
        product_id: form.product_id,
        lot_no: form.lot_no,
        expiry_date: form.expiry_date,
        qty: Number(form.qty),
        from_location_id: from,
        to_location_id: to,
        reason: form.reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['stock', 'all'] });
      setCreating(false);
      setForm(emptyForm);
    },
  });

  const voidMovement = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('stock_movements')
        .update({ voided_by: profile!.id, voided_at: new Date().toISOString(), void_reason: reason })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['movements'] });
      qc.invalidateQueries({ queryKey: ['stock', 'all'] });
    },
  });

  function onVoid(m: StockMovement) {
    const reason = window.prompt(t('inv.movement.voidPrompt'));
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert(t('inv.movement.voidReasonRequired'));
      return;
    }
    voidMovement.mutate({ id: m.id, reason: reason.trim() });
  }

  if (isLoading) return <Loading />;

  const needsFrom = form.type === 'transfer' || form.type === 'return' || (form.type === 'adjustment' && form.adj_direction === 'decrease');
  const needsTo = form.type === 'receive' || form.type === 'transfer' || form.type === 'return' || (form.type === 'adjustment' && form.adj_direction === 'increase');
  const activeProducts = (products ?? []).filter((p) => p.active);

  return (
    <div className="space-y-3">
      {canInsert && (
        <PrimaryButton onClick={() => setCreating(true)}>+ {t('inv.movement.new')}</PrimaryButton>
      )}

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('common.date')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.movement.type')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.product')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.lot')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('inv.qty')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden md:table-cell">{t('inv.movement.from')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden md:table-cell">{t('inv.movement.to')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden lg:table-cell">{t('users.name')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!movements?.length && (
              <tr><td colSpan={9}><EmptyState hint={t('inv.movement.empty')} /></td></tr>
            )}
            {movements?.map((m) => (
              <tr key={m.id} className={m.voided_at ? 'opacity-40 line-through' : ''}>
                <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                <td className="px-4 py-2.5">
                  {t(`inv.movement.types.${m.type}`)}
                  {m.voided_at && <span className="ms-1 text-xs text-brand-red no-underline">({t('inv.movement.voided')})</span>}
                </td>
                <td className="px-4 py-2.5">{productMap[m.product_id]?.name ?? '—'}</td>
                <td className="px-4 py-2.5" dir="ltr">{m.lot_no}</td>
                <td className="px-4 py-2.5 text-end">{fmtQty(m.qty)}</td>
                <td className="px-4 py-2.5 hidden md:table-cell">{m.from_location_id ? locationMap[m.from_location_id]?.name ?? '—' : '—'}</td>
                <td className="px-4 py-2.5 hidden md:table-cell">{m.to_location_id ? locationMap[m.to_location_id]?.name ?? '—' : '—'}</td>
                <td className="px-4 py-2.5 hidden lg:table-cell">{profileMap[m.created_by]?.full_name ?? '—'}</td>
                <td className="px-4 py-2.5 text-end">
                  {canVoid && !m.voided_at && (
                    <button className="text-gray-400 hover:text-brand-red text-sm" onClick={() => onVoid(m)}>
                      {t('inv.movement.void')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <Modal title={t('inv.movement.new')} onClose={() => setCreating(false)}>
          <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('inv.movement.type')} required>
                <select className={inputCls} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as MovementType })}>
                  {MANUAL_TYPES.map((mt) => <option key={mt} value={mt}>{t(`inv.movement.types.${mt}`)}</option>)}
                </select>
              </Field>
              {form.type === 'adjustment' && (
                <Field label={t('inv.movement.direction')} required>
                  <select className={inputCls} value={form.adj_direction} onChange={(e) => setForm({ ...form, adj_direction: e.target.value as 'increase' | 'decrease' })}>
                    <option value="increase">{t('inv.movement.increase')}</option>
                    <option value="decrease">{t('inv.movement.decrease')}</option>
                  </select>
                </Field>
              )}
            </div>
            <Field label={t('inv.product')} required>
              <select className={inputCls} required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
                <option value="">—</option>
                {activeProducts.map((p) => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('inv.lot')} required>
                <input className={inputCls} dir="ltr" required value={form.lot_no} onChange={(e) => setForm({ ...form, lot_no: e.target.value })} />
              </Field>
              <Field label={t('inv.expiry')} required>
                <input type="date" className={inputCls} required value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              </Field>
              <Field label={t('inv.qty')} required>
                <input type="number" min="0.01" step="0.01" inputMode="decimal" className={inputCls} required value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {needsFrom && (
                <Field label={t('inv.movement.from')} required>
                  <select className={inputCls} required value={form.from_location_id} onChange={(e) => setForm({ ...form, from_location_id: e.target.value })}>
                    <option value="">—</option>
                    {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
              )}
              {needsTo && (
                <Field label={t('inv.movement.to')} required>
                  <select className={inputCls} required value={form.to_location_id} onChange={(e) => setForm({ ...form, to_location_id: e.target.value })}>
                    <option value="">—</option>
                    {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <Field label={t('inv.movement.reason')} required={form.type === 'adjustment'}>
              <input className={inputCls} required={form.type === 'adjustment'} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            {create.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button type="button" className="text-sm text-gray-500 px-3" onClick={() => setCreating(false)}>{t('common.cancel')}</button>
              <PrimaryButton type="submit" disabled={create.isPending}>{t('common.save')}</PrimaryButton>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
