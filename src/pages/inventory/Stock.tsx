import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useLocations, useProducts, byId } from '../../lib/queries';
import { StockRow } from '../../lib/types';
import { fmtDate, fmtQty } from '../../lib/format';
import { EmptyState, Loading, inputCls } from '../../components/ui';

export default function Stock() {
  const { t } = useTranslation();
  const { data: locations } = useLocations();
  const { data: products } = useProducts();
  const productMap = byId(products);
  const locationMap = byId(locations);
  const [locationFilter, setLocationFilter] = useState('');

  const { data: stock, isLoading } = useQuery({
    queryKey: ['stock', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_on_hand').select('*');
      if (error) throw error;
      return data as StockRow[];
    },
  });

  if (isLoading) return <Loading />;

  const rows = (stock ?? [])
    .filter((s) => !locationFilter || s.location_id === locationFilter)
    .sort((a, b) =>
      (locationMap[a.location_id]?.name ?? '').localeCompare(locationMap[b.location_id]?.name ?? '') ||
      (productMap[a.product_id]?.sku ?? '').localeCompare(productMap[b.product_id]?.sku ?? ''),
    );

  const soon = new Date();
  soon.setDate(soon.getDate() + 90);

  return (
    <div className="space-y-3">
      <select className={`${inputCls} w-auto`} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
        <option value="">{t('common.all')}</option>
        {(locations ?? []).map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({t(l.type === 'warehouse' ? 'inv.warehouse' : 'inv.hospitalShelf')})
          </option>
        ))}
      </select>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.location')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.sku')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.product')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.lot')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.expiry')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('inv.qty')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!rows.length && (
              <tr><td colSpan={6}><EmptyState hint={t('inv.emptyStock')} /></td></tr>
            )}
            {rows.map((s) => {
              const expiringSoon = new Date(s.expiry_date) <= soon;
              return (
                <tr key={`${s.location_id}-${s.product_id}-${s.lot_no}`}>
                  <td className="px-4 py-2.5">{locationMap[s.location_id]?.name ?? '—'}</td>
                  <td className="px-4 py-2.5" dir="ltr">{productMap[s.product_id]?.sku ?? '—'}</td>
                  <td className="px-4 py-2.5">{productMap[s.product_id]?.name ?? '—'}</td>
                  <td className="px-4 py-2.5" dir="ltr">{s.lot_no}</td>
                  <td className={`px-4 py-2.5 ${expiringSoon ? 'text-brand-red font-semibold' : ''}`}>
                    {fmtDate(s.expiry_date)}
                  </td>
                  <td className="px-4 py-2.5 text-end">{fmtQty(s.qty)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
