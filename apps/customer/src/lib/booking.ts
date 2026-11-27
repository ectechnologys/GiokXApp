// Booking flow data + pricing helpers. Mirrors the web BookingFlowPage
// (src/pages/BookingFlowPage.tsx) — the server re-computes every price, so
// these figures are for display and must match what payments-start charges.
import { FN_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/backend';
import { tenant } from '@/config/tenant';
import { ApiError, callFunction } from '@/lib/api';
import type { PeakRule } from '@/shared/peakPricing';
import type { SpecialDiscountConfig } from '@/shared/specialDiscount';
import type { TaxMode } from '@/shared/tax';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SlotRow {
  available_time: string | null;
  price: number | null;
  member_price?: number | null;
  duration_minutes?: number | null;
}

export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  pax: number | null;
  service_time_slots?: SlotRow[];
}

export interface AddonRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_member_special?: boolean;
  member_price?: number;
}

export interface BookingConfig {
  memberWindowDays: number;
  guestWindowDays: number;
  restrictedWindowDays: number;
  requireSignin: boolean;
  bookingsPaused: boolean;
  bookingFrom: string | null;
  allowHolidayBooking: boolean;
  paymentEnabled: boolean;
  pointsRedemptionEnabled: boolean;
  pointsRedeemWhole: boolean;
  pointsName: string;
  memberSpecialAddonMode: 'single' | 'all';
  taxRate: number;
  taxMode: TaxMode;
  taxName: string;
  taxRoundUp: boolean;
  specialDiscount: SpecialDiscountConfig;
}

