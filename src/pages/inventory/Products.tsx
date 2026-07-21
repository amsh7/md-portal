import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useProducts } from '../../lib/queries';
import { Product } from '../../lib/types';
import { fmtEGP } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';

interface ProductForm {
  id?: string;
  sku: string;
  name: string;
  name_ar: string;
  manufacturer: string;
  category: string;
  unit: string;
  price_egp: string;
  price_foreign: string;
  currency: string;
  active: boolean;
}

const emptyForm: ProductForm = {
  sku: '', name: '', name_ar: '', manufacturer: '', category: '', unit: 'unit',
  price_egp: '', price_foreign: '', currency: '', active: true,
};

export default function Products() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: products, isLoading } = useProducts();
  const [editing, setEditing] = useState<ProductForm | null>(null);
  const [search, setSearch] = useState('');
  const canWrite = profile?.role === 'admin' || profile?.role === 'manager';
  const ar = i18n.language === 'ar';

  const save = useMutation({
    mutationFn: async (f: ProductForm) => {
      const row = {
        sku: f.sku,
        name: f.name,
        name_ar: f.name_ar || null,
        manufacturer: f.manufacturer || null,
        category: f.category || null,
        unit: f.unit || 'unit',
        price_egp: f.price_egp ? Number(f.price_egp) : 0,
        price_foreign: f.price_foreign ? Number(f.price_foreign) : null,
        currency: f.price_foreign ? f.currency || 'USD' : null,
        active: f.active,
      };
      const { error } = f.id
        ? await supabase.from('products').update(row).eq('id', f.id)
        : await supabase.from('products').insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setEditing(null);
    },
  });

  if (isLoading) return <Loading />;

  const filtered = (products ?? []).filter((p) =>
    `${p.sku} ${p.name} ${p.name_ar ?? ''} ${p.manufacturer ?? ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input className={`${inputCls} max-w-xs`} placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="ms-auto">
          {canWrite && <PrimaryButton onClick={() => setEditing(emptyForm)}>+ {t('inv.newProduct')}</PrimaryButton>}
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.sku')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('crm.name')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden md:table-cell">{t('inv.manufacturer')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden sm:table-cell">{t('inv.unit')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('inv.priceEgp')}</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!filtered.length && (
              <tr><td colSpan={6}><EmptyState hint={t('inv.emptyProducts')} action={canWrite ? <PrimaryButton onClick={() => setEditing(emptyForm)}>+ {t('inv.newProduct')}</PrimaryButton> : undefined} /></td></tr>
            )}
            {filtered.map((p: Product) => (
              <tr key={p.id} className={p.active ? '' : 'opacity-50'}>
                <td className="px-4 py-2.5" dir="ltr">{p.sku}</td>
                <td className="px-4 py-2.5 font-medium">{ar && p.name_ar ? p.name_ar : p.name}</td>
                <td className="px-4 py-2.5 hidden md:table-cell">{p.manufacturer ?? '—'}</td>
                <td className="px-4 py-2.5 hidden sm:table-cell">{p.unit}</td>
                <td className="px-4 py-2.5 text-end">{fmtEGP(p.price_egp)}</td>
                <td className="px-4 py-2.5 text-end">
                  {canWrite && (
                    <button
                      className="text-brand-red text-sm"
                      onClick={() =>
                        setEditing({
                          id: p.id,
                          sku: p.sku,
                          name: p.name,
                          name_ar: p.name_ar ?? '',
                          manufacturer: p.manufacturer ?? '',
                          category: p.category ?? '',
                          unit: p.unit,
                          price_egp: String(p.price_egp),
                          price_foreign: p.price_foreign != null ? String(p.price_foreign) : '',
                          currency: p.currency ?? '',
                          active: p.active,
                        })
                      }
                    >
                      {t('common.edit')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={t(editing.id ? 'inv.editProduct' : 'inv.newProduct')} onClose={() => setEditing(null)}>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('inv.sku')} required>
                <input className={inputCls} dir="ltr" required value={editing.sku} onChange={(e) => setEditing({ ...editing, sku: e.target.value })} />
              </Field>
              <Field label={t('inv.unit')}>
                <input className={inputCls} value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} />
              </Field>
            </div>
            <Field label={t('crm.name')} required>
              <input className={inputCls} required value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label={t('crm.nameAr')}>
              <input className={inputCls} dir="rtl" value={editing.name_ar} onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('inv.manufacturer')}>
                <input className={inputCls} value={editing.manufacturer} onChange={(e) => setEditing({ ...editing, manufacturer: e.target.value })} />
              </Field>
              <Field label={t('inv.category')}>
                <input className={inputCls} value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label={t('inv.priceEgp')} required>
                <input type="number" min="0" step="0.01" inputMode="decimal" className={inputCls} required value={editing.price_egp} onChange={(e) => setEditing({ ...editing, price_egp: e.target.value })} />
              </Field>
              <Field label={t('inv.priceForeign')}>
                <input type="number" min="0" step="0.01" inputMode="decimal" className={inputCls} value={editing.price_foreign} onChange={(e) => setEditing({ ...editing, price_foreign: e.target.value })} />
              </Field>
              <Field label={t('inv.currency')}>
                <select className={inputCls} value={editing.currency} onChange={(e) => setEditing({ ...editing, currency: e.target.value })}>
                  <option value="">—</option>
                  {['USD', 'EUR', 'GBP', 'CNY'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              {t('inv.active')}
            </label>
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
