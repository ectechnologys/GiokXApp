// Peak / special-day pricing resolver (client copy).
//
// A peak rule adds a surcharge ON TOP of the already-resolved price (base →
// time-slot → member). This runs for DISPLAY in the admin dialogs and the
// customer booking flow; an identical copy lives in
// supabase/functions/_shared/peak-pricing.ts for the authoritative server
// charge. Keep the two in sync.
//
// Rules:
//   - a rule matches when bookingDate ∈ [start_date, end_date] AND the service
//     is in service_ids (or service_ids is null/empty = all services)
//   - members_exempt rules are skipped for members (they pay their member price)
//   - percent ⇒ +basePrice * value/100 ; amount ⇒ +value (flat)
//   - when several rules match, the LARGEST surcharge wins (no stacking)

export type MemberMode = 'same' | 'exempt' | 'custom' | 'standard'

export type PeakRule = {
  name: string
  start_date: string
  end_date: string
  adjust_type: 'percent' | 'amount'
  adjust_value: number
  /** How members are priced on the peak date. 'standard' = no member discount
   *  (priced as a non-member) — handled by peakServiceMember() at the caller. */
  member_mode?: MemberMode
  /** Custom member surcharge (unit = adjust_type), used when member_mode='custom'. */
  member_adjust_value?: number | null
  /** Round the price AFTER the surcharge UP to a whole number (RM81.90 → RM82). */
  round_up?: boolean
  service_ids: string[] | null
  members_exempt: boolean
  is_active?: boolean
}

// Resolve a rule's member mode, tolerating older rows that only have the
// members_exempt / member_adjust_value flags.
function modeOf(r: PeakRule): MemberMode {
  if (r.member_mode) return r.member_mode
  if (r.members_exempt) return 'exempt'
  if (r.member_adjust_value != null) return 'custom'
  return 'same'
}

function ruleMatches(r: PeakRule, d: string, serviceId: string | undefined): boolean {
  if (r.is_active === false) return false
  if (d < r.start_date.slice(0, 10) || d > r.end_date.slice(0, 10)) return false
  if (r.service_ids && r.service_ids.length > 0 && (!serviceId || !r.service_ids.includes(serviceId))) return false
  return true
}

/** Effective member flag for SERVICE pricing: a member becomes a NON-member when
 *  a matching rule uses member_mode='standard' (they lose the member discount on
 *  the peak date). Call this, then pass the result to resolveSlotPrice AND the
 *  peak functions so base price and surcharge agree. Add-on pricing is untouched. */
export function peakServiceMember(
  bookingDate: string | undefined,
  serviceId: string | undefined,
  isMember: boolean,
  rules: PeakRule[] | undefined | null,
): boolean {
  if (!isMember || !bookingDate || !rules || rules.length === 0) return isMember
  const d = bookingDate.slice(0, 10)
  for (const r of rules) {
    if (ruleMatches(r, d, serviceId) && modeOf(r) === 'standard') return false
  }
  return isMember
}

export type PeakMatch = { add: number; rule: PeakRule | null }

const round2 = (n: number) => Math.round(n * 100) / 100

/** Surcharge amount (and the winning rule) for a booking. `add` is 0 when no
 *  rule applies. `basePrice` is the member-aware, slot-resolved price. */
export function resolvePeak(
  basePrice: number,
  bookingDate: string | undefined,
  serviceId: string | undefined,
  isMember: boolean,
  rules: PeakRule[] | undefined | null,
): PeakMatch {
  if (!bookingDate || !rules || rules.length === 0) return { add: 0, rule: null }
  const d = bookingDate.slice(0, 10)
  let best = 0
  let bestRule: PeakRule | null = null
  // First rule matching the date+service regardless of surcharge — lets the
  // "Peak day · <name>" note show even for members who pay no surcharge
  // (exempt / standard modes).
  let matchedRule: PeakRule | null = null
  for (const r of rules) {
    if (!ruleMatches(r, d, serviceId)) continue
    if (!matchedRule) matchedRule = r
    // Member surcharge by mode. 'standard' members are flipped to non-member by
    // peakServiceMember() at the caller, so here they arrive as isMember=false
    // and take the standard adjust_value.
    let val = Number(r.adjust_value) || 0
    if (isMember) {
      const mode = modeOf(r)
      // 'exempt' and 'standard' add NO surcharge for members. ('standard' also
      // drops the member discount at the base — handled by peakServiceMember.)
      if (mode === 'exempt' || mode === 'standard') continue
      if (mode === 'custom' && r.member_adjust_value != null) val = Number(r.member_adjust_value)
    }
    let add = r.adjust_type === 'percent' ? basePrice * val / 100 : val
    // Round the final price (base + surcharge) UP to a whole number when asked.
    if (r.round_up && add > 0) add = Math.ceil(basePrice + add) - basePrice
    if (add > best) { best = add; bestRule = r }
  }
  return { add: round2(best), rule: bestRule ?? matchedRule }
}

/** Final price with the peak surcharge applied. */
export function applyPeak(
  basePrice: number,
  bookingDate: string | undefined,
  serviceId: string | undefined,
  isMember: boolean,
  rules: PeakRule[] | undefined | null,
): number {
  return round2(basePrice + resolvePeak(basePrice, bookingDate, serviceId, isMember, rules).add)
}

/** Short human label for the applied rule, e.g. "CNY eve (+20%)" or
 *  "Christmas (+RM15)". Returns '' when no rule applies. `cur` is the currency
 *  prefix (e.g. "RM"). */
export function peakLabel(match: PeakMatch, cur = 'RM', isMember = false): string {
  if (!match.rule || match.add <= 0) return ''
  const r = match.rule
  const val = (isMember && r.member_adjust_value != null) ? Number(r.member_adjust_value) : Number(r.adjust_value)
  const suffix = r.adjust_type === 'percent' ? `+${val}%` : `+${cur}${val.toFixed(2)}`
  return `${r.name} (${suffix})`
}
