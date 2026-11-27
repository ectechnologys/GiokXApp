// Special Discount — a per-customer favour. Settings → Bookings switches it
// on; the figure is set per customer (has_special_discount + the three
// special_discount_* columns on the customer record).
//
// It is ONLY a deduction. It does not change how anything is priced: member
// prices, member-special add-ons (including ones that are free), and peak-day
// rules all behave exactly as they would without it. The discount is taken off
// the resulting total — so a member who is also marked keeps their member
// pricing AND gets the discount.
//
// The AMOUNT is frozen onto the booking when it is created
// (appointments.special_discount_amount). Editing the setting, or un-marking a
// customer, must never rewrite the price of a booking that has already
// happened — the same principle as `member_at_booking`.

export type SpecialDiscountAppliesTo = 'total' | 'services' | 'addons'

export interface SpecialDiscountConfig {
  enabled: boolean
  type: 'amount' | 'percentage'
  value: number
  /** What the discount comes off: the whole booking (default), the service
   *  price only, or the add-ons only. A flat amount is still capped at the
   *  part it applies to, so "RM50 off add-ons" on RM20 of add-ons takes RM20. */
  appliesTo: SpecialDiscountAppliesTo
}

export function readSpecialDiscountAppliesTo(v: unknown): SpecialDiscountAppliesTo {
  return v === 'services' || v === 'addons' ? v : 'total'
}

/** Read the config out of a settings map / row, with the app-wide defaults. */
export function readSpecialDiscount(s: Record<string, any> | null | undefined): SpecialDiscountConfig {
  return {
    enabled: s?.special_discount_enabled === true,
    type: s?.special_discount_type === 'percentage' ? 'percentage' : 'amount',
    value: Math.max(0, Number(s?.special_discount_value ?? 0) || 0),
    appliesTo: readSpecialDiscountAppliesTo(s?.special_discount_applies_to),
  }
}

/** The override columns on a customer row. NULL / undefined = tenant default. */
export interface CustomerSpecialDiscountOverride {
  special_discount_value?: number | string | null
  special_discount_type?: string | null
  special_discount_applies_to?: string | null
}

/**
 * The config that applies to ONE customer. Settings → Bookings is ONLY the
 * on/off switch; the figure, its type and what it comes off live on the
 * customer row (Customers → Special Discount). A marked customer with no
 * figure set gets nothing. The tenant-level value/type/applies_to keys may
 * still exist in app_settings from before and are deliberately ignored.
 */
export function specialDiscountFor(
  cfg: SpecialDiscountConfig,
  customer: CustomerSpecialDiscountOverride | null | undefined,
): SpecialDiscountConfig {
  const v = customer?.special_discount_value
  const hasValue = v != null && v !== '' && Number.isFinite(Number(v))
  const t = customer?.special_discount_type
  const a = customer?.special_discount_applies_to
  return {
    enabled: cfg.enabled,
    value: hasValue ? Math.max(0, Number(v)) : 0,
    type: t === 'amount' ? 'amount' : 'percentage',
    appliesTo: a === 'services' || a === 'addons' ? a : 'total',
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * The discount for one booking, in currency. 0 when it doesn't apply.
 *
 * `servicePrice` and `addonsTotal` must be the EFFECTIVE prices actually being
 * charged — member prices included — because the discount comes off what the
 * customer would otherwise pay, not off list price. Which of them count is the
 * tenant's `appliesTo` choice: the whole booking, services only, or add-ons only.
 *
 * Never exceeds the base it applies to, so a flat amount larger than the
 * booking can't produce a negative total.
 */
export function computeSpecialDiscount(
  cfg: SpecialDiscountConfig,
  hasMark: boolean,
  amounts: { servicePrice: number; addonsTotal?: number },
): number {
  if (!cfg.enabled || !hasMark || cfg.value <= 0) return 0
  const service = Math.max(0, Number(amounts.servicePrice) || 0)
  const addons = Math.max(0, Number(amounts.addonsTotal ?? 0) || 0)
  // The base is whatever the tenant chose to discount. A percentage and a flat
  // amount both come off that base, and never more than it.
  const base = cfg.appliesTo === 'services' ? service
    : cfg.appliesTo === 'addons' ? addons
    : service + addons
  if (base <= 0) return 0
  const raw = cfg.type === 'percentage'
    ? base * Math.min(100, cfg.value) / 100
    : cfg.value
  return round2(Math.min(base, Math.max(0, raw)))
}

/** Label for the discount line on a quote, card or invoice. */
export function specialDiscountLabel(cfg: SpecialDiscountConfig): string {
  const head = cfg.type === 'percentage' && cfg.value > 0
    ? `Discount (${cfg.value}%)`
    : 'Discount'
  return cfg.appliesTo === 'services' ? `${head} on services`
    : cfg.appliesTo === 'addons' ? `${head} on add-ons`
    : head
}
