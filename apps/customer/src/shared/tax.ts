// Tax computation (client copy). Mirrors supabase/functions/_shared/tax.ts —
// keep the two in sync.
//
// mode 'exclusive' (added on top): the price is pre-tax. tax = subtotal * rate%,
//   total = subtotal + tax.
// mode 'inclusive' (already included): the price already contains the tax.
//   tax = the portion within = subtotal * rate / (100 + rate), total = subtotal.

export type TaxMode = 'exclusive' | 'inclusive'

const round2 = (n: number) => Math.round(n * 100) / 100

// Round a value UP to the next 10 cents (0.10): 179.14 → 179.20, 179.18 → 179.20,
// 179.20 → 179.20. Integer math on cents avoids float drift.
const ceil10 = (n: number) => Math.ceil(Math.round(n * 100) / 10) / 10

// `roundUp` (Settings → Tax Rate → "Round up total after tax"): round the
// tax-inclusive TOTAL up to the next 10 cents. `tax` stays the TRUE tax (rate %
// of the price); `rounding` is the separate top-up added to reach the rounded
// total (0 when off / already on a boundary), so the summary can show it as its
// own line instead of inflating the tax. total = subtotal + tax + rounding.
export function computeTax(subtotal: number, rate: number, mode: TaxMode, roundUp = false): { tax: number; total: number; rounding: number } {
  const r = Number(rate) || 0
  const sub = Number(subtotal) || 0
  if (r <= 0 || sub <= 0) return { tax: 0, total: round2(sub), rounding: 0 }
  if (mode === 'inclusive') {
    // Round-up applies to EXCLUSIVE only — an inclusive price is fixed, so the
    // total is never rounded here.
    const total = round2(sub)
    return { tax: round2(total - total / (1 + r / 100)), total, rounding: 0 }
  }
  const tax = round2(sub * r / 100)
  const rawTotal = round2(sub + tax)
  const total = roundUp ? ceil10(rawTotal) : rawTotal
  return { tax, total, rounding: round2(total - rawTotal) }
}
