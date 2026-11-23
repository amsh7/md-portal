import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useHospitals, useLocations, useProducts, byId } from '../lib/queries';
import { ShelfCount } from '../lib/counts';
import { StockRow } from '../lib/types';
import { fmtDate, fmtQty } from '../lib/format';

interface Announcement {
  id: string;
  title: string;
  title_ar: string | null;
  body: string;
  body_ar: string | null;
  created_at: string;
}

const DAY = 24 * 60 * 60 * 1000;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-lg border">
      <h2 className="px-4 py-3 border-b font-semibold text-sm">{title}</h2>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const ar = i18n.language === 'ar';
  const isAM = profile?.role === 'admin' || profile?.role === 'manager';
  const isRep = profile?.role === 'sales_rep';

  const { data: announcements } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements').select('*')
        .order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return data as Announcement[];
    },
  });

  const { data: hospitals } = useHospitals();
  const { data: locations } = useLocations();
  const { data: products } = useProducts();
  const locationMap = byId(locations);
  const productMap = byId(products);

  const { data: counts } = useQuery({
    queryKey: ['counts'],
    enabled: isAM || isRep,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shelf_counts').select('*')
        .order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      return data as ShelfCount[];
    },
  });

  const { data: draftPos } = useQuery({
    queryKey: ['pos', 'draft'],
    enabled: profile?.role === 'admin',
    queryFn: async () => {
      const { count, error } = await supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: stock } = useQuery({
    queryKey: ['stock', 'all'],
    enabled: isAM,
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_on_hand').select('*');
      if (error) throw error;
      return data as StockRow[];
    },
  });

  const displayName = ar && profile?.full_name_ar ? profile.full_name_ar : profile?.full_name ?? '';

  // --- derived alert data ---
  const now = Date.now();
  const lastCountByHospital: Record<string, string> = {};
  for (const c of counts ?? []) {
    if (c.status === 'rejected') continue;
    const prev = lastCountByHospital[c.hospital_id];
    if (!prev || c.counted_at > prev) lastCountByHospital[c.hospital_id] = c.counted_at;
  }
  const overdue = (hospitals ?? [])
    .filter((h) => h.status !== 'dormant')
    .filter((h) => (isRep ? h.assigned_rep_id === profile?.id : true))
    .map((h) => ({ h, last: lastCountByHospital[h.id] }))
    .filter(({ last }) => !last || now - new Date(last).getTime() > 35 * DAY);

  const pending = (counts ?? []).filter((c) => c.status === 'submitted');

  const soon = new Date(now + 90 * DAY).toISOString().slice(0, 10);
  const expiring = (stock ?? []).filter((s) => s.expiry_date <= soon);

  const warehouseIds = new Set((locations ?? []).filter((l) => l.type === 'warehouse').map((l) => l.id));
  const warehouseTotals: Record<string, number> = {};
  for (const s of stock ?? []) {
    if (warehouseIds.has(s.location_id)) {
      warehouseTotals[s.product_id] = (warehouseTotals[s.product_id] ?? 0) + s.qty;
    }
  }
  const lowStock = (products ?? []).filter(
    (p) => p.active && p.min_warehouse_qty != null && (warehouseTotals[p.id] ?? 0) < p.min_warehouse_qty,
  );

  function hospitalName(h: { name: string; name_ar: string | null }) {
    return ar && h.name_ar ? h.name_ar : h.name;
  }

  const noAlerts =
    isAM && !pending.length && !expiring.length && !lowStock.length && !overdue.length && !draftPos;

  return (
    <div className="space-y-5 max-w-3xl">
      <h1 className="text-xl font-bold">{t('dashboard.welcome', { name: displayName })}</h1>

      {(isAM || isRep) && (
        <Panel title={t('alerts.title')}>
          {noAlerts && !isRep && <p className="px-4 py-5 text-sm text-gray-500">{t('alerts.none')}</p>}
          {isRep && !overdue.length && <p className="px-4 py-5 text-sm text-gray-500">{t('alerts.none')}</p>}
          <div className="divide-y">
            {isAM && pending.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-amber-700 mb-1">
                  {t('alerts.pendingCounts')} ({pending.length})
                </p>
                <Link to="/inventory/counts" className="text-sm text-brand-red hover:underline">
                  {t('counts.title')} →
                </Link>
              </div>
            )}
            {!!draftPos && (
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-amber-700 mb-1">
                  {t('alerts.pendingPos')} ({draftPos})
                </p>
                <Link to="/purchasing" className="text-sm text-brand-red hover:underline">
                  {t('po.title')} →
                </Link>
              </div>
            )}
            {overdue.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-amber-700 mb-1">
                  {isRep ? t('alerts.myDueCounts') : t('alerts.overdueCounts')} ({overdue.length})
                </p>
                <ul className="text-sm space-y-0.5">
                  {overdue.slice(0, 8).map(({ h, last }) => (
                    <li key={h.id} className="flex justify-between gap-2">
                      <Link to={`/crm/hospitals/${h.id}`} className="text-brand-red hover:underline">
                        {hospitalName(h)}
                      </Link>
                      <span className="text-gray-400">
                        {last ? t('alerts.lastCount', { date: fmtDate(last) }) : t('alerts.neverCounted')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isAM && expiring.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-brand-red mb-1">
                  {t('alerts.expiring')} ({expiring.length})
                </p>
                <ul className="text-sm space-y-0.5">
                  {expiring.slice(0, 8).map((s) => (
                    <li key={`${s.location_id}-${s.product_id}-${s.lot_no}`} className="flex justify-between gap-2">
                      <span>
                        {productMap[s.product_id]?.name ?? '—'} · <span dir="ltr">{s.lot_no}</span> · {locationMap[s.location_id]?.name ?? ''}
                      </span>
                      <span className="text-gray-500">{fmtDate(s.expiry_date)} ({fmtQty(s.qty)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isAM && lowStock.length > 0 && (
              <div className="px-4 py-3">
                <p className="text-sm font-semibold text-amber-700 mb-1">
                  {t('alerts.lowStock')} ({lowStock.length})
                </p>
                <ul className="text-sm space-y-0.5">
                  {lowStock.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>{ar && p.name_ar ? p.name_ar : p.name}</span>
                      <span className="text-gray-500">
                        {t('alerts.below', { qty: fmtQty(warehouseTotals[p.id] ?? 0), min: fmtQty(p.min_warehouse_qty!) })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      )}

      <Panel title={t('dashboard.announcements')}>
        {!announcements?.length ? (
          <p className="px-4 py-6 text-sm text-gray-500">{t('dashboard.noAnnouncements')}</p>
        ) : (
          <ul className="divide-y">
            {announcements.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-sm">{ar && a.title_ar ? a.title_ar : a.title}</span>
                  <span className="text-xs text-gray-400 shrink-0">{fmtDate(a.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                  {ar && a.body_ar ? a.body_ar : a.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
