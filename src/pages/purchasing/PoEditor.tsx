import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useLocations, useProducts, byId } from '../../lib/queries';
import { PoLine, PurchaseOrder, linesTotal } from '../../lib/purchasing';
import { fmtDate, fmtMoney, fmtQty } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';
import PrintDoc from '../../components/PrintDoc';
import { PoStatusBadge } from './PurchaseOrders';

interface ReceiveRow {
  qty: string;
  lot: string;
  expiry: string;
}

export default function PoEditor() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: products } = useProducts();
  const { data: locations } = useLocations();
  const productMap = byId(products);
  const ar = i18n.language === 'ar';

  const [newProduct, setNewProduct] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [edits, setEdits] = useState<Record<string, { qty: string; price: string }>>({});
  const [notes, setNotes] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [receiveLoc, setReceiveLoc] = useState('');
  const [receiveRows, setReceiveRows] = useState<Record<string, ReceiveRow>>({});
  const [printing, setPrinting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';
  const isAM = isAdmin || profile?.role === 'manager';
  const canReceive = isAdmin || profile?.role === 'warehouse';

  const { data: po, isLoading } = useQuery({
    queryKey: ['po', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('purchase_orders').select('*').eq('id', id).single();
      if (error) throw error;
      return data as PurchaseOrder;
    },
  });

  const { data: lines } = useQuery({
    queryKey: ['po_lines', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_lines').select('*').eq('po_id', id).order('id');
      if (error) throw error;
      return data as PoLine[];
    },
  });

  const editable = po?.status === 'draft' && isAM;
  const warehouses = (locations ?? []).filter((l) => l.type === 'warehouse');

  function refresh() {
    qc.invalidateQueries({ queryKey: ['po', id] });
    qc.invalidateQueries({ queryKey: ['po_lines', id] });
    qc.invalidateQueries({ queryKey: ['pos'] });
  }

  const addLine = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('purchase_order_lines').insert({
        po_id: id,
        product_id: newProduct,
        qty: Number(newQty),
        unit_price: Number(newPrice || 0),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewProduct(''); setNewQty(''); setNewPrice('');
      refresh();
    },
  });

  const removeLine = useMutation({
    mutationFn: async (lineId: string) => {
      const { error } = await supabase.from('purchase_order_lines').delete().eq('id', lineId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const save = useMutation({
    mutationFn: async () => {
      for (const l of lines ?? []) {
        const e = edits[l.id];
        if (!e) continue;
        const qty = Number(e.qty);
        const price = Number(e.price);
        if (qty !== l.qty || price !== l.unit_price) {
          const { error } = await supabase
            .from('purchase_order_lines')
            .update({ qty, unit_price: price })
            .eq('id', l.id);
          if (error) throw error;
        }
      }
      if (notes !== null && notes !== (po?.notes ?? '')) {
        const { error } = await supabase.from('purchase_orders').update({ notes }).eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      refresh();
      setMessage(t('users.saved'));
      setTimeout(() => setMessage(null), 2500);
    },
  });

  const setStatus = useMutation({
    mutationFn: async (status: string) => {
      const patch: Record<string, unknown> = { status };
      if (status === 'sent') patch.sent_at = new Date().toISOString();
      const { error } = await supabase.from('purchase_orders').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const deletePo = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos'] });
      navigate('/purchasing');
    },
  });

  const receive = useMutation({
    mutationFn: async () => {
      const payload = (lines ?? [])
        .map((l) => {
          const r = receiveRows[l.id];
          return r && Number(r.qty) > 0
            ? { line_id: l.id, qty: Number(r.qty), lot_no: r.lot, expiry_date: r.expiry }
            : null;
        })
        .filter(Boolean);
      const { error } = await supabase.rpc('receive_po', {
        p_po_id: id,
        p_location_id: receiveLoc,
        p_lines: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setReceiving(false);
      setReceiveRows({});
      refresh();
      qc.invalidateQueries({ queryKey: ['stock'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      setMessage(t('po.receivedMsg'));
      setTimeout(() => setMessage(null), 3500);
    },
  });

  if (isLoading || !po) return <Loading />;

  const total = linesTotal(
    (lines ?? []).map((l) => {
      const e = edits[l.id];
      return e ? { qty: Number(e.qty || 0), unit_price: Number(e.price || 0) } : l;
    }),
  );

  const receivable = canReceive && ['approved', 'sent', 'partially_received'].includes(po.status);
  const anyReceiveQty = Object.values(receiveRows).some((r) => Number(r.qty) > 0);
  const receiveValid =
    receiveLoc &&
    anyReceiveQty &&
    (lines ?? []).every((l) => {
      const r = receiveRows[l.id];
      if (!r || !(Number(r.qty) > 0)) return true;
      return r.lot.trim() && r.expiry && Number(r.qty) <= l.qty - l.received_qty;
    });

  function lineRow(l: PoLine) {
    const e = edits[l.id] ?? { qty: String(l.qty), price: String(l.unit_price) };
    const p = productMap[l.product_id];
    return (
      <tr key={l.id}>
        <td className="px-4 py-2.5">
          {p ? (ar && p.name_ar ? p.name_ar : p.name) : '—'}
          <div className="text-xs text-gray-400" dir="ltr">{p?.sku}</div>
        </td>
        <td className="px-4 py-2.5 text-end">
          {editable ? (
            <input
              type="number" inputMode="decimal" min="1" step="1"
              className="w-20 border rounded px-2 py-1.5 text-end"
              value={e.qty}
              onChange={(ev) => setEdits({ ...edits, [l.id]: { ...e, qty: ev.target.value } })}
            />
          ) : fmtQty(l.qty)}
        </td>
        <td className="px-4 py-2.5 text-end">
          {editable ? (
            <input
              type="number" inputMode="decimal" min="0" step="0.01"
              className="w-28 border rounded px-2 py-1.5 text-end"
              value={e.price}
              onChange={(ev) => setEdits({ ...edits, [l.id]: { ...e, price: ev.target.value } })}
            />
          ) : fmtMoney(l.unit_price, po!.currency)}
        </td>
        <td className="px-4 py-2.5 text-end font-medium">
          {fmtMoney(Number(e.qty || 0) * Number(e.price || 0), po!.currency)}
        </td>
        {po!.status !== 'draft' && (
          <td className="px-4 py-2.5 text-end">
            {fmtQty(l.received_qty)} / {fmtQty(l.qty)}
          </td>
        )}
        {editable && (
          <td className="px-2 py-2.5 text-end">
            <button
              className="text-gray-400 hover:text-brand-red text-lg leading-none"
              onClick={() => window.confirm(t('common.confirmDelete')) && removeLine.mutate(l.id)}
              aria-label={t('common.delete')}
            >
              ×
            </button>
          </td>
        )}
      </tr>
    );
  }

  function addSubmit(e: FormEvent) {
    e.preventDefault();
    if (newProduct && Number(newQty) > 0) addLine.mutate();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/purchasing" className="text-sm text-gray-400 hover:text-brand-red">←</Link>
        <h1 className="text-lg font-bold" dir="ltr">{po.po_no}</h1>
        <PoStatusBadge status={po.status} />
        <span className="text-sm text-gray-500">{po.supplier} · {po.currency} · {fmtDate(po.created_at)}</span>
        {message && <span className="text-sm text-green-700 ms-auto">{message}</span>}
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.product')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('inv.qty')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('po.unitPrice')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('po.lineTotal')}</th>
              {po.status !== 'draft' && <th className="px-4 py-2.5 text-end font-semibold">{t('po.receivedCol')}</th>}
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {!lines?.length && (
              <tr><td colSpan={6}><EmptyState hint={t('po.emptyLines')} /></td></tr>
            )}
            {lines?.map(lineRow)}
            <tr className="bg-gray-50">
              <td className="px-4 py-2.5 font-bold" colSpan={3}>{t('po.total')}</td>
              <td className="px-4 py-2.5 text-end font-bold">{fmtMoney(total, po.currency)}</td>
              {po.status !== 'draft' && <td />}
              {editable && <td />}
            </tr>
          </tbody>
        </table>
      </div>

      {editable && (
        <form onSubmit={addSubmit} className="bg-white rounded-lg border p-4 flex flex-wrap gap-3 items-end">
          <div className="grow min-w-48">
            <Field label={t('inv.product')}>
              <select className={inputCls} value={newProduct} onChange={(e) => setNewProduct(e.target.value)}>
                <option value="">—</option>
                {(products ?? []).filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>{p.sku} — {ar && p.name_ar ? p.name_ar : p.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="w-24">
            <Field label={t('inv.qty')}>
              <input type="number" inputMode="decimal" min="1" step="1" className={inputCls}
                value={newQty} onChange={(e) => setNewQty(e.target.value)} />
            </Field>
          </div>
          <div className="w-32">
            <Field label={t('po.unitPrice')}>
              <input type="number" inputMode="decimal" min="0" step="0.01" className={inputCls}
                value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
            </Field>
          </div>
          <PrimaryButton type="submit" disabled={addLine.isPending || !newProduct || !(Number(newQty) > 0)}>
            {t('po.addLine')}
          </PrimaryButton>
        </form>
      )}

      <div className="bg-white rounded-lg border p-4">
        <Field label={t('common.notes')}>
          <textarea
            className={inputCls} rows={2}
            value={notes ?? po.notes ?? ''}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!editable}
          />
        </Field>
      </div>

      {(addLine.isError || removeLine.isError || save.isError || setStatus.isError || deletePo.isError) && (
        <ErrorNote message={t('common.error')} />
      )}

      <div className="flex gap-2 justify-end flex-wrap">
        {po.status === 'draft' && isAdmin && (
          <button
            className="text-sm text-gray-500 border rounded px-4 py-2 hover:text-brand-red me-auto"
            disabled={deletePo.isPending}
            onClick={() => window.confirm(t('common.confirmDeleteDraft')) && deletePo.mutate()}
          >
            {t('common.deleteDraft')}
          </button>
        )}
        {!!lines?.length && (
          <button className="text-sm text-gray-600 border rounded px-4 py-2" onClick={() => setPrinting(true)}>
            {t('po.print')}
          </button>
        )}
        {editable && (
          <button
            className="text-sm text-gray-600 border rounded px-4 py-2"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('common.save')}
          </button>
        )}
        {po.status === 'draft' && isAdmin && (
          <PrimaryButton
            disabled={setStatus.isPending || !lines?.length}
            onClick={() => window.confirm(t('po.confirmApprove')) && setStatus.mutate('approved')}
          >
            {t('po.approve')}
          </PrimaryButton>
        )}
        {po.status === 'approved' && isAM && (
          <PrimaryButton disabled={setStatus.isPending} onClick={() => setStatus.mutate('sent')}>
            {t('po.markSent')}
          </PrimaryButton>
        )}
        {receivable && (
          <PrimaryButton onClick={() => { setReceiveLoc(warehouses[0]?.id ?? ''); setReceiving(true); }}>
            {t('po.receive')}
          </PrimaryButton>
        )}
        {po.status === 'received' && isAM && (
          <PrimaryButton
            disabled={setStatus.isPending}
            onClick={() => window.confirm(t('po.confirmClose')) && setStatus.mutate('closed')}
          >
            {t('po.close')}
          </PrimaryButton>
        )}
      </div>

      {receiving && (
        <Modal title={t('po.receive')} onClose={() => setReceiving(false)}>
          <div className="space-y-4">
            <Field label={t('po.receiveInto')} required>
              <select className={inputCls} value={receiveLoc} onChange={(e) => setReceiveLoc(e.target.value)}>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </Field>
            <div className="space-y-3">
              {(lines ?? []).filter((l) => l.received_qty < l.qty).map((l) => {
                const p = productMap[l.product_id];
                const remaining = l.qty - l.received_qty;
                const r = receiveRows[l.id] ?? { qty: '', lot: '', expiry: '' };
                const set = (patch: Partial<ReceiveRow>) =>
                  setReceiveRows({ ...receiveRows, [l.id]: { ...r, ...patch } });
                return (
                  <div key={l.id} className="border rounded p-3">
                    <p className="text-sm font-medium mb-2">
                      {p ? (ar && p.name_ar ? p.name_ar : p.name) : '—'}
                      <span className="text-gray-400 font-normal"> · {t('po.remaining')}: {fmtQty(remaining)}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="number" inputMode="decimal" min="0" max={remaining} step="1"
                        placeholder={t('po.receiveQty')}
                        className="w-24 border rounded px-2 py-2 text-sm"
                        value={r.qty} onChange={(e) => set({ qty: e.target.value })}
                      />
                      <input
                        placeholder={t('inv.lot')} dir="ltr"
                        className="w-32 border rounded px-2 py-2 text-sm"
                        value={r.lot} onChange={(e) => set({ lot: e.target.value })}
                      />
                      <input
                        type="date"
                        className="border rounded px-2 py-2 text-sm"
                        value={r.expiry} onChange={(e) => set({ expiry: e.target.value })}
                      />
                    </div>
                    {Number(r.qty) > remaining && (
                      <p className="text-xs text-brand-red mt-1">{t('po.tooMany')}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {receive.isError && (
              <ErrorNote message={(receive.error as Error)?.message ?? t('common.error')} />
            )}
            <div className="flex justify-end gap-2">
              <button className="text-sm text-gray-600 border rounded px-4 py-2" onClick={() => setReceiving(false)}>
                {t('common.cancel')}
              </button>
              <PrimaryButton
                disabled={receive.isPending || !receiveValid}
                onClick={() => window.confirm(t('po.confirmReceive')) && receive.mutate()}
              >
                {t('po.receiveConfirmBtn')}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {printing && (
        <PrintDoc
          titleEn="Purchase Order"
          titleAr="أمر شراء"
          docNo={po.po_no}
          date={po.created_at}
          partyLabelEn="Supplier"
          partyLabelAr="المورد"
          partyName={po.supplier}
          currency={po.currency}
          lines={(lines ?? []).map((l) => {
            const p = productMap[l.product_id];
            return {
              key: l.id,
              sku: p?.sku ?? '',
              name: p?.name ?? '—',
              nameAr: p?.name_ar ?? null,
              qty: l.qty,
              unitPrice: l.unit_price,
            };
          })}
          termsTitleEn="Notes"
          termsTitleAr="ملاحظات"
          terms={po.notes}
          onClose={() => setPrinting(false)}
        />
      )}
    </div>
  );
}
