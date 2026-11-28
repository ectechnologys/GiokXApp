// Appt. tab — the web /account "My appointments" card: Upcoming (sort toggle),
// Past and Cancelled, each row with its own actions.
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, CalendarDays, ChevronRight, Star } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/AppHeader';
import { BookingRow } from '@/components/BookingRow';
import { CancelSheet } from '@/components/booking/CancelSheet';
import { Notice } from '@/components/ui';
import { PageCard } from '@/components/web';
import { canCancel, useCancelBooking } from '@/lib/cancel';
import { myReviews } from '@/lib/extras';
import { todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useBookings, useCoins, useProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';
import { tenant } from '@/config/tenant';
import { accent, accentDeep, accentSoft, accentTint, bf, gray } from '@/lib/theme';

export default function Appointments() {
  const { t } = useT();
  const { session } = useSession();
  const token = session!.token;
  const q = useBookings();
  const profile = useProfile().data?.customer;
  const settings = useDisplaySettings().data;
  const pointsName = useCoins().data?.points_name ?? '';
  const timeFormat = settings?.timeFormat ?? '12h';
  const reviewsOn = settings?.reviews?.enabled !== false;
  const reviews = useQuery({ queryKey: ['my-reviews'], queryFn: () => myReviews(token), enabled: reviewsOn });
  const cancel = useCancelBooking(token, settings, profile, pointsName);
  const [sort, setSort] = useState<'soonest' | 'latest'>('soonest');
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const rowY = useRef<Record<string, number>>({});
  const today = todayIso();

  const all = useMemo(() => q.data ?? [], [q.data]);
  const cancelled = all.filter(b => b.status === 'cancelled');
  const active = all.filter(b => b.status !== 'cancelled');
  const upcomingBase = active.filter(b => b.booking_date >= today);
  const upcoming = sort === 'soonest' ? [...upcomingBase].reverse() : upcomingBase;
  const past = active.filter(b => b.booking_date < today);
  const reviewBy = Object.fromEntries((reviews.data ?? []).map(r => [r.appointment_id, r]));
  const pendingReviews = reviewsOn && settings?.reviews?.nudge !== false
    ? all.filter(b => b.team_completed_at && b.status !== 'cancelled' && !reviewBy[b.id]) : [];

  const row = (b: (typeof all)[number], opts: { muted?: boolean; cancellable?: boolean }) => (
    <View key={b.id} onLayout={e => { rowY.current[b.id] = e.nativeEvent.layout.y; }}>
      <BookingRow b={b} token={token} timeFormat={timeFormat} muted={opts.muted} chatOn={settings?.chatEnabled !== false}
        onCancel={opts.cancellable && canCancel(b) ? cancel.confirm : undefined} cancelling={cancel.busyId === b.id}
        review={reviewBy[b.id]} googleUrl={settings?.reviews?.googleUrl} googleThreshold={settings?.reviews?.googleThreshold} tenantName={tenant.name} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: bf.ground }}>
      <AppHeader />
      <ScrollView ref={scroll} contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); reviews.refetch(); }} colors={[accent]} />}>
        {cancel.msg && <Notice tone={cancel.msg.tone}>{cancel.msg.text}</Notice>}
        <PageCard>
          <View style={styles.head}>
            <View style={styles.icon}><CalendarDays size={16} color={accent} /></View>
            <Text style={styles.h2}>{t('My appointments')}</Text>
            <Text style={styles.count}>· {t('{n} total', { n: all.length })}</Text>
          </View>

          {q.isPending ? (
            <ActivityIndicator style={{ marginTop: 16 }} color={accent} />
          ) : q.isError ? (
            <View style={{ marginTop: 16 }}><Notice tone="error">{(q.error as Error).message}</Notice></View>
          ) : all.length === 0 ? (
            <Text style={styles.empty}>{t('No appointments yet — your past and upcoming bookings will show here.')}</Text>
          ) : (
            <View style={{ marginTop: 16, gap: 20 }}>
              {pendingReviews.length > 0 && (
                <Pressable onPress={() => scroll.current?.scrollTo({ y: Math.max(0, (rowY.current[pendingReviews[0].id] ?? 0)), animated: true })} style={styles.nudge}>
                  <View style={styles.nudgeIcon}><Star size={16} color={accentDeep} strokeWidth={2.5} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nudgeTitle}>{pendingReviews.length === 1 ? t('How was your service?') : t('How was your {n} recent services?', { n: pendingReviews.length })}</Text>
                    <Text style={styles.nudgeSub}>{t('Tap to leave a quick rating — it only takes a second.')}</Text>
                  </View>
                  <ChevronRight size={16} color={accentDeep} strokeWidth={2.5} />
                </Pressable>
              )}
              {upcoming.length > 0 && (
                <View>
                  <View style={styles.groupHead}>
                    <Text style={styles.group}>{`${t('Upcoming')} · ${upcoming.length}`.toUpperCase()}</Text>
                    {upcoming.length > 1 && (
                      <Pressable onPress={() => setSort(s => (s === 'soonest' ? 'latest' : 'soonest'))} style={styles.sort} hitSlop={8}>
                        <ArrowUpDown size={12} color={gray[500]} strokeWidth={2.5} />
                        <Text style={styles.sortText}>{sort === 'soonest' ? t('Soonest first') : t('Latest first')}</Text>
                      </Pressable>
                    )}
                  </View>
                  <View style={{ gap: 8 }}>{upcoming.map(b => row(b, { cancellable: true }))}</View>
                </View>
              )}
              {past.length > 0 && (
                <View>
                  <Text style={[styles.group, { marginBottom: 8 }]}>{`${t('Past')} · ${past.length}`.toUpperCase()}</Text>
                  <View style={{ gap: 8 }}>{past.map(b => row(b, { muted: true }))}</View>
                </View>
              )}
              {cancelled.length > 0 && (
                <View>
                  <Text style={[styles.group, { marginBottom: 8 }]}>{`${t('Cancelled')} · ${cancelled.length}`.toUpperCase()}</Text>
                  <View style={{ gap: 8 }}>{cancelled.map(b => row(b, {}))}</View>
                </View>
              )}
            </View>
          )}
        </PageCard>
      </ScrollView>
      <CancelSheet {...cancel.sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 24, paddingBottom: 32, gap: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 28, height: 28, borderRadius: 8, backgroundColor: accentSoft, alignItems: 'center', justifyContent: 'center' },
  h2: { fontSize: 14, fontWeight: '700', color: gray[900], letterSpacing: -0.2 },
  count: { fontSize: 11, color: gray[400], fontWeight: '500' },
  empty: { fontSize: 12, color: gray[400], backgroundColor: gray[50], borderWidth: 1, borderColor: gray[100], borderRadius: 8, paddingHorizontal: 12, paddingVertical: 16, textAlign: 'center', marginTop: 16 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  group: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: gray[400] },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { fontSize: 10, fontWeight: '600', color: gray[500] },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: accentTint, borderWidth: 1, borderColor: accentSoft },
  nudgeIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: accentSoft, alignItems: 'center', justifyContent: 'center' },
  nudgeTitle: { fontSize: 14, fontWeight: '700', color: accentDeep },
  nudgeSub: { fontSize: 12, color: gray[500] },
});
