import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useHospitals, useProducts, byId } from '../../lib/queries';
import { fmtDate, fmtEGP, fmtQty } from '../../lib/format';
import { EmptyState, Loading, Modal } from '../../components/ui';

interface UsageInvoice {
  id: string;
  invoice_no: string;
  hospital_id: string;
  shelf_count_id: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  status: string;
}

interface InvoiceLine {
  id: string;
  invoice_id: string;
  product_id: string;
  lot_no: string;
  qty: number;
  unit_price: number;
  line_total: number;
}

export default function Invoices() {
  const { t, i18n } = useTranslation();
  const { data: hospitals } = useHospitals();
  const { data: products } = useProducts();
  const hospitalMap = byId(hospitals);
  const productMap = byId(products);
  const [open, setOpen] = useState<UsageInvoice | null>(null);
  const ar = i18n.language === 'ar';

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usage_invoices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as UsageInvoice[];
    },
  });

  const { data: lines } = useQuery({
    queryKey: ['invoice_lines', open?.id],
    enabled: !!open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usage_invoice_lines')
        .select('*')
        .eq('invoice_id', open!.id);
      if (error) throw error;
      return data as InvoiceLine[];
    },
  });

  function hospitalName(id: string) {
    const h = hospitalMap[id];
    return h ? (ar && h.name_ar ? h.name_ar : h.name) : '—';
  }

  function exportCsv() {
    const header = 'invoice_no,hospital,invoice_date,due_date,total_egp,status';
    const rows = (invoices ?? []).map((i) =>
      [i.invoice_no, `"${hospitalMap[i.hospital_id]?.name ?? ''}"`, i.invoice_date, i.due_date ?? '', i.total, i.status].join(','),
    );
    const blob = new Blob(['﻿' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'usage_invoices.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button className="text-sm border rounded px-3 py-1.5 text-gray-600" onClick={exportCsv} disabled={!invoices?.length}>
          {t('invoices.exportCsv')}
        </button>
      </div>
      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('invoices.no')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('crm.hospital')}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t('common.date')}</th>
              <th className="px-4 py-2.5 text-start font-semibold hidden sm:table-cell">{t('invoices.due')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('invoices.total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!invoices?.length && (
              <tr><td colSpan={5}><EmptyState hint={t('invoices.empty')} /></td></tr>
            )}
            {invoices?.map((inv) => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5" dir="ltr">
                  <button className="font-medium text-brand-red hover:underline" onClick={() => setOpen(inv)}>
                    {inv.invoice_no}
                  </button>
                </td>
                <td className="px-4 py-2.5">{hospitalName(inv.hospital_id)}</td>
                <td className="px-4 py-2.5">{fmtDate(inv.invoice_date)}</td>
                <td className="px-4 py-2.5 hidden sm:table-cell">{fmtDate(inv.due_date)}</td>
                <td className="px-4 py-2.5 text-end font-medium">{fmtEGP(inv.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal title={open.invoice_no} onClose={() => setOpen(null)}>
          <p className="text-sm text-gray-600 mb-3">
            {hospitalName(open.hospital_id)} · {fmtDate(open.invoice_date)} · {t('invoices.due')} {fmtDate(open.due_date)}
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-start font-semibold">{t('inv.product')}</th>
                <th className="py-2 text-start font-semibold">{t('inv.lot')}</th>
                <th className="py-2 text-end font-semibold">{t('inv.qty')}</th>
                <th className="py-2 text-end font-semibold">{t('invoices.total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines?.map((l) => (
                <tr key={l.id}>
                  <td className="py-2">{productMap[l.product_id]?.name ?? '—'}</td>
                  <td className="py-2" dir="ltr">{l.lot_no}</td>
                  <td className="py-2 text-end">{fmtQty(l.qty)}</td>
                  <td className="py-2 text-end">{fmtEGP(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-end font-bold mt-3">{fmtEGP(open.total)}</p>
        </Modal>
      )}
    </div>
  );
}
