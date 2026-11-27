// My bookings: Upcoming (soonest first), Past, Cancelled — same split as the
// web /account Appointments tab.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingCard } from '@/components/BookingCard';
import { Notice } from '@/components/ui';
import { tenant } from '@/config/tenant';
import type { CustomerBooking } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { useBookings } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';
import { useColors } from '@/lib/theme';

export default function Bookings() {
  const c = useColors();
  const { session } = useSession();
  const q = useBookings();
  const settings = useDisplaySettings();
  const timeFormat = settings.data?.timeFormat ?? '12h';

  const sections = useMemo(() => {
    const all = q.data ?? [];
    const today = todayIso();
    const active = all.filter(b => b.status !== 'cancelled');
    const upcoming = active.filter(b => b.booking_date >= today).reverse(); // server: newest first
    const past = active.filter(b => b.booking_date < today);
    const cancelled = all.filter(b => b.status === 'cancelled');
    return [
      { title: 'Upcoming', data: upcoming },
      { title: 'Past', data: past },
      { title: 'Cancelled', data: cancelled },
    ].filter(s => s.data.length > 0);
  }, [q.data]);

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: c.bg }]}>
      <SectionList<CustomerBooking>
        sections={sections}
        keyExtractor={b => b.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} colors={[tenant.primaryColor]} />}
        ListHeaderComponent={
          <View style={{ gap: 2, marginBottom: 8 }}>
            <Text style={[styles.brand, { color: tenant.primaryColor }]}>{tenant.name}</Text>
            <Text style={[styles.h1, { color: c.text }]}>Hi, {session?.customer.name.split(' ')[0]}</Text>
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={[styles.section, { color: c.muted }]}>{section.title.toUpperCase()}</Text>}
        renderItem={({ item }) => <BookingCard b={item} timeFormat={timeFormat} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          q.isPending ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={tenant.primaryColor} />
          ) : q.isError ? (
            <Notice tone="error">{`Couldn’t load your bookings: ${(q.error as Error).message}`}</Notice>
          ) : (
            <View style={styles.empty}>
              <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>No bookings yet</Text>
              <Text style={{ color: c.muted, textAlign: 'center' }}>Book your first cleaning and it will show up here.</Text>
              <Pressable onPress={() => router.navigate('/book')} style={[styles.cta, { backgroundColor: tenant.primaryColor }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Book a cleaning</Text>
              </Pressable>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 20, paddingBottom: 40 },
  brand: { fontSize: 15, fontWeight: '700' },
  h1: { fontSize: 28, fontWeight: '700' },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 18, marginBottom: 8 },
  empty: { alignItems: 'center', gap: 10, marginTop: 60 },
  cta: { borderRadius: 12, paddingHorizontal: 22, paddingVertical: 14, marginTop: 8 },
});
