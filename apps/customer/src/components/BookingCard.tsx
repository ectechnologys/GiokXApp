import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CustomerBooking } from '@/lib/api';
import { fmtDate, fmtTime } from '@/lib/format';
import { useColors } from '@/lib/theme';

/** Status badge colours (web: bookingStatusBadge / bookingPayBadge). */
export function statusTone(status: string): 'ok' | 'bad' | 'neutral' {
  const s = status.toLowerCase();
  if (s === 'confirmed' || s === 'completed' || s === 'paid' || s === 'cash' || s === 'redemption') return 'ok';
  if (s === 'cancelled' || s === 'unpaid' || s === 'refunded') return 'bad';
  return 'neutral';
}

export function Badge({ label }: { label: string }) {
  const tone = statusTone(label);
  const p = { ok: { bg: '#e7f6ec', fg: '#1a7f37' }, bad: { bg: '#fdecea', fg: '#c62828' }, neutral: { bg: '#eef0f3', fg: '#4b5058' } }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: p.bg }]}>
      <Text style={[styles.badgeText, { color: p.fg }]}>{label.charAt(0).toUpperCase() + label.slice(1)}</Text>
    </View>
  );
}

/** Live job progress from the crew's taps, or null before they arrive. */
export function progressOf(b: CustomerBooking): string | null {
  if (b.status === 'cancelled') return null;
  if (b.team_completed_at) return 'Job done';
  if (b.team_started_at) return 'Cleaning in progress';
  if (b.team_arrived_at) return 'Team has arrived';
  return null;
}

export function BookingCard({ b, timeFormat }: { b: CustomerBooking; timeFormat: '12h' | '24h' }) {
  const c = useColors();
  const progress = progressOf(b);
  return (
    <Pressable onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
      style={({ pressed }) => [styles.card, { backgroundColor: c.field, opacity: pressed ? 0.7 : 1 }]}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>{b.service_name}</Text>
          <Badge label={b.status} />
        </View>
        <Text style={{ color: c.text, fontSize: 15 }}>
          {fmtDate(b.booking_date)} · {fmtTime(b.start_time, timeFormat)}
        </Text>
        <Text style={{ color: c.muted }} numberOfLines={1}>
          {[b.unit_number, b.address].filter(Boolean).join(', ')}
        </Text>
        {progress && <Text style={{ color: '#1a7f37', fontWeight: '600' }}>● {progress}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
