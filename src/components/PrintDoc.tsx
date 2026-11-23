import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fmtDate, fmtMoney, fmtQty } from '../lib/format';

export interface PrintLine {
  key: string;
  sku: string;
  name: string;
  nameAr: string | null;
  qty: number;
  unitPrice: number;
}

export interface PrintDocProps {
  titleEn: string; // "Purchase Order"
  titleAr: string; // "أمر شراء"
  docNo: string;
  date: string;
  partyLabelEn: string; // "Supplier" / "To"
  partyLabelAr: string;
  partyName: string;
  partyNameAr?: string | null;
  currency: string;
  lines: PrintLine[];
  metaRows?: { labelEn: string; labelAr: string; value: string }[];
  termsTitleEn?: string;
  termsTitleAr?: string;
  terms?: string | null;
  onClose: () => void;
}

/**
 * Print-optimized bilingual document on company letterhead (spec §6.3 —
 * print-view approach, reliable Arabic shaping via the browser itself).
 * Rendered in a portal on <body>; @media print CSS in index.css hides the app
 * (body.print-mode) so only this document prints.
 */
export default function PrintDoc(p: PrintDocProps) {
  useEffect(() => {
    document.body.classList.add('print-mode');
    return () => document.body.classList.remove('print-mode');
  }, []);

  const total = p.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  return createPortal(
    <div className="print-overlay fixed inset-0 z-50 bg-gray-200 overflow-y-auto" dir="ltr">
      {/* toolbar — screen only */}
      <div className="print:hidden sticky top-0 bg-brand-black text-white px-4 py-2.5 flex items-center justify-between z-10">
        <span className="text-sm font-medium">{p.docNo}</span>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="bg-brand-red text-white text-sm font-semibold rounded px-4 py-1.5 hover:bg-red-700"
          >
            Print / PDF · طباعة
          </button>
          <button onClick={p.onClose} className="text-sm border border-gray-500 rounded px-4 py-1.5 hover:bg-gray-800">
            Close · إغلاق
          </button>
        </div>
      </div>

      {/* page */}
      <div className="print-page bg-white max-w-[210mm] mx-auto my-6 print:my-0 shadow print:shadow-none p-10 text-[13px] leading-relaxed text-gray-900">
        {/* letterhead */}
        <div className="flex items-start justify-between border-b-4 border-brand-red pb-4">
          <div>
            <div className="text-4xl font-extrabold tracking-tight text-brand-black">
              MD<span className="text-brand-red">.</span>
            </div>
            <div className="text-sm font-semibold mt-1">M.D. for Medical Supplies</div>
            <div className="text-sm" dir="rtl">إم. دي. للمستلزمات الطبية</div>
          </div>
          <div className="text-end">
            <div className="text-xl font-bold text-brand-black">{p.titleEn}</div>
            <div className="text-lg font-bold" dir="rtl">{p.titleAr}</div>
            <div className="mt-1 font-mono font-semibold">{p.docNo}</div>
          </div>
        </div>

        {/* meta */}
        <table className="mt-5 text-[13px]">
          <tbody>
            <tr>
              <td className="pe-3 py-0.5 text-gray-500">Date · التاريخ</td>
              <td className="font-medium">{fmtDate(p.date)}</td>
            </tr>
            <tr>
              <td className="pe-3 py-0.5 text-gray-500">{p.partyLabelEn} · {p.partyLabelAr}</td>
              <td className="font-medium">
                {p.partyName}
                {p.partyNameAr ? <span dir="rtl"> · {p.partyNameAr}</span> : null}
              </td>
            </tr>
            <tr>
              <td className="pe-3 py-0.5 text-gray-500">Currency · العملة</td>
              <td className="font-medium">{p.currency}</td>
            </tr>
            {p.metaRows?.map((m) => (
              <tr key={m.labelEn}>
                <td className="pe-3 py-0.5 text-gray-500">{m.labelEn} · {m.labelAr}</td>
                <td className="font-medium">{m.value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* lines */}
        <table className="w-full mt-6 border-collapse">
          <thead>
            <tr className="bg-brand-black text-white text-[12px]">
              <th className="px-2 py-2 text-start font-semibold w-8">#</th>
              <th className="px-2 py-2 text-start font-semibold">Item · الصنف</th>
              <th className="px-2 py-2 text-start font-semibold w-28">Ref · المرجع</th>
              <th className="px-2 py-2 text-end font-semibold w-16">Qty · الكمية</th>
              <th className="px-2 py-2 text-end font-semibold w-28">Unit price · سعر الوحدة</th>
              <th className="px-2 py-2 text-end font-semibold w-28">Total · الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={l.key} className="border-b border-gray-200">
                <td className="px-2 py-2 text-gray-500">{i + 1}</td>
                <td className="px-2 py-2">
                  {l.name}
                  {l.nameAr ? <div className="text-gray-600" dir="rtl">{l.nameAr}</div> : null}
                </td>
                <td className="px-2 py-2 font-mono text-[12px]">{l.sku}</td>
                <td className="px-2 py-2 text-end">{fmtQty(l.qty)}</td>
                <td className="px-2 py-2 text-end">{fmtMoney(l.unitPrice, p.currency)}</td>
                <td className="px-2 py-2 text-end font-medium">{fmtMoney(l.qty * l.unitPrice, p.currency)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="px-2 py-2.5 text-end font-bold">Total · الإجمالي</td>
              <td className="px-2 py-2.5 text-end font-bold text-brand-red whitespace-nowrap">
                {fmtMoney(total, p.currency)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* terms / notes */}
        {p.terms && (
          <div className="mt-6">
            <div className="font-semibold text-[12px] text-gray-600 mb-1">
              {p.termsTitleEn ?? 'Terms'} · {p.termsTitleAr ?? 'الشروط'}
            </div>
            <p className="whitespace-pre-wrap border rounded p-3 bg-gray-50 print:bg-white">{p.terms}</p>
          </div>
        )}

        {/* signatures */}
        <div className="flex justify-between mt-14 pt-2">
          <div className="text-center">
            <div className="border-t border-gray-400 w-48 mb-1" />
            <div className="text-[12px] text-gray-600">Authorized signature · التوقيع المعتمد</div>
          </div>
          <div className="text-center">
            <div className="border-t border-gray-400 w-48 mb-1" />
            <div className="text-[12px] text-gray-600">Received by · المستلم</div>
          </div>
        </div>

        <div className="mt-10 pt-3 border-t-2 border-brand-black text-center text-[11px] text-gray-500">
          M.D. for Medical Supplies — إم. دي. للمستلزمات الطبية
        </div>
      </div>
    </div>,
    document.body,
  );
}
