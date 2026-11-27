// Date / time / money formatting, matching the web portal's wording.

/** "Thu, 27 Nov 2026" from "2026-11-27". */
export function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** "1:30 PM" or "13:30" from "13:30[:00]" (company Time Format setting). */
export function fmtTime(t: string | null | undefined, format: '12h' | '24h' = '12h'): string {
  if (!t) return '—';
  const [h, m] = t.split(':').map(Number);
  if (format === '24h') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** "Thu, 16 Jul · 1:30 PM" from a full ISO timestamp. */
export function fmtStamp(iso: string, format: '12h' | '24h' = '12h'): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${date} · ${fmtTime(`${d.getHours()}:${d.getMinutes()}`, format)}`;
}

export const money = (n: number) =>
  `RM ${Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Today's date (YYYY-MM-DD) on this phone. */
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** UTC milliseconds of a wall-clock date + time in a time zone (the web's
 *  wallClockToUtcMs). Used for the cancellation-fee window. */
export function wallClockToUtcMs(timeZone: string, date: string, time: string): number {
  const [y, mo, d] = date.slice(0, 10).split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
    const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
    return guess - (asIfUtc - guess);
  } catch {
    return guess - 8 * 3_600_000; // Asia/Kuala_Lumpur
  }
}
