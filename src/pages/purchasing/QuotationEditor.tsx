import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useHospitals, useProducts, byId } from '../../lib/queries';
import { Quotation, QuotationLine, linesTotal } from '../../lib/purchasing';
import { Deal } from '../../lib/types';
import { fmtDate, fmtEGP, fmtQty } from '../../lib/format';
import { EmptyState, ErrorNote, Field, Loading, Modal, PrimaryButton, inputCls } from '../../components/ui';
import PrintDoc from '../../components/PrintDoc';
import { QuoteStatusBadge } from './Quotations';

export default function QuotationEditor() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const { data: hospitals } = useHospitals();
  const { data: products } = useProducts();
  const hospitalMap = byId(hospitals);
  const productMap = byId(products);
  const ar = i18n.language === 'ar';

  const [newProduct, setNewProduct] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [edits, setEdits] = useState<Record<string, { qty: string; price: string }>>({});
  const [terms, setTerms] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [dealPrompt, setDealPrompt] = useState(false);
  const [dealId, setDealId] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const isAM = profile?.role === 'admin' || profile?.role === 'manager';
  const canPrice = isAM; // §12.4: quotation prices manager/admin only (Wael rule) — DB trigger enforces

  const { data: quote, isLoading } = useQuery({
    queryKey: ['quote', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotations').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Quotation;
    },
  });

  const { data: lines } = useQuery({
    queryKey: ['quote_lines', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotation_lines').select('*').eq('quotation_id', id).order('id');
      if (error) throw error;
      return data as QuotationLine[];
    },
  });

  const { data: openDeals } = useQuery({
    queryKey: ['open_deals', quote?.hospital_id],
    enabled: !!quote,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals').select('*')
        .eq('hospital_id', quote!.hospital_id)
        .not('stage', 'in', '(won,lost)');
      if (error) throw error;
      return data as Deal[];
    },
  });

  const editable = quote?.status === 'draft';

  function refresh() {
    qc.invalidateQueries({ queryKey: ['quote', id] });
    qc.invalidateQueries({ queryKey: ['quote_lines', id] });
    qc.invalidateQueries({ queryKey: ['quotes'] });
  }

  const addLine = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('quotation_lines').insert({
        quotation_id: id,
        product_id: newProduct,
        qty: Number(newQty),
        unit_price: canPrice ? Number(newPrice || 0) : 0,
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
      const { error } = await supabase.from('quotation_lines').delete().eq('id', lineId);
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
        const price = canPrice ? Number(e.price) : l.unit_price;
        if (qty !== l.qty || price !== l.unit_price) {
          const { error } = await supabase
            .from('quotation_lines')
            .update(canPrice ? { qty, unit_price: price } : { qty })
            .eq('id', l.id);
          if (error) throw error;
        }
      }
      const patch: Record<string, unknown> = {};
      if (terms !== null && terms !== (quote?.terms ?? '')) patch.terms = terms;
      if (validUntil !== null && validUntil !== (quote?.valid_until ?? '')) patch.valid_until = validUntil || null;
      if (Object.keys(patch).length) {
        const { error } = await supabase.from('quotations').update(patch).eq('id', id);
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
      const { error } = await supabase.from('quotations').update({ status }).eq('id', id);
      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      refresh();
      if (status === 'accepted' && openDeals?.length) {
        setDealId(openDeals[0].id);
        setDealPrompt(true);
      }
    },
  });

  const winDeal = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('deals').update({ stage: 'won' }).eq('id', dealId);
      if (error) throw error;
    },
    onSuccess: () => {
      setDealPrompt(false);
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['open_deals'] });
      setMessage(t('quote.dealUpdated'));
      setTimeout(() => setMessage(null), 3000);
    },
  });

  if (isLoading || !quote) return <Loading />;

  const hospital = hospitalMap[quote.hospital_id];
  const hospitalName = hospital ? (ar && hospital.name_ar ? hospital.name_ar : hospital.name) : '—';

  const total = linesTotal(
    (lines ?? []).map((l) => {
      const e = edits[l.id];
      return e
        ? { qty: Number(e.qty || 0), unit_price: canPrice ? Number(e.price || 0) : l.unit_price }
        : l;
    }),
  );

  const unpriced = (lines ?? []).some((l) => {
    const e = edits[l.id];
    const price = e && canPrice ? Number(e.price || 0) : l.unit_price;
    return price <= 0;
  });

  function addSubmit(e: FormEvent) {
    e.preventDefault();
    if (newProduct && Number(newQty) > 0) addLine.mutate();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/purchasing/quotes" className="text-sm text-gray-400 hover:text-brand-red">←</Link>
        <h1 className="text-lg font-bold" dir="ltr">{quote.q_no}</h1>
        <QuoteStatusBadge status={quote.status} />
        <span className="text-sm text-gray-500">{hospitalName} · {fmtDate(quote.created_at)}</span>
        {message && <span className="text-sm text-green-700 ms-auto">{message}</span>}
      </div>

      {!canPrice && editable && (
        <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded px-3 py-2">
          {t('quote.priceByManager')}
        </p>
      )}

      <div className="bg-white rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="px-4 py-2.5 text-start font-semibold">{t('inv.product')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('inv.qty')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('po.unitPrice')}</th>
              <th className="px-4 py-2.5 text-end font-semibold">{t('po.lineTotal')}</th>
              {editable && <th className="w-8" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {!lines?.length && (
              <tr><td colSpan={5}><EmptyState hint={t('po.emptyLines')} /></td></tr>
            )}
            {lines?.map((l) => {
              const e = edits[l.id] ?? { qty: String(l.qty), price: String(l.unit_price) };
              const p = productMap[l.product_id];
              const price = canPrice ? Number(e.price || 0) : l.unit_price;
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
                    {editable && canPrice ? (
                      <input
                        type="number" inputMode="decimal" min="0" step="0.01"
                        className="w-28 border rounded px-2 py-1.5 text-end"
                        value={e.price}
                        onChange={(ev) => setEdits({ ...edits, [l.id]: { ...e, price: ev.target.value } })}
                      />
                    ) : l.unit_price > 0 ? fmtEGP(l.unit_price) : <span className="text-gray-400">{t('quote.unpriced')}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-end font-medium">{fmtEGP(Number(e.qty || 0) * price)}</td>
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
            })}
            <tr className="bg-gray-50">
              <td className="px-4 py-2.5 font-bold" colSpan={3}>{t('po.total')}</td>
              <td className="px-4 py-2.5 text-end font-bold">{fmtEGP(total)}</td>
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
          {canPrice && (
            <div className="w-32">
              <Field label={t('po.unitPrice')}>
                <input type="number" inputMode="decimal" min="0" step="0.01" className={inputCls}
                  value={newPrice} onChange={(e) => setNewPrice(e.target.value)} />
              </Field>
            </div>
          )}
          <PrimaryButton type="submit" disabled={addLine.isPending || !newProduct || !(Number(newQty) > 0)}>
            {t('po.addLine')}
          </PrimaryButton>
        </form>
      )}

      <div className="bg-white rounded-lg border p-4 space-y-4">
        <Field label={t('quote.validUntil')}>
          <input
            type="date" className={inputCls}
            value={validUntil ?? quote.valid_until ?? ''}
            onChange={(e) => setValidUntil(e.target.value)}
            disabled={!editable}
          />
        </Field>
        <Field label={t('quote.terms')}>
          <textarea
            className={inputCls} rows={3}
            value={terms ?? quote.terms ?? ''}
            onChange={(e) => setTerms(e.target.value)}
            disabled={!editable}
          />
        </Field>
      </div>

      {(addLine.isError || removeLine.isError || save.isError || setStatus.isError) && (
        <ErrorNote message={t('common.error')} />
      )}

      <div className="flex gap-2 justify-end flex-wrap">
        {!!lines?.length && (
          <button className="text-sm text-gray-600 border rounded px-4 py-2" onClick={() => setPrinting(true)}>
            {t('po.print')}
          </button>
        )}
        {editable && (
          <>
            <button
              className="text-sm text-gray-600 border rounded px-4 py-2"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {t('common.save')}
            </button>
            <PrimaryButton
              disabled={setStatus.isPending || !lines?.length || unpriced}
              title={unpriced ? t('quote.needPrices') : undefined}
              onClick={() => window.confirm(t('quote.confirmSend')) && setStatus.mutate('sent')}
            >
              {t('quote.send')}
            </PrimaryButton>
          </>
        )}
        {editable && unpriced && !!lines?.length && (
          <p className="text-xs text-gray-500 self-center">{t('quote.needPrices')}</p>
        )}
        {quote.status === 'sent' && (
          <>
            <button
              className="text-sm text-gray-600 border rounded px-4 py-2"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('expired')}
            >
              {t('quote.expire')}
            </button>
            <button
              className="text-sm text-gray-600 border rounded px-4 py-2"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate('rejected')}
            >
              {t('quote.rejectBtn')}
            </button>
            <PrimaryButton disabled={setStatus.isPending} onClick={() => setStatus.mutate('accepted')}>
              {t('quote.accept')}
            </PrimaryButton>
          </>
        )}
      </div>

      {dealPrompt && (
        <Modal title={t('quote.dealPrompt')} onClose={() => setDealPrompt(false)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">{t('quote.dealHint')}</p>
            <select className={inputCls} value={dealId} onChange={(e) => setDealId(e.target.value)}>
              {(openDeals ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
            {winDeal.isError && <ErrorNote message={t('common.error')} />}
            <div className="flex justify-end gap-2">
              <button className="text-sm text-gray-600 border rounded px-4 py-2" onClick={() => setDealPrompt(false)}>
                {t('quote.dealSkip')}
              </button>
              <PrimaryButton disabled={winDeal.isPending || !dealId} onClick={() => winDeal.mutate()}>
                {t('quote.dealUpdate')}
              </PrimaryButton>
            </div>
          </div>
        </Modal>
      )}

      {printing && (
        <PrintDoc
          titleEn="Quotation"
          titleAr="عرض سعر"
          docNo={quote.q_no}
          date={quote.created_at}
          partyLabelEn="To"
          partyLabelAr="إلى"
          partyName={hospital?.name ?? '—'}
          partyNameAr={hospital?.name_ar}
          currency="EGP"
          metaRows={quote.valid_until ? [{
            labelEn: 'Valid until', labelAr: 'صالح حتى', value: fmtDate(quote.valid_until),
          }] : []}
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
          termsTitleEn="Terms"
          termsTitleAr="الشروط"
          terms={quote.terms}
          onClose={() => setPrinting(false)}
        />
      )}
    </div>
  );
}
