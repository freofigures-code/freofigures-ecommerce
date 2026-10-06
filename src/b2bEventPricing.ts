export type B2BEventPriceBreak = { min_qty: number; unit_price: number };
export type B2BEventPricing = {
  product_id: number;
  pricing_mode: 'step' | 'tiers';
  minimum_quantity: number;
  base_unit_price: number;
  discount_per_extra_unit: number;
  floor_unit_price: number;
  tiers: B2BEventPriceBreak[];
};

const cents = (value: number) => Math.round(Number(value) * 100);

export function b2bEventUnitPrice(config: B2BEventPricing | null | undefined, quantity: number): number | null {
  if (!config || !Number.isSafeInteger(quantity) || quantity < config.minimum_quantity || quantity > 1000000) return null;
  if (config.pricing_mode === 'step') {
    const base = cents(config.base_unit_price);
    const discount = cents(config.discount_per_extra_unit);
    const floor = cents(config.floor_unit_price);
    if (!Number.isSafeInteger(base) || !Number.isSafeInteger(discount) || !Number.isSafeInteger(floor)
      || base < 1 || discount < 0 || floor < 1 || floor > base) return null;
    return Math.max(floor, base - discount * (quantity - config.minimum_quantity)) / 100;
  }
  if (config.pricing_mode !== 'tiers' || !Array.isArray(config.tiers)) return null;
  const selected = config.tiers.filter(tier => Number.isSafeInteger(tier.min_qty)
    && tier.min_qty <= quantity && Number(tier.unit_price) > 0)
    .sort((a, b) => b.min_qty - a.min_qty)[0];
  return selected ? cents(selected.unit_price) / 100 : null;
}
