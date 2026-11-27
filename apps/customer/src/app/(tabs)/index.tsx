// My bookings: hero + Upcoming (soonest first) / Past / Cancelled — the web
// /account page's header and Appointments card.
import { router } from 'expo-router';
import { CalendarPlus } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingCard } from '@/components/BookingCard';
import { Notice, PrimaryButton } from '@/components/ui';
import { Hero, SectionLabel } from '@/components/web';
import type { CustomerBooking } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { useBookings, useProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';
import { accent, gray } from '@/lib/theme';

export default function Bookings() {
  const { session } = useSession();
  const q = useBookings();
  const profile = useProfile().data?.customer;
  const timeFormat = useDisplaySettings().data?.timeFormat ?? '12h';
  const today = todayIso();

  const sections = useMemo(() => {
    const all = q.data ?? [];
    const active = all.filter(b => b.status !== 'cancelled');
    return [
      { title: 'Upcoming', data: active.filter(b => b.booking_date >= today).reverse() }, // server: newest first
      { title: 'Past', data: active.filter(b => b.booking_date < today) },
      { title: 'Cancelled', data: all.filter(b => b.status === 'cancelled') },
    ].filter(s => s.data.length > 0);
  }, [q.data, today]);

  const member = profile?.is_member
    ? { active: !!profile.member_expires && profile.member_expires.slice(0, 10) >= today, start: profile.member_start, expires: profile.member_expires }
    : null;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <SectionList<CustomerBooking>
        sections={sections}
        keyExtractor={b => b.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} colors={[accent]} />}
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 6 }}>
            <Hero name={profile?.name ?? session?.customer.name ?? ''} phone={profile?.phone_e164 ?? session?.customer.phone_e164} member={member} />
            <Text style={styles.h2}>Appointments</Text>
          </View>
        }
        renderSectionHeader={({ section }) => <SectionLabel style={{ marginTop: 14, marginBottom: 8 }}>{section.title}</SectionLabel>}
        renderItem={({ item, section }) => <BookingCard b={item} timeFormat={timeFormat} muted={section.title === 'Past'} />}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          q.isPending ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
          ) : q.isError ? (
            <Notice tone="error">{`Couldn’t load your bookings: ${(q.error as Error).message}`}</Notice>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><CalendarPlus size={22} color={accent} /></View>
              <Text style={styles.emptyTitle}>No bookings yet</Text>
              <Text style={styles.emptyText}>Book your first cleaning and it will show up here.</Text>
              <View style={{ alignSelf: 'stretch' }}>
                <PrimaryButton label="Book a cleaning" onPress={() => router.navigate('/book')} />
              </View>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: gray[50] },
  list: { padding: 16, paddingBottom: 40 },
  h2: { fontSize: 17, fontWeight: '700', color: gray[900], letterSpacing: -0.2 },
  empty: { alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: gray[100], padding: 24 },
  emptyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(195,164,111,0.14)' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: gray[900] },
  emptyText: { color: gray[500], textAlign: 'center', marginBottom: 6 },
});
