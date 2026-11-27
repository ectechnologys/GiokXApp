// One booking row, styled like the web /account appointments list
// (ring-1 rounded-xl, CheckCircle2 + name, uppercase status/payment badges,
// calendar + clock line).
import { router } from 'expo-router';
import { CalendarDays, CheckCircle2, Clock, MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/web';
import type { CustomerBooking } from '@/lib/api';
import { fmtDate, fmtTime } from '@/lib/format';
import { badgeColors, gray } from '@/lib/theme';

export { Badge };

/** Live job progress from the crew's taps, or null before they arrive. */
export function progressOf(b: CustomerBooking): string | null {
  if (b.status === 'cancelled') return null;
  if (b.team_completed_at) return 'Job done';
  if (b.team_started_at) return 'Cleaning in progress';
  if (b.team_arrived_at) return 'Team has arrived';
  return null;
}

export function BookingCard({ b, timeFormat, muted }: { b: CustomerBooking; timeFormat: '12h' | '24h'; muted?: boolean }) {
  const cancelled = b.status === 'cancelled';
  const dim = cancelled || muted;
  const progress = progressOf(b);
  return (
    <Pressable onPress={() => router.push({ pathname: '/booking/[id]', params: { id: b.id } })}
      style={({ pressed }) => [styles.row, dim ? styles.dim : null, { opacity: pressed ? 0.7 : dim ? 0.7 : 1 }]}>
      <View style={styles.top}>
        <View style={styles.name}>
          <CheckCircle2 size={14} color={badgeColors(b.status).text} strokeWidth={2} />
          <Text style={styles.nameText} numberOfLines={1}>{b.service_name}</Text>
        </View>
        <View style={styles.badges}>
          <Badge label={b.status} />
          {!cancelled && <Badge label={b.payment_status} />}
        </View>
      </View>
      <View style={styles.meta}>
        <View style={styles.metaItem}><CalendarDays size={12} color={gray[500]} /><Text style={styles.metaText}>{fmtDate(b.booking_date)}</Text></View>
        <View style={styles.metaItem}><Clock size={12} color={gray[500]} /><Text style={styles.metaText}>{fmtTime(b.start_time, timeFormat)}</Text></View>
      </View>
      {(b.unit_number || b.address) ? (
        <View style={styles.metaItem}>
          <MapPin size={12} color={gray[400]} />
          <Text style={[styles.metaText, { color: gray[400], flex: 1 }]} numberOfLines={1}>{[b.unit_number, b.address].filter(Boolean).join(', ')}</Text>
        </View>
      ) : null}
      {progress && <Text style={styles.progress}>● {progress}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: '#fff', borderWidth: 1, borderColor: gray[100], borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 6 },
  dim: { backgroundColor: gray[50], borderColor: gray[200] },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  name: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  nameText: { fontSize: 15, fontWeight: '600', color: gray[800], flexShrink: 1 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  meta: { flexDirection: 'row', gap: 14 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: gray[500] },
  progress: { fontSize: 13, fontWeight: '600', color: '#047857' },
});
