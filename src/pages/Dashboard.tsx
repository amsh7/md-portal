import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useHospitals, useLocations, useProducts, byId } from '../lib/queries';
import { ShelfCount } from '../lib/counts';
import { StockRow } from '../lib/types';
import { LeaveBalance, LeaveRequest, addDays, weekStartOf } from '../lib/hr';
import { canApprove, isFinanceApprover } from '../lib/roles';
import { fmtDate, fmtQty } from '../lib/format';
import CheckInButton from '../components/CheckInButton';

interface Announcement {
  id: string;
  title: string;
  title_ar: string | null;
  body: string;
  body_ar: string | null;
  created_at: string;
}

const DAY = 24 * 60 * 60 * 1000;

function StatTile({ to, count, label, tone }: { to: string; count: number; label: string; tone: 'red' | 'amber' }) {
  return (
    <Link
      to={to}
      className={`block bg-white rounded-xl border p-4 hover:shadow transition-shadow border-s-4 ${
        tone === 'red' ? 'border-s-brand-red' : 'border-s-amber-400'
      }`}
    >
      <p className="text-3xl font-extrabold leading-none">{fmtQty(count)}</p>
      <p className="text-xs text-gray-500 mt-2">{label}</p>
    </Link>
  );
}

function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border">
      {title && (
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-sm">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const ar = i18n.language === 'ar';
  const role = profile?.role;
  const isAdmin = role === 'admin';
  const isAM = isAdmin || role === 'manager';
  const isRep = role === 'sales_rep';
  const isHr = isAdmin || role === 'hr';
  const approver = canApprove(profile);
  const finance = isFinanceApprover(profile);

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

  const { data: stock } = useQuery({
    queryKey: ['stock', 'all'],
    enabled: isAM,
    queryFn: async () => {
      const { data, error } = await supabase.from('stock_on_hand').select('*');
      if (error) throw error;
      return data as StockRow[];
    },
  });

  const { data: draftPos } = useQuery({
    queryKey: ['pos', 'draft'],
    enabled: approver,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('purchase_orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const { data: pendingLeaves } = useQuery({
    queryKey: ['leave_requests', 'pending_count'],
    enabled: isHr || approver,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests').select('id, employee_id, status')
        .eq('status', 'pending');
      if (error) throw error;
      return data as Pick<LeaveRequest, 'id' | 'employee_id' | 'status'>[];
    },
  });

  const { data: officePending } = useQuery({
    queryKey: ['office_requests', 'pending'],
    enabled: finance || approver,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('office_requests').select('id, status')
        .in('status', ['pending_finance', 'pending_approval']);
      if (error) throw error;
      return data as { id: string; status: string }[];
    },
  });
  const officeFinanceCount = (officePending ?? []).filter((r) => r.status === 'pending_finance').length;
  const officeApprovalCount = (officePending ?? []).filter((r) => r.status === 'pending_approval').length;

  const lastFinishedWeek = addDays(weekStartOf(new Date()), -7);
  const { data: myWeekly } = useQuery({
    queryKey: ['weekly_reports', 'me', lastFinishedWeek],
    enabled: isRep,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_reports').select('id, status')
        .eq('rep_id', profile!.id).eq('week_start', lastFinishedWeek).maybeSingle();
      if (error) throw error;
      return data as { id: string; status: string } | null;
    },
  });
  const weeklyDue = isRep && myWeekly !== undefined && (!myWeekly || myWeekly.status === 'draft');

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

  const pendingCounts = (counts ?? []).filter((c) => c.status === 'submitted');

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

  const displayName = ar && profile?.full_name_ar ? profile.full_name_ar : profile?.full_name ?? '';

  const tiles: { to: string; count: number; label: string; tone: 'red' | 'amber' }[] = [];
  if (isAM && pendingCounts.length) tiles.push({ to: '/inventory/counts', count: pendingCounts.length, label: t('alerts.pendingCounts'), tone: 'amber' });
  if (approver && draftPos) tiles.push({ to: '/purchasing', count: draftPos, label: t('alerts.pendingPos'), tone: 'amber' });
  if ((isHr || approver) && pendingLeaves?.length) tiles.push({ to: '/hr/approvals', count: pendingLeaves.length, label: t('alerts.pendingLeaves'), tone: 'amber' });
  if (finance && officeFinanceCount) tiles.push({ to: '/hr/requests', count: officeFinanceCount, label: t('alerts.officeFinance'), tone: 'amber' });
  if (approver && officeApprovalCount) tiles.push({ to: '/hr/requests', count: officeApprovalCount, label: t('alerts.officeApprove'), tone: 'amber' });
  if (weeklyDue) tiles.push({ to: '/attendance/weekly', count: 1, label: t('alerts.weeklyDue'), tone: 'amber' });
  if ((isAM || isRep) && overdue.length) tiles.push({ to: isRep ? '/crm' : '/inventory/counts', count: overdue.length, label: isRep ? t('alerts.myDueCounts') : t('alerts.overdueCounts'), tone: 'amber' });
  if (isAM && expiring.length) tiles.push({ to: '/inventory', count: expiring.length, label: t('alerts.expiring'), tone: 'red' });
  if (isAM && lowStock.length) tiles.push({ to: '/inventory/products', count: lowStock.length, label: t('alerts.lowStock'), tone: 'red' });

  const showAlertDetails = (isAM && (expiring.length > 0 || lowStock.length > 0)) || overdue.length > 0;

  return (
    <div className="space-y-5 max-w-5xl">
      {/* header */}
      <div>
        <h1 className="text-2xl font-extrabold">{t('dashboard.welcome', { name: displayName })}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {profile?.job_title ? `${profile.job_title} · ` : ''}{fmtDate(new Date())}
        </p>
      </div>

      {/* check-in + leave balance */}
      <div className="bg-brand-black text-white rounded-xl p-5 flex flex-wrap items-center gap-5 justify-between">
        <CheckInButton dark />
        {balance && (
          <Link to="/hr" className="text-sm text-gray-300 hover:text-white text-end">
            <span className="block text-2xl font-bold text-white">
              {fmtQty(balance.annual_total - balance.annual_used)}
              <span className="text-sm font-normal text-gray-400"> / {fmtQty(balance.annual_total)}</span>
            </span>
            {t('hr.annual')}
            <span className="block text-xs text-gray-400 mt-0.5">
              {t('dashboard.sickShort', { n: fmtQty(balance.sick_total - balance.sick_used) })}
            </span>
          </Link>
        )}
      </div>

      {/* attention tiles */}
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tiles.map((tl) => <StatTile key={tl.label} {...tl} />)}
        </div>
      )}
      {(isAM || isRep) && tiles.length === 0 && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          {t('alerts.none')}
        </p>
      )}

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          {/* alert details */}
          {showAlertDetails && (
            <Card title={t('alerts.title')}>
              <div className="divide-y">
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
            </Card>
          )}

          {/* quick links for everyone */}
          <Card title={t('dashboard.quickLinks')}>
            <div className="p-4 flex flex-wrap gap-2">
              <Link to="/hr" className="text-sm border rounded-full px-4 py-1.5 hover:border-brand-red hover:text-brand-red">
                {t('hr.newRequest')}
              </Link>
              <Link to="/attendance/visits" className="text-sm border rounded-full px-4 py-1.5 hover:border-brand-red hover:text-brand-red">
                {t('att.newVisit')}
              </Link>
              {(isAM || isRep) && (
                <Link to="/crm" className="text-sm border rounded-full px-4 py-1.5 hover:border-brand-red hover:text-brand-red">
                  {t('nav.crm')}
                </Link>
              )}
              {isAM && (
                <Link to="/purchasing/quotes" className="text-sm border rounded-full px-4 py-1.5 hover:border-brand-red hover:text-brand-red">
                  {t('quote.new')}
                </Link>
              )}
            </div>
          </Card>
        </div>

        {/* announcements */}
        <Card title={t('dashboard.announcements')}>
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
        </Card>
      </div>
    </div>
  );
}
