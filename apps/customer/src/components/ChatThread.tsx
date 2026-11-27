// One conversation in the web ChatWorkspace look (WsConvHeader + ChatPanel
// appearance="workspace"): white header with back, avatar, name and subtitle;
// the doodle wallpaper with day pills, tailed bubbles and photo albums; the
// composer, or a warm note in its place when the chat is read-only.
import { router } from 'expo-router';
import { ChevronDown, ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumBubble, DayPill, MessageBubble } from '@/components/chat/Bubble';
import { Composer } from '@/components/chat/Composer';
import { buildRows, fmtMsgTime, nameSlots, type Msg, type Row } from '@/components/chat/format';
import { Lightbox } from '@/components/chat/Lightbox';
import { pickPhotos, type PickedPhoto } from '@/components/chat/pickPhotos';
import { Wallpaper } from '@/components/chat/Wallpaper';
import { ChatAvatar, cw } from '@/components/chatUi';
import type { ChatMessage } from '@/lib/extras';
import { useT } from '@/lib/i18n';

export function ChatThread({ id, name, subtitle, channel, banner, messages, loading, error, canSend, closedNote, emptyHint, placeholder, onSendText, onSendPhotos, onRetry, onError, timeFormat }: {
  id: string;
  name: string;
  subtitle?: string;
  channel: 'web' | 'booking';
  /** Strip under the header (the booking's crew, a "request sent" note). */
  banner?: ReactNode;
  messages: ChatMessage[];
  loading?: boolean;
  error?: string | null;
  canSend: boolean;
  /** Shown in place of the composer when the chat is read-only. */
  closedNote?: string | null;
  /** The pill in an empty thread (default "No messages yet."). */
  emptyHint?: string;
  placeholder?: string;
  onSendText: (body: string) => void;
  /** Photos picked with "+", in order. Omit to hide "+". */
  onSendPhotos?: (files: PickedPhoto[]) => void;
  /** "Tap to retry" on a message that did not get through. */
  onRetry?: (m: ChatMessage) => void;
  /** A picker problem (no permission). */
  onError?: (message: string) => void;
  timeFormat: '12h' | '24h';
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const list = useRef<FlatList<Row>>(null);
  const atBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [photo, setPhoto] = useState<{ urls: string[]; index: number } | null>(null);

  const msgs = messages as Msg[];
  const rows = useMemo(() => buildRows(msgs), [msgs]);
  const slots = useMemo(() => nameSlots(msgs), [msgs]);
  const byId = useMemo(() => new Map(msgs.map(m => [String(m.id), m])), [msgs]);

  const toEnd = (animated: boolean) => list.current?.scrollToEnd({ animated });
  const openPhoto = useCallback((urls: string[], index: number) => setPhoto({ urls, index }), []);
  const retry = useCallback((m: Msg) => onRetry?.(m), [onRetry]);

  const handleAttach = async (source: 'library' | 'camera') => {
    try {
      const files = await pickPhotos(source);
      if (files.length && onSendPhotos) { atBottom.current = true; onSendPhotos(files); }
    } catch (e) { onError?.(t((e as Error).message)); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8} accessibilityLabel={t('Back to chats')}>
          <ChevronLeft size={24} color={cw.sub} strokeWidth={2.2} />
        </Pressable>
        <ChatAvatar id={id} name={name} channel={channel} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      {banner}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1 }}>
          <Wallpaper />
          {loading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={cw.sub} />
              <Text style={styles.loadingText}>{t('Loading…')}</Text>
            </View>
          ) : (
            <FlatList
              ref={list}
              data={rows}
              keyExtractor={r => r.key}
              contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onScroll={e => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const near = contentSize.height - contentOffset.y - layoutMeasurement.height < 120;
                atBottom.current = near;
                if (near === showJump) setShowJump(!near);
              }}
              scrollEventThrottle={100}
              onContentSizeChange={() => { if (atBottom.current) toEnd(false); }}
              onLayout={() => { if (atBottom.current) toEnd(false); }}
              ListEmptyComponent={(
                <View style={styles.emptyRow}>
                  <View style={styles.emptyPill}><Text style={styles.emptyText}>{emptyHint ?? t('No messages yet.')}</Text></View>
                </View>
              )}
              renderItem={({ item: r }) => (r.kind === 'day'
                ? <DayPill label={r.label} />
                : r.kind === 'album'
                  ? <AlbumBubble items={r.items} mine={r.mine} first={r.first} slots={slots} onOpenPhoto={openPhoto}
                      timeText={fmtMsgTime(r.items[r.items.length - 1].created_at, timeFormat)} />
                  : <MessageBubble m={r.m} mine={r.mine} first={r.first} slots={slots} byId={byId} onOpenPhoto={openPhoto}
                      onRetry={onRetry ? retry : undefined} timeText={fmtMsgTime(r.m.created_at, timeFormat)} />)}
            />
          )}
          {showJump && !loading ? (
            <Pressable onPress={() => toEnd(true)} style={styles.jump} accessibilityLabel={t('Jump to latest')}>
              <ChevronDown size={20} color={cw.sub} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>
        {error ? <Text style={styles.err}>{error}</Text> : null}
        {canSend ? (
          <Composer
            placeholder={placeholder}
            onFocus={() => { atBottom.current = true; setTimeout(() => toEnd(true), 300); }}
            onSendText={body => { atBottom.current = true; onSendText(body); }}
            onAttach={onSendPhotos ? src => { void handleAttach(src); } : undefined}
          />
        ) : closedNote ? (
          <Text style={[styles.closed, { paddingBottom: 12 + insets.bottom }]}>{closedNote}</Text>
        ) : <View style={{ height: insets.bottom, backgroundColor: '#fff' }} />}
      </KeyboardAvoidingView>
      <Lightbox key={photo ? `${photo.index}:${photo.urls.join('|')}` : 'none'} urls={photo?.urls ?? null} index={photo?.index ?? 0} onClose={() => setPhoto(null)} />
    </View>
  );
}

/** The thin strip under a booking chat's header: who is on the job. */
export function CrewStrip({ children }: { children: ReactNode }) {
  return <View style={styles.crew}>{children}</View>;
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 8, minHeight: 60,
    borderBottomWidth: 1, borderBottomColor: cw.line, backgroundColor: '#fff',
  },
  back: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  name: { fontSize: 15.5, fontWeight: '600', color: cw.text },
  sub: { fontSize: 12, color: cw.sub },
  loading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 40 },
  loadingText: { fontSize: 13, color: cw.sub },
  emptyRow: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  emptyPill: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, maxWidth: 420 },
  emptyText: { fontSize: 12.5, color: cw.sub, textAlign: 'center' },
  jump: {
    position: 'absolute', right: 16, bottom: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff',
    borderWidth: 1, borderColor: cw.line, alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 28px rgba(15,23,42,0.14)',
  },
  err: { color: cw.danger, fontSize: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff' },
  closed: { textAlign: 'center', fontSize: 13, color: cw.warnText, backgroundColor: cw.warn, paddingHorizontal: 16, paddingTop: 12 },
  crew: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: cw.line },
});
