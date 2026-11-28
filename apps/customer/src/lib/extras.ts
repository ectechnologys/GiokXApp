// Booking extras: pay a balance, add add-ons, photos, chat, van ETA, reviews,
// invoice. Same edge functions and payloads as the web /account page
// (src/lib/customerApi.ts).
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';

import { FN_BASE, SUPABASE_ANON_KEY } from '@/config/backend';
import { tenant } from '@/config/tenant';
import { ApiError, callFunction } from '@/lib/api';
import { paymentStatus, type PaymentStatus } from '@/lib/booking';
import { paymentReturnOrigin } from '@/lib/payReturn';

async function postJson<T>(fn: string, token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${FN_BASE}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ host: tenant.host, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new ApiError(data?.error || `Request failed (${res.status})`, data?.code || 'unknown', res.status);
  return data as T;
}

async function postForm<T>(fn: string, token: string, form: FormData): Promise<T> {
  form.append('host', tenant.host);
  const res = await fetch(`${FN_BASE}/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, // multipart boundary set by fetch
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new ApiError(data?.error || `Upload failed (${res.status})`, data?.code || 'unknown', res.status);
  return data as T;
}

const returnOrigin = paymentReturnOrigin;

// ── HitPay checkout shared by every payment button ───────────────────────────

/** Opens HitPay in a secure browser tab and waits (polling payments-status)
 *  until the payment is confirmed, released or expired. `isCancelled()` lets
 *  the screen stop waiting; the hold is then abandoned — the server re-checks
 *  with HitPay first, so a payment that did go through still comes back
 *  'confirmed'. */
export async function payWithHitPay(token: string, checkoutUrl: string, hold: string, isCancelled: () => boolean): Promise<PaymentStatus> {
  void WebBrowser.openBrowserAsync(checkoutUrl);
  const started = Date.now();
  while (Date.now() - started < 20 * 60_000) {
    await new Promise(r => setTimeout(r, 3000));
    if (isCancelled()) return paymentStatus(token, hold, true);
    try {
      const s = await paymentStatus(token, hold);
      if (s.status !== 'pending') return s;
    } catch { /* keep waiting */ }
  }
  return paymentStatus(token, hold, true);
}

// ── Pay a balance / add add-ons ──────────────────────────────────────────────

/** Settles a booking's outstanding amount (server computes the amount). */
export const startBookingPayment = (token: string, bookingId: string) =>
  postJson<{ ok: true; checkout_url: string; hold_token: string; amount: number }>('payments-start', token, {
    return_origin: returnOrigin, pay_booking_id: bookingId,
  });

export interface AddonOption {
  id: string;
  name: string;
  description?: string | null;
  is_member_special: boolean;
  price: number;
  member_price: number;
}

export interface AddonOptions {
  payment_status: string;
  is_member: boolean;
  mode: 'single' | 'all';
  /** 'single' mode: this booking already used its one member-special price. */
  member_slot_used: boolean;
  addons: AddonOption[];
}

export const getAddonOptions = (token: string, bookingId: string) =>
  callFunction<{ ok: true } & AddonOptions>('customer-auth', { action: 'booking-addon-options', booking_id: bookingId }, token);

/** Prices for a picked set, exactly as the web picker shows them, plus the
 *  price each row shows: in 'single' mode only ONE member-special per booking
 *  gets the member price — already gone if the booking used it
 *  (member_slot_used) or another ticked row took it. */
export function addonOptionPrices(o: AddonOptions, picked: string[]) {
  const prices = new Map<string, number>();
  let slotFree = o.mode === 'all' || !o.member_slot_used;
  for (const id of picked) {
    const a = o.addons.find(x => x.id === id);
    if (!a) continue;
    if (a.is_member_special && o.is_member && slotFree) {
      prices.set(id, Number(a.member_price ?? 0));
      if (o.mode === 'single') slotFree = false;
    } else prices.set(id, Number(a.price ?? 0));
  }
  const rowPrice = (a: AddonOption) =>
    prices.get(a.id) ?? (a.is_member_special && o.is_member && slotFree ? Number(a.member_price ?? 0) : Number(a.price ?? 0));
  return { prices, rowPrice };
}

/** Buys add-ons for an existing booking. `free` = nothing to pay (attached). */
export const startAddonPayment = (token: string, bookingId: string, addonIds: string[]) =>
  postJson<{ ok: true; checkout_url?: string; hold_token?: string; amount: number; free?: boolean }>('payments-start', token, {
    return_origin: returnOrigin, add_addon_booking_id: bookingId, addon_ids: addonIds,
  });

// ── Photos ───────────────────────────────────────────────────────────────────

/** Asks for a photo (camera or library) and returns a compressed JPEG, or
 *  null if the customer backed out. Long side capped at 1600 px like the web. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<{ uri: string; name: string } | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(source === 'camera' ? 'Camera permission was not given.' : 'Photo access was not given.');
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const long = Math.max(a.width || 0, a.height || 0);
  const ctx = ImageManipulator.manipulate(a.uri);
  if (long > 1600) ctx.resize(a.width >= a.height ? { width: 1600 } : { height: 1600 });
  const img = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: img.uri, name: `photo-${Date.now()}.jpg` };
}

// Expo's fetch (SDK 52+) rejects React Native's `{ uri }` parts ("Unsupported
// FormDataPart implementation"); it takes any part with name/type and bytes().
const filePart = (f: { uri: string; name: string }) =>
  ({ name: f.name, type: 'image/jpeg', bytes: () => new File(f.uri).bytes() }) as unknown as Blob;

export function uploadBookingPhoto(token: string, bookingId: string, f: { uri: string; name: string }) {
  const form = new FormData();
  form.append('appointmentId', bookingId);
  form.append('file', filePart(f));
  return postForm<{ url: string; attachment_urls: string[] }>('customer-upload-attachment', token, form);
}

export function deleteBookingPhoto(token: string, bookingId: string, url: string) {
  const form = new FormData();
  form.append('action', 'delete');
  form.append('appointmentId', bookingId);
  form.append('url', url);
  return postForm<{ attachment_urls: string[] }>('customer-upload-attachment', token, form);
}

export const isImageUrl = (u: string) => /\.(jpe?g|png|webp|gif|heic|avif)(\?|$)/i.test(u);

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sender_type: 'customer' | 'staff' | 'admin';
  sender_role?: string | null;
  sender_name: string;
  body: string;
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  created_at: string;
  reply_to_id?: string | null;
  /** This phone only: still sending / failed. */
  pending?: boolean;
  failed?: string | null;
}

export interface ChatState {
  enabled: boolean;
  /** Sendable right now (a team member is live on the job). */
  open: boolean;
  messages: ChatMessage[];
  participants: { name: string; role: string }[];
}

export async function chatList(token: string, bookingId: string): Promise<ChatState> {
  const d = await postJson<Partial<ChatState>>('customer-chat', token, { action: 'list', appointment_id: bookingId });
  return { enabled: !!d.enabled, open: !!d.open, messages: d.messages ?? [], participants: d.participants ?? [] };
}

/** Plain JSON reply (no `early` streaming: React Native can't read a stream
 *  body, and the full reply only adds the server's notification time). */
export const chatSend = (token: string, bookingId: string, body: string, messageId: string, sentAt: string) =>
  postJson<{ message: ChatMessage }>('customer-chat', token, {
    action: 'send', appointment_id: bookingId, body, message_id: messageId, sent_at: sentAt,
  });

export function chatSendImage(token: string, bookingId: string, f: { uri: string; name: string }, messageId: string, sentAt: string) {
  const form = new FormData();
  form.append('action', 'send-image');
  form.append('appointment_id', bookingId);
  form.append('file', filePart(f));
  form.append('message_id', messageId);
  form.append('sent_at', sentAt);
  return postForm<{ message: ChatMessage }>('customer-chat', token, form);
}

export const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

// ── Van ETA ──────────────────────────────────────────────────────────────────

/** A van on the way: plate + road distance / drive time — never its location. */
export interface VanEta { leg: string; plate?: string | null; km: number | null; min: number | null; at: string | null }

export async function vanEta(token: string, bookingId: string): Promise<VanEta[]> {
  try {
    const d = await postJson<{ vans?: VanEta[] }>('gps-tracker', token, { action: 'customer_eta', booking_id: bookingId });
    return d.vans ?? [];
  } catch {
    return [];
  }
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export interface MyReview {
  id: string;
  appointment_id: string | null;
  rating: number;
  review_text: string;
  status: 'pending' | 'approved' | 'rejected';
  reply_text: string | null;
  created_at: string;
}

export const myReviews = (token: string) =>
  postJson<{ reviews?: MyReview[] }>('customer-review', token, { action: 'mine' }).then(d => d.reviews ?? []);

export const submitReview = (token: string, bookingId: string, rating: number, text: string) =>
  postJson<{ review: MyReview; published?: boolean }>('customer-review', token, { action: 'submit', booking_id: bookingId, rating, text });

// ── Invoice ──────────────────────────────────────────────────────────────────

export interface InvoiceResponse {
  ok: true;
  doc: Record<string, unknown>;
  items: Record<string, unknown>[];
  settings: Record<string, unknown>;
  booking_date: string | null;
}

/** The finalized bill for one of the customer's bookings (code 'no_invoice'
 *  when there isn't one yet). */
export const getInvoice = (token: string, bookingId: string) =>
  callFunction<InvoiceResponse>('customer-auth', { action: 'get-invoice', booking_id: bookingId }, token);

export const canHaveInvoice = (b: { status: string; payment_status: string; outstanding_amount: number }) => {
  const settled = ['paid', 'cash', 'redemption'].includes(b.payment_status);
  return b.payment_status === 'paid' || b.payment_status === 'cash'
    || (b.payment_status === 'redemption' && !(b.outstanding_amount > 0))
    || (b.status === 'cancelled' && settled);
};

// ── Points reload (top-up) ───────────────────────────────────────────────────

export interface ReloadConfig {
  enabled: boolean;
  tiers: { amount: number; bonus: number }[];
  custom_enabled: boolean;
  custom_min: number;
  bonus_note?: 'member_only' | 'non_member_only' | null;
}

/** HitPay checkout for buying points; the bonus is worked out by the server. */
export const startPointsReload = (token: string, amount: number) =>
  postJson<{ ok: true; checkout_url: string; hold_token: string; bonus: number }>('points-reload-start', token, { return_origin: returnOrigin, amount });

// ── Customer Service chat (general enquiry, web customer-support) ────────────

export interface SupportThread {
  id: string;
  booking_id: string | null;
  subject: string;
  status: 'pending' | 'open' | 'closed';
  created_at: string;
  opened_at: string | null;
  last_message_at: string | null;
}

export async function supportList(token: string): Promise<{ allowed: boolean; thread: SupportThread | null; messages: ChatMessage[] }> {
  const d = await postJson<{ allowed?: boolean; thread?: SupportThread | null; messages?: ChatMessage[] }>('customer-support', token, { action: 'list' });
  return { allowed: d.allowed !== false, thread: d.thread ?? null, messages: d.messages ?? [] };
}

/** Ask the business to open a chat (sits as a request until they do). */
export const supportRequest = (token: string, body: string, bookingId?: string | null) =>
  postJson<{ thread: SupportThread; messages?: ChatMessage[] }>('customer-support', token, { action: 'request', body, booking_id: bookingId ?? null });

export const supportSend = (token: string, threadId: string, body: string, messageId: string) =>
  postJson<{ message: ChatMessage }>('customer-support', token, { action: 'send', thread_id: threadId, body, message_id: messageId });

export function supportSendImage(token: string, threadId: string, f: { uri: string; name: string }, messageId: string) {
  const form = new FormData();
  form.append('action', 'send-image');
  form.append('thread_id', threadId);
  form.append('message_id', messageId);
  form.append('file', filePart(f));
  return postForm<{ message: ChatMessage }>('customer-support', token, form);
}
