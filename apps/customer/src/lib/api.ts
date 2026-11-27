// Calls the same Supabase Edge Functions as the web customer portal.
// The web app sends `host: window.location.host`; the app sends its tenant's
// web address instead, so the backend resolves the same company.
import { FN_BASE, SUPABASE_ANON_KEY } from '@/config/backend';
import { tenant } from '@/config/tenant';

export class ApiError extends Error {
  constructor(message: string, public code: string, public status = 0) {
    super(message);
  }
}

export async function callFunction<T>(
  fn: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const res = await fetch(`${FN_BASE}/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ host: tenant.host, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, data?.code || 'unknown', res.status);
  }
  return data as T;
}

const auth = <T>(body: Record<string, unknown>, token?: string) =>
  callFunction<T>('customer-auth', body, token);

export interface CustomerProfile {
  id: string;
  name: string;
  phone_e164: string;
}

export type EmailRequirement = 'optional' | 'warn' | 'required';

export const customerSiteConfig = () =>
  auth<{ ok: true; race_enabled: boolean; email_requirement?: EmailRequirement }>({
    action: 'site-config',
  });

/** Same list the server validates against (web: src/lib/race.ts). */
export const RACE_OPTIONS = ['Malay', 'Chinese', 'Indian', 'Eurasian', 'Others'] as const;

export interface ProfilePatch {
  name: string;
  race?: string;
  email?: string;
  unit_number?: string;
  address?: string;
  postcode?: string;
  city?: string;
  lobby_note?: string;
  lat?: number | null;
  lng?: number | null;
}

/** With a registration ticket (from verify-otp `isNew`) this CREATES the
 *  customer and returns a full session `token`. The server refuses a pinned
 *  address outside the service area when the tenant enforces coverage. */
export const updateProfile = (token: string, patch: ProfilePatch) =>
  auth<{ ok: true; customer: CustomerProfile; token?: string }>({ action: 'update-profile', ...patch }, token);

/** Sends a sign-in code. WhatsApp first; `forceSms` is the fallback for a
 *  code that never arrived. `devCode` is only returned by a test backend. */
export const requestOtp = (phone: string, forceSms = false) =>
  auth<{ ok: true; phone: string; devCode?: string; channel?: 'whatsapp' | 'sms' }>({
    action: 'request-otp',
    phone,
    force_sms: forceSms,
  });

/** `isNew` means no customer exists on this number yet: the token is then
 *  only a registration ticket, not a session. */
export const verifyOtp = (phone: string, code: string) =>
  auth<{ ok: true; token: string; customer: CustomerProfile; isNew?: boolean }>({
    action: 'verify-otp',
    phone,
    code,
  });

export const getProfile = (token: string) =>
  auth<{
    ok: true;
    customer: {
      id: string;
      name: string;
      email: string | null;
      phone_e164: string | null;
      is_member: boolean;
      member_start: string | null;
      member_expires: string | null;
      is_restricted: boolean;
      restricted_release?: string | null;
      has_special_discount?: boolean;
      special_discount_value?: number | string | null;
      special_discount_type?: string | null;
      special_discount_applies_to?: string | null;
      suspended?: boolean;
    };
    addresses: SavedAddress[];
  }>({ action: 'get-profile' }, token);

export interface SavedAddress {
  id: string;
  unit_number: string;
  address: string;
  city: string;
  postcode: string;
  lat: number | null;
  lng: number | null;
  lobby_note: string;
}

// ── Bookings ────────────────────────────────────────────────────────────────

export interface BookingAssignee {
  /** 'Team' | 'Driver · Send' | 'Driver · Pickup' | 'Driver'. */
  role: string;
  name: string;
  nickname: string;
  id: string;
  vehicle: string;
}

/** One booking from customer-auth `get-bookings` (newest first). */
export interface CustomerBooking {
  id: string;
  service_name: string;
  booking_date: string;
  start_time: string;
  end_time: string | null;
  status: string;
  payment_status: string;
  total_amount: number;
  redeemed_amount: number;
  outstanding_amount: number;
  unit_number: string;
  address: string;
  postcode: string;
  city: string;
  addons: string[];
  attachment_urls: string[];
  chat_open: boolean;
  chat_active: boolean;
  team_arrived_at?: string | null;
  team_started_at?: string | null;
  team_completed_at?: string | null;
  assignees?: BookingAssignee[];
}

export const getBookings = (token: string) =>
  auth<{ ok: true; bookings: CustomerBooking[] }>({ action: 'get-bookings' }, token);

export type CancelResult =
  | { ok: true; status: string; gross_refund?: number; cancellation_fee?: number; refunded_points?: number; points_balance?: number }
  | { ok: false; code: 'cancel_fee_reload_required'; cancellation_fee: number; points_balance: number; shortfall: number };

/** customer-cancel-booking. A 402 `cancel_fee_reload_required` is an expected
 *  outcome (fee due but not enough account credit), not an error. */
export async function cancelBooking(token: string, bookingId: string): Promise<CancelResult> {
  const res = await fetch(`${FN_BASE}/customer-cancel-booking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ host: tenant.host, booking_id: bookingId }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 402 && data?.code === 'cancel_fee_reload_required') {
    return {
      ok: false,
      code: 'cancel_fee_reload_required',
      cancellation_fee: Number(data.cancellation_fee ?? 0),
      points_balance: Number(data.points_balance ?? 0),
      shortfall: Number(data.shortfall ?? 0),
    };
  }
  if (!res.ok || data?.error) throw new ApiError(data?.error || `Request failed (${res.status})`, data?.code || 'unknown', res.status);
  return data as CancelResult;
}
