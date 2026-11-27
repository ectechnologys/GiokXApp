// Chat tab — the web "Chats" screen: Customer Service (always there, pinned)
// plus each booking whose team chat is live today. Search, All / Unread.
import { useQueries, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pin, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatAvatar, cw, whenLabel } from '@/components/chatUi';
import { useChatReads } from '@/lib/chatReads';
import { chatList, supportList, type ChatMessage } from '@/lib/extras';
import { fmtBookingDate, fmtBookingTime, useT } from '@/lib/i18n';
import { useBookings } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';
import { accent } from '@/lib/theme';

interface Conv { id: string; name: string; channel: 'web' | 'booking'; preview: string; at: string; unread: boolean; tags?: string[]; pinned?: boolean }

export default function Chats() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const token = session!.token;
  const timeFormat = useDisplaySettings().data?.timeFormat ?? '12h';
  const reads = useChatReads();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const support = useQuery({ queryKey: ['support'], queryFn: () => supportList(token), refetchInterval: 10_000 });
  const bookings = useBookings();
  const live = (bookings.data ?? []).filter(b => b.chat_open);
  const bookingChats = useQueries({
    queries: live.map(b => ({ queryKey: ['chat', b.id], queryFn: () => chatList(token, b.id), refetchInterval: 15_000 })),
  });

  const msgText = (m: ChatMessage) => (m.image_url ? `📷 ${t('Photo')}` : String(m.body ?? ''));
  const unreadSince = (id: string, at: string) => !reads[id] || reads[id] < at;

  const thread = support.data?.thread ?? null;
  const sLast = (support.data?.messages ?? []).slice(-1)[0];
  const convs: Conv[] = [{
    id: 's:support',
    name: t('Customer Service'),
    channel: 'web',
    preview: sLast
      ? `${sLast.sender_type === 'customer' ? `${t('You')}: ` : ''}${msgText(sLast)}`
      : thread ? t('Waiting for the team to open this chat') : t('Ask about anything — prices, invoices, a visit'),
    at: sLast?.created_at ?? '',
    unread: !!thread && !!sLast && sLast.sender_type !== 'customer' && unreadSince('s:support', sLast.created_at),
    tags: thread?.status === 'pending' ? [t('Requested')] : undefined,
    pinned: true,
  }];
  live.forEach((b, i) => {
    const msgs = bookingChats[i]?.data?.messages ?? [];
    const last = msgs[msgs.length - 1];
    convs.push({
      id: `b:${b.id}`,
      name: b.service_name || t('Booking'),
      channel: 'booking',
      preview: last
        ? `${last.sender_type === 'customer' ? `${t('You')}: ` : last.sender_name ? `${String(last.sender_name).split(' ')[0]}: ` : ''}${msgText(last)}`
        : `${fmtBookingDate(b.booking_date)} · ${fmtBookingTime(b.start_time, timeFormat)}`,
      at: last?.created_at ?? '',
      unread: !!last && last.sender_type !== 'customer' && unreadSince(`b:${b.id}`, last.created_at),
      tags: [`${t('Live')} · ${fmtBookingDate(b.booking_date)}`],
    });
  });

  const unreadCount = convs.filter(c => c.unread).length;
  const needle = q.trim().toLowerCase();
  const shown = convs
    .filter(c => (filter === 'unread' ? c.unread : true))
    .filter(c => !needle || c.name.toLowerCase().includes(needle) || c.preview.toLowerCase().includes(needle));

  const open = (c: Conv) => {
    if (c.id === 's:support') router.push('/support');
    else router.push({ pathname: '/booking/[id]/chat', params: { id: c.id.slice(2) } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('Chats')}</Text>
        <Pressable onPress={() => router.navigate('/')} style={styles.close} accessibilityLabel={t('Close')}>
          <X size={20} color={cw.sub} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={styles.searchWrap}>
        <View style={styles.search}>
          <Search size={16} color={cw.sub} strokeWidth={2} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('Search chats')} placeholderTextColor={cw.sub} style={styles.searchInput} />
          {q ? <Pressable onPress={() => setQ('')} hitSlop={8}><X size={16} color={cw.sub} /></Pressable> : null}
        </View>
      </View>
      <View style={styles.pills}>
        {(['all', 'unread'] as const).map(f => {
          const on = filter === f;
          return (
            <Pressable key={f} onPress={() => setFilter(f)}
              style={[styles.pill, { backgroundColor: on ? cw.accentSoft : cw.chip, borderColor: on ? cw.accent : 'transparent' }]}>
              <Text style={[styles.pillText, { color: on ? cw.accent : cw.chipText }]}>
                {f === 'all' ? t('All') : t('Unread')}{f === 'unread' && unreadCount > 0 ? ` ${unreadCount}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView refreshControl={<RefreshControl refreshing={support.isRefetching} onRefresh={() => { support.refetch(); bookings.refetch(); }} colors={[accent]} />}>
        {shown.length === 0 ? (
          <Text style={styles.empty}>{needle ? `${t('No chats match')} "${q}".` : filter === 'unread' ? t("You're all caught up.") : t('No chats here yet.')}</Text>
        ) : shown.map(c => (
          <Pressable key={c.id} onPress={() => open(c)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: 'rgba(0,0,0,0.03)' }]}>
            <ChatAvatar id={c.id} name={c.name} channel={c.channel} />
            <View style={{ flex: 1, minWidth: 0, paddingVertical: 2 }}>
              <View style={styles.line}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={[styles.when, c.unread && { color: cw.accent, fontWeight: '600' }]}>{whenLabel(c.at, timeFormat) === 'Yesterday' ? t('Yesterday') : whenLabel(c.at, timeFormat)}</Text>
              </View>
              <View style={[styles.line, { marginTop: 2 }]}>
                <Text style={styles.preview} numberOfLines={1}>{c.preview}</Text>
                {c.pinned && <Pin size={14} color={cw.muted} strokeWidth={2.2} style={{ transform: [{ rotate: '45deg' }] }} />}
                {c.unread && <View style={styles.dot} />}
              </View>
              {c.tags?.length ? (
                <View style={styles.tags}>{c.tags.map(x => <Text key={x} style={styles.tag}>{x}</Text>)}</View>
              ) : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', letterSpacing: -0.2, color: cw.text },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 12, paddingBottom: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: cw.field, borderRadius: 8, paddingHorizontal: 12, height: 36 },
  searchInput: { flex: 1, fontSize: 13.5, color: cw.text, paddingVertical: 0 },
  pills: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: cw.line },
  pill: { borderRadius: 999, paddingHorizontal: 12, height: 28, justifyContent: 'center', borderWidth: 1 },
  pillText: { fontSize: 12.5, fontWeight: '500' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: cw.text },
  when: { fontSize: 11.5, color: cw.muted },
  preview: { flex: 1, fontSize: 13, color: cw.sub },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: cw.accent },
  tags: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  tag: { fontSize: 10.5, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: cw.tag, color: cw.tagText, overflow: 'hidden' },
  empty: { paddingHorizontal: 24, paddingVertical: 56, textAlign: 'center', fontSize: 13, color: cw.sub },
});
