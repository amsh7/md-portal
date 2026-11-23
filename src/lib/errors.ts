/** Postgres foreign-key violation (23503): the record is still referenced
 *  by history (movements, invoices, documents) and must not be deleted. */
export function isFkViolation(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: string }).code === '23503';
}