export interface ServerSlot {
  pax: number;
  duration_hrs: number;
  start_hour: number;
  status: 'available' | 'full' | 'hidden';
  reason: string;
  eligible_maids?: { id: string; name: string }[];
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

export const getBookingConfig = () => callFunction<BookingConfig & { ok: true }>('public-booking-config', {});

export const getServices = () =>
  rest<ServiceRow[]>(
    `services?select=*,service_time_slots(available_time,price,member_price,duration_minutes)` +
      `&tenant_id=eq.${tenant.tenantId}&is_active=eq.true&visible=eq.true&order=name`,
  );

export const getPeakRules = () =>
  rest<PeakRule[]>(
    `peak_pricing_rules?select=name,start_date,end_date,adjust_type,adjust_value,member_adjust_value,member_mode,round_up,service_ids,members_exempt,is_active` +
      `&tenant_id=eq.${tenant.tenantId}&is_active=eq.true`,
  );

export async function getAddons(serviceId: string): Promise<AddonRow[]> {
  const rows = await rest<{ addon: (AddonRow & { is_visible?: boolean }) | null }[]>(
    `addon_service_assignments?select=service_id,addon:service_addons(*)&service_id=eq.${serviceId}`,
  );
  return rows
    .map(r => r.addon)
    .filter((a): a is AddonRow & { is_visible?: boolean } => !!a && a.is_visible !== false)
    .map(a => ({ ...a, price: Number(a.price ?? 0), member_price: Number(a.member_price ?? 0), is_member_special: a.is_member_special === true }));
}

export const getHolidays = (from: string, to: string) =>
  rest<{ holiday_date: string; name: string }[]>(
    `public_holidays?select=holiday_date,name&tenant_id=eq.${tenant.tenantId}&is_enabled=eq.true` +
      `&holiday_date=gte.${from}&holiday_date=lte.${to}`,
  );

/** Slot availability for one date. With the customer token the server also
 *  decides which cleaners may be picked. */
export const getSlots = (date: string, token?: string) =>
  callFunction<{ ok: true; slots: ServerSlot[] }>('get-available-slots', { date }, token);

export interface CoinTxn {
  id: string;
  amount: number;
  type: 'earned' | 'deducted' | 'adjusted' | 'redeemed';
  description: string | null;
  reason: string | null;
  created_at: string;
}

/** Points balance + last 3 months of transactions. */
export const getCoins = (token: string) =>
  callFunction<{ ok: true; enabled: boolean; balance: number; points_name: string; expires: string | null; transactions: CoinTxn[] }>(
    'customer-auth', { action: 'get-coins' }, token,
  );

// ── Durations and slot keys (web: slotMinutes / serviceSlotKeys) ────────────

const hourOf = (t: string | null | undefined) => parseInt(String(t ?? '').slice(0, 2), 10);

export function slotMinutes(svc: ServiceRow, time?: string | null): number {
  const rows = svc.service_time_slots ?? [];
  if (time) {
    const row = rows.find(r => hourOf(r.available_time) === hourOf(time));
    if (row && Number(row.duration_minutes) > 0) return Number(row.duration_minutes);
  }
  const ds = rows.map(r => Number(r.duration_minutes ?? 0)).filter(d => d > 0);
  return ds.length ? Math.min(...ds) : Number(svc.duration_minutes ?? 0);
}

export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} hr ${m} min` : h ? `${h} hr${h > 1 ? 's' : ''}` : `${m} min`;
};

export function durationLabel(svc: ServiceRow, time?: string | null): string {
  if (time) return fmtDuration(slotMinutes(svc, time));
  const ds = (svc.service_time_slots ?? []).map(r => Number(r.duration_minutes ?? 0)).filter(d => d > 0);
  if (!ds.length) return fmtDuration(Number(svc.duration_minutes ?? 0));
  const lo = Math.min(...ds), hi = Math.max(...ds);
  return lo === hi ? fmtDuration(lo) : `${fmtDuration(lo)} – ${fmtDuration(hi)}`;
}

export const slotKey = (x: { pax: number; duration_hrs: number; start_hour: number }) => `${x.pax}|${x.duration_hrs}|${x.start_hour}`;

export function serviceSlotKeys(svc: ServiceRow): Set<string> {
  const pax = svc.pax === 2 ? 2 : 1;
  const keys = new Set<string>();
  for (const r of svc.service_time_slots ?? []) {
    const h = hourOf(r.available_time);
    if (!Number.isFinite(h)) continue;
    keys.add(slotKey({ pax, duration_hrs: Math.round(slotMinutes(svc, r.available_time) / 60), start_hour: h }));
  }
  return keys;
}

/** Bookable start times for a service (fallback 08:00–20:00, like the web). */
export function serviceTimes(svc: ServiceRow): string[] {
  const xs = (svc.service_time_slots ?? []).map(s => s.available_time).filter(Boolean) as string[];
  const uniq = Array.from(new Set(xs)).sort();
  if (uniq.length) return uniq;
  const out: string[] = [];
  for (let h = 8; h <= 20; h++) out.push(`${String(h).padStart(2, '0')}:00:00`);
  return out;
}

// ── Membership on a date ─────────────────────────────────────────────────────

export interface PricingCustomer {
  is_member?: boolean;
  member_start?: string | null;
  member_expires?: string | null;
  is_restricted?: boolean;
  restricted_release?: string | null;
  has_special_discount?: boolean;
  special_discount_value?: number | string | null;
  special_discount_type?: string | null;
  special_discount_applies_to?: string | null;
}

export function memberOn(cust: PricingCustomer | undefined, day: string): boolean {
  if (!cust?.is_member) return false;
  const s = cust.member_start?.slice(0, 10), e = cust.member_expires?.slice(0, 10);
  return !!s && !!e && day >= s && day <= e;
}

/** How many days ahead the calendar opens (web: effectiveWindowDays). 0 = no limit. */
export function windowDays(cfg: BookingConfig, cust: PricingCustomer | undefined, today: string): number {
  if (cust?.is_restricted) {
    const rel = cust.restricted_release?.slice(0, 10);
    if ((!rel || today <= rel) && cfg.restrictedWindowDays > 0) return cfg.restrictedWindowDays;
  }
  if (!memberOn(cust, today)) return cfg.guestWindowDays;
  const expires = (cust?.member_expires ?? '').slice(0, 10);
  if (!expires || cfg.guestWindowDays <= 0) return cfg.guestWindowDays;
  const days = Math.max(0, Math.round((Date.parse(`${expires}T00:00:00`) - Date.parse(`${today}T00:00:00`)) / 86_400_000));
  const memberHorizon = cfg.memberWindowDays <= 0 ? days : Math.min(cfg.memberWindowDays, days);
  return Math.max(memberHorizon, cfg.guestWindowDays);
}

// ── Add-on pricing (web: priceMemberAddonSet) ────────────────────────────────

/** Effective price per selected add-on. `selected` must be in PICK order: in
 *  'single' mode only the first member-special add-on gets member_price. */
export function priceAddons(selected: AddonRow[], isMember: boolean, mode: 'single' | 'all'): Map<string, number> {
  const eff = new Map<string, number>();
  const plain = (a: AddonRow) => (a.is_member_special && isMember ? Number(a.member_price ?? 0) : Number(a.price ?? 0));
  if (!isMember || mode !== 'single') {
    for (const a of selected) eff.set(a.id, plain(a));
    return eff;
  }
  const winner = selected.find(a => a.is_member_special)?.id;
  for (const a of selected) eff.set(a.id, a.is_member_special && a.id === winner ? Number(a.member_price ?? 0) : Number(a.price ?? 0));
  return eff;
}

// ── Points redemption (web: redeemCap / redeemClamp) ─────────────────────────

const HITPAY_MIN = 0.3;
function minChargeRedeem(r: number, total: number): number {
  const left = (x: number) => Math.round((total - x) * 100) / 100;
  if (r <= 0 || left(r) <= 0 || left(r) >= HITPAY_MIN) return r;
  let x = Math.floor(r);
  while (x > 0 && left(x) > 0 && left(x) < HITPAY_MIN) x -= 1;
  return Math.max(0, x);
}
export function redeemCap(balance: number, total: number, whole: boolean): number {
  const cap = Math.round(Math.min(Math.max(0, balance), total) * 100) / 100;
  return minChargeRedeem(whole && balance < total ? Math.floor(cap) : cap, total);
}

// ── Create / pay ─────────────────────────────────────────────────────────────

export interface CreateBookingPayload {
  service_id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes?: number;
  selected_addon_ids?: string[];
  notes?: string;
  house_unit?: string;
  address?: string;
  city?: string;
  postcode?: string;
  address_lat?: number | null;
  address_lng?: number | null;
  lobby_note?: string;
  requested_maid_id?: string | null;
}

export interface BookingSuccess {
  booking_id?: string;
  service_name?: string;
  appointment_date?: string;
  appointment_time?: string;
  addons?: { id: string; name: string; price: number }[];
}

async function post<T>(fn: string, token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${FN_BASE}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ host: tenant.host, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new ApiError(data?.error ?? `Request failed (${res.status})`, data?.code ?? 'unknown', res.status);
  return data as T;
}

/** No-payment tenants: the booking is created straight away. */
export const createBooking = (token: string, p: CreateBookingPayload) =>
  post<BookingSuccess & { ok: true; booking_ref: string }>('customer-create-booking', token, { ...p });

/** Payment tenants: HitPay checkout URL, or paid_in_full when points cover it.
 *  HitPay returns the browser to the tenant's web site, whose success page
 *  shows the result; the app polls payments-status for its own screen. */
export const startPayment = (token: string, p: CreateBookingPayload & { redeem_points?: boolean; redeem_points_amount?: number }) =>
  post<BookingSuccess & { ok: true; checkout_url?: string; hold_token?: string; paid_in_full?: boolean; redeemed_amount?: number }>(
    'payments-start', token, { return_origin: `https://${tenant.host}`, ...p },
  );

export interface PaymentStatus extends BookingSuccess {
  status: 'pending' | 'confirmed' | 'released' | 'expired';
}

export async function paymentStatus(token: string, holdToken: string, abandon = false): Promise<PaymentStatus> {
  const res = await fetch(`${FN_BASE}/payments-status?ref=${encodeURIComponent(holdToken)}${abandon ? '&abandon=1' : ''}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new ApiError(data?.error ?? `Request failed (${res.status})`, data?.code ?? 'unknown', res.status);
  return data as PaymentStatus;
}
