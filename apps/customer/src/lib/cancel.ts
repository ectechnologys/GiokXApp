// Cancelling a booking: the fee preview the web shows, the confirm dialog, and
// the call. Shared by the appointment rows.
import { useState } from 'react';

import { cancelBooking, type CustomerBooking } from '@/lib/api';
import { money, todayIso, wallClockToUtcMs } from '@/lib/format';
import { t } from '@/lib/i18n';
import { queryClient } from '@/lib/queries';
import type { DisplaySettings } from '@/lib/settings';

export const isPaid = (b: CustomerBooking) => b.payment_status === 'paid' || b.payment_status === 'cash';

/** Same rule as the web: not cancelled/completed, the crew hasn't started. */
export const canCancel = (b: CustomerBooking) =>
  b.status !== 'cancelled' && b.status !== 'completed' && !b.team_started_at && !b.team_completed_at;

/** Cancellation fee the server will apply (web: feePreview). */
export function feePreview(b: CustomerBooking, fee: DisplaySettings['cancelFee'] | undefined, member?: { is_member: boolean; member_start: string | null; member_expires: string | null }) {
  if (!fee?.enabled || fee.amount <= 0) return null;
  if (fee.waiveMember && member) {
    const bd = b.booking_date.slice(0, 10);
    const ms = String(member.member_start ?? '').slice(0, 10);
    const me = String(member.member_expires ?? '').slice(0, 10);
    if (ms && me && bd >= ms && bd <= me && (bd < todayIso() || member.is_member)) return null;
  }
  const hoursUntil = (wallClockToUtcMs(fee.timezone, b.booking_date, b.start_time ?? '00:00') - Date.now()) / 3_600_000;
  if (fee.hours > 0 && hoursUntil > fee.hours) return null;
  const gross = isPaid(b) ? Number(b.total_amount ?? 0) : Number(b.redeemed_amount ?? 0);
  if (gross > 0) {
    // What's withheld is capped at the refund (the server does the same), but
    // the notice states the company's full fee, as the web does.
    const f = Math.min(fee.amount, gross);
    return { fee: fee.amount, net: Math.round((gross - f) * 100) / 100, hours: fee.hours, fromCredit: false };
  }
  return { fee: fee.amount, net: 0, hours: fee.hours, fromCredit: true };
}

export type Msg = { tone: 'ok' | 'error' | 'warn'; text: string };

export function useCancelBooking(token: string, settings: DisplaySettings | undefined, member: Parameters<typeof feePreview>[2], pointsName: string) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [target, setTarget] = useState<CustomerBooking | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async (b: CustomerBooking) => {
    setBusyId(b.id);
    setMsg(null);
    try {
      const r = await cancelBooking(token, b.id);
      if (r.ok === false) {
        setTarget(null);
        setMsg({ tone: 'warn', text: t('A {fee} cancellation fee applies, but your {points} balance is {bal}. Please reload at least {short} first, then cancel again.', {
          fee: money(r.cancellation_fee), points: pointsName || t('points'), bal: money(r.points_balance), short: money(r.shortfall),
        }) });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['bookings'] }),
        queryClient.invalidateQueries({ queryKey: ['coins'] }),
      ]);
      setTarget(null);
      setMsg({ tone: 'ok', text: t('Booking cancelled.') });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  // The web-style "Cancel this booking?" sheet (components/booking/CancelSheet).
  const confirm = (b: CustomerBooking) => { setMsg(null); setErr(null); setTarget(b); };
  const sheet = {
    b: target,
    fee: target ? feePreview(target, settings?.cancelFee, member) : null,
    pointsName,
    timeFormat: settings?.timeFormat ?? '12h',
    busy: !!target && busyId === target.id,
    err,
    onKeep: () => { setTarget(null); setErr(null); },
    onCancel: () => { if (target) run(target); },
  };

  return { confirm, busyId, msg, sheet, clear: () => setMsg(null) };
}
