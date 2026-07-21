/** DD/MM/YYYY — Western numerals in both languages (spec §9). */
export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const egp = new Intl.NumberFormat('en-EG', {
  style: 'currency',
  currency: 'EGP',
  maximumFractionDigits: 2,
});

export function fmtEGP(value: number | null | undefined): string {
  if (value == null) return '—';
  return egp.format(value);
}

export function fmtMoney(value: number | null | undefined, currency: string): string {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('en-EG', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('en-EG')}`;
  }
}

export function fmtQty(value: number): string {
  return value.toLocaleString('en-EG');
}
