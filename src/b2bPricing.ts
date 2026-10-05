export type B2BTier = { min_qty: number; max_qty: number | null; unit_price: number; is_active: boolean };

export function minimumB2BQuantity(tiers: B2BTier[]): number | null {
  const values = tiers.filter(t => t.is_active && Number.isInteger(t.min_qty) && t.min_qty > 0 && Number(t.unit_price) > 0).map(t => t.min_qty);
  return values.length ? Math.min(...values) : null;
}

export function b2bUnitPrice(tiers: B2BTier[], quantity: number): number | null {
  if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
  const eligible = tiers.filter(t => t.is_active && quantity >= t.min_qty && (t.max_qty === null || quantity <= t.max_qty) && Number(t.unit_price) > 0);
  if (!eligible.length) return null;
  eligible.sort((a, b) => b.min_qty - a.min_qty);
  return Number(eligible[0].unit_price);
}
