// One conversation in the web ChatWorkspace look: header with back, avatar,
// name and subtitle; tinted message area with day-free bubbles; composer.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Camera, ChevronLeft, CircleAlert, Clock, SendHorizontal } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatAvatar, cw } from '@/components/chatUi';
import type { ChatMessage } from '@/lib/extras';
import { fmtBookingTime, useT } from '@/lib/i18n';
import { accent } from '@/lib/theme';

export function ChatThread({ id, name, subtitle, channel, messages, loading, error, canSend, notice, placeholder, onSendText, onSendPhoto, timeFormat }: {
  id: string;
  name: string;
  subtitle?: string;
  channel: 'web' | 'booking';
  messages: ChatMessage[];
  loading?: boolean;
  error?: string | null;
  canSend: boolean;
  /** Shown instead of the composer when sending isn't possible, or above it. */
  notice?: string | null;
  placeholder?: string;
  onSendText: (body: string) => void;
  onSendPhoto?: () => void;
  timeFormat: '12h' | '24h';
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const list = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    const h = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(h);
  }, [messages.length]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    onSendText(body);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={[styles.head, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={8} accessibilityLabel={t('Back')}>
          <ChevronLeft size={24} color={cw.sub} strokeWidth={2.2} />
        </Pressable>
        <ChatAvatar id={id} name={name} channel={channel} size={38} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, backgroundColor: cw.bg }}>
          {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={accent} /> : (
            <FlatList
              ref={list}
              data={messages}
              keyExtractor={m => m.id}
              contentContainerStyle={{ padding: 12, gap: 6, flexGrow: 1 }}
              ListEmptyComponent={<Text style={styles.empty}>{t('No messages yet.')}</Text>}
              renderItem={({ item: m }) => {
                const mine = m.sender_type === 'customer';
                const time = fmtBookingTime(`${new Date(m.created_at).getHours()}:${new Date(m.created_at).getMinutes()}`, timeFormat);
                return (
                  <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                    {!mine && m.sender_name ? <Text style={styles.sender}>{m.sender_name}{m.sender_role ? ` · ${m.sender_role}` : ''}</Text> : null}
                    {m.image_url ? <Image source={{ uri: m.image_url }} style={styles.img} contentFit="cover" /> : null}
                    {m.body ? <Text style={[styles.body, { color: mine ? '#fff' : cw.text }]}>{m.body}</Text> : null}
                    <View style={styles.meta}>
                      {m.failed ? <CircleAlert size={12} color={mine ? '#fff' : cw.danger} /> : m.pending ? <Clock size={11} color={mine ? 'rgba(255,255,255,0.78)' : cw.muted} /> : null}
                      <Text style={[styles.time, { color: mine ? 'rgba(255,255,255,0.78)' : cw.muted }]}>{m.failed ? t('Not delivered') : time}</Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
          {error ? <Text style={styles.err}>{error}</Text> : null}
        </View>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {canSend && (
          <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {onSendPhoto && (
              <Pressable onPress={onSendPhoto} style={styles.icon} hitSlop={6} accessibilityLabel={t('Send a photo')}>
                <Camera size={22} color={cw.sub} strokeWidth={2} />
              </Pressable>
            )}
            <TextInput value={text} onChangeText={setText} placeholder={placeholder ?? t('Type a message')} placeholderTextColor={cw.muted} multiline style={styles.input} />
            <Pressable onPress={send} disabled={!text.trim()} style={[styles.send, { opacity: text.trim() ? 1 : 0.4 }]} accessibilityLabel={t('Send')}>
              <SendHorizontal size={18} color="#fff" strokeWidth={2.2} />
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: cw.line, backgroundColor: '#fff' },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -4 },
  name: { fontSize: 15.5, fontWeight: '600', color: cw.text },
  sub: { fontSize: 12, color: cw.sub },
  empty: { textAlign: 'center', marginTop: 40, color: cw.sub, fontSize: 13 },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7, gap: 3 },
  mine: { alignSelf: 'flex-end', backgroundColor: accent, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: cw.theirs, borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 1, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  sender: { fontSize: 12, fontWeight: '600', color: '#0f9f7a' },
  body: { fontSize: 14.5, lineHeight: 20 },
  img: { width: 220, height: 220, borderRadius: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end' },
  time: { fontSize: 11 },
  err: { color: cw.danger, fontSize: 12, padding: 10, textAlign: 'center' },
  notice: { textAlign: 'center', fontSize: 13, color: cw.warnText, backgroundColor: cw.warn, paddingHorizontal: 16, paddingVertical: 12 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: cw.line, backgroundColor: '#fff' },
  icon: { paddingBottom: 9, paddingHorizontal: 2 },
  input: { flex: 1, borderRadius: 20, backgroundColor: cw.field, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 9, fontSize: 15, maxHeight: 120, color: cw.text },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' },
});
