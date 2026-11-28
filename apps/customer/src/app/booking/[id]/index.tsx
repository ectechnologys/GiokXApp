// One booking: when, where, who's coming, payment, live progress, cancel.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Badge, progressOf } from '@/components/BookingCard';
import { SectionLabel, WCard } from '@/components/web';
import { AddExtras, PayBalance, Photos, Review, VanPills } from '@/components/booking/Extras';
import { Notice } from '@/components/ui';
import { canHaveInvoice } from '@/lib/extras';
import { fmtDate, fmtStamp, fmtTime, money } from '@/lib/format';
import { useBookings, useCoins, useProfile } from '@/lib/queries';
import { useCancelBooking } from '@/lib/cancel';
import { CancelSheet } from '@/components/booking/CancelSheet';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';
import { accent, gray, useColors } from '@/lib/theme';

export default function BookingDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const bookings = useBookings();
  const profile = useProfile();
  const settings = useDisplaySettings();
  const pointsName = useCoins().data?.points_name ?? '';
  const cancel = useCancelBooking(session?.token ?? '', settings.data, profile.data?.customer, pointsName);
  const msg = cancel.msg;

  const b = bookings.data?.find(x => x.id === id);
  const timeFormat = settings.data?.timeFormat ?? '12h';

  if (!b) {
    return (
      <View style={[styles.root, { backgroundColor: gray[50], padding: 20 }]}>
        <Stack.Screen options={{ title: 'Booking' }} />
        <Text style={{ color: c.muted }}>{bookings.isPending ? 'Loading…' : 'This booking could not be found.'}</Text>
      </View>
    );
  }

  const canCancel = b.status !== 'cancelled' && b.status !== 'completed' && !b.team_started_at && !b.team_completed_at;
  const progress = progressOf(b);

  const cancelling = cancel.busyId === b.id;

  return (
    <ScrollView
      style={{ backgroundColor: gray[50] }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => { bookings.refetch(); }} colors={[accent]} />}>
      <Stack.Screen options={{ title: 'Booking' }} />

      <View style={{ gap: 8 }}>
        <Text style={[styles.h1, { color: c.text }]}>{b.service_name}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Badge label={b.status} />
          <Badge label={b.payment_status} />
        </View>
      </View>

      {progress && <Notice tone="ok">{progress}</Notice>}
      {session && <VanPills b={b} token={session.token} />}
      {settings.data?.chatEnabled !== false && (b.chat_open || b.chat_active) && (
        <Pressable onPress={() => router.push({ pathname: '/booking/[id]/chat', params: { id: b.id } })}
          style={[styles.action, { backgroundColor: accent }]}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>💬 {b.chat_open ? 'Chat with the team' : 'View chat'}</Text>
        </Pressable>
      )}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

      <Section title="When">
        <Text style={[styles.big, { color: c.text }]}>{fmtDate(b.booking_date)}</Text>
        <Text style={{ color: c.text, fontSize: 16 }}>
          {fmtTime(b.start_time, timeFormat)}{b.end_time ? ` – ${fmtTime(b.end_time, timeFormat)}` : ''}
        </Text>
      </Section>

      <Section title="Where">
        <Text style={{ color: c.text, fontSize: 16 }}>{[b.unit_number, b.address].filter(Boolean).join(', ')}</Text>
        {(b.postcode || b.city) && <Text style={{ color: c.muted }}>{[b.postcode, b.city].filter(Boolean).join(' ')}</Text>}
      </Section>

      {b.addons.length > 0 && (
        <Section title="Add-ons">
          {b.addons.map((a, i) => <Text key={i} style={{ color: c.text, fontSize: 16 }}>• {a}</Text>)}
        </Section>
      )}

      <Section title="Your team">
        {b.assignees?.length ? b.assignees.map((a, i) => (
          <View key={i} style={styles.person}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{a.nickname || a.name}</Text>
            <Text style={{ color: c.muted }}>{[a.role, a.id && `ID ${a.id}`, a.vehicle].filter(Boolean).join(' · ')}</Text>
          </View>
        )) : <Text style={{ color: c.muted }}>Not assigned yet.</Text>}
        {b.team_arrived_at && <Text style={{ color: c.muted }}>Arrived {fmtStamp(b.team_arrived_at, timeFormat)}</Text>}
        {b.team_started_at && <Text style={{ color: c.muted }}>Started {fmtStamp(b.team_started_at, timeFormat)}</Text>}
        {b.team_completed_at && <Text style={{ color: c.muted }}>Finished {fmtStamp(b.team_completed_at, timeFormat)}</Text>}
      </Section>

      {session && <PayBalance b={b} token={session.token} />}

      <Section title="Payment">
        <Row label="Total" value={money(b.total_amount)} />
        {b.redeemed_amount > 0 && <Row label="Paid with points" value={`− ${money(b.redeemed_amount)}`} />}
        {b.outstanding_amount > 0 && b.status !== 'cancelled' && <Row label="Still to pay" value={money(b.outstanding_amount)} bold />}
      </Section>

      {canHaveInvoice(b) && (
        <Pressable onPress={() => router.push({ pathname: '/booking/[id]/invoice', params: { id: b.id } })}
          style={[styles.action, { borderWidth: 1.5, borderColor: accent }]}>
          <Text style={{ color: accent, fontWeight: '700', fontSize: 16 }}>View invoice</Text>
        </Pressable>
      )}
      {session && <AddExtras b={b} token={session.token} />}
      {session && <Photos b={b} token={session.token} />}
      {session && settings.data?.reviews.enabled !== false && (
        <Review b={b} token={session.token} googleUrl={settings.data?.reviews.googleUrl ?? ''} googleThreshold={settings.data?.reviews.googleThreshold ?? 5} />
      )}

      {canCancel && (
        <Pressable onPress={() => cancel.confirm(b)} disabled={cancelling}
          style={({ pressed }) => [styles.cancel, { opacity: cancelling ? 0.5 : pressed ? 0.7 : 1 }]}>
          <Text style={{ color: '#c62828', fontWeight: '700', fontSize: 16 }}>{cancelling ? 'Cancelling…' : 'Cancel booking'}</Text>
        </Pressable>
      )}
      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', padding: 8 }}>
        <Text style={{ color: c.muted }}>Back to bookings</Text>
      </Pressable>
      <CancelSheet {...cancel.sheet} />
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <WCard>
      <SectionLabel>{title}</SectionLabel>
      {children}
    </WCard>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: bold ? '700' : '400' }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: bold ? '700' : '400' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 48 },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  big: { fontSize: 18, fontWeight: '700' },
  section: { borderRadius: 14, padding: 16, gap: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  person: { gap: 1, marginBottom: 4 },
  action: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  cancel: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
});
