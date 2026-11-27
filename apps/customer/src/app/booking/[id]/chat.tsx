// Chat with the team on one booking. Open (sendable) while a team member is
// live on the job; read-only before and after. Polls every 4 s.
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Notice } from '@/components/ui';
import { chatList, chatSend, chatSendImage, pickPhoto, uuid, type ChatMessage } from '@/lib/extras';
import { fmtTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';
import { accent, useColors } from '@/lib/theme';

export default function Chat() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const token = session!.token;
  const timeFormat = useDisplaySettings().data?.timeFormat ?? '12h';
  const q = useQuery({ queryKey: ['chat', id], queryFn: () => chatList(token, id), refetchInterval: 4000 });
  const [local, setLocal] = useState<ChatMessage[]>([]); // sending / failed on this phone
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);

  const server = q.data?.messages ?? [];
  const serverIds = new Set(server.map(m => m.id));
  const messages = [...server, ...local.filter(m => !serverIds.has(m.id))];

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 100);
    return () => clearTimeout(t);
  }, [messages.length]);

  const sendText = async () => {
    const body = text.trim();
    if (!body) return;
    const msg: ChatMessage = { id: uuid(), sender_type: 'customer', sender_name: session!.customer.name, body, created_at: new Date().toISOString(), pending: true };
    setText('');
    setLocal(l => [...l, msg]);
    try {
      await chatSend(token, id, body, msg.id, msg.created_at);
      await q.refetch();
      setLocal(l => l.filter(m => m.id !== msg.id));
    } catch (e) {
      setLocal(l => l.map(m => (m.id === msg.id ? { ...m, pending: false, failed: (e as Error).message } : m)));
    }
  };

  const sendPhoto = async () => {
    setErr(null);
    try {
      const f = await pickPhoto('library');
      if (!f) return;
      const msg: ChatMessage = { id: uuid(), sender_type: 'customer', sender_name: session!.customer.name, body: '', image_url: f.uri, created_at: new Date().toISOString(), pending: true };
      setLocal(l => [...l, msg]);
      try {
        await chatSendImage(token, id, f, msg.id, msg.created_at);
        await q.refetch();
        setLocal(l => l.filter(m => m.id !== msg.id));
      } catch (e) {
        setLocal(l => l.map(m => (m.id === msg.id ? { ...m, pending: false, failed: (e as Error).message } : m)));
      }
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const open = !!q.data?.open;
  const who = (q.data?.participants ?? []).map(p => `${p.name} (${p.role})`).join(', ');

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'Chat with the team' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {who ? <Text style={[styles.who, { color: c.muted, borderBottomColor: c.border }]}>With {who}</Text> : null}
        {q.isPending ? <ActivityIndicator style={{ marginTop: 40 }} color={accent} /> : (
          <FlatList
            ref={list}
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={{ padding: 14, gap: 8, flexGrow: 1 }}
            ListEmptyComponent={<Text style={{ color: c.muted, textAlign: 'center', marginTop: 40 }}>No messages yet.</Text>}
            renderItem={({ item: m }) => {
              const mine = m.sender_type === 'customer';
              return (
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs, { backgroundColor: mine ? accent : c.field }]}>
                  {!mine && <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>{m.sender_name}{m.sender_role ? ` · ${m.sender_role}` : ''}</Text>}
                  {m.image_url ? <Image source={{ uri: m.image_url }} style={styles.img} contentFit="cover" /> : null}
                  {m.body ? <Text style={{ color: mine ? '#fff' : c.text, fontSize: 16 }}>{m.body}</Text> : null}
                  <Text style={{ color: mine ? '#ffffffbb' : c.muted, fontSize: 11, alignSelf: 'flex-end' }}>
                    {m.failed ? `Not sent: ${m.failed}` : m.pending ? 'Sending…' : fmtTime(new Date(m.created_at).toTimeString().slice(0, 5), timeFormat)}
                  </Text>
                </View>
              );
            }}
          />
        )}
        {q.isError && <View style={{ padding: 12 }}><Notice tone="error">{(q.error as Error).message}</Notice></View>}
        {err && <View style={{ padding: 12 }}><Notice tone="error">{err}</Notice></View>}
        {q.data && !q.data.enabled ? (
          <Text style={[styles.closed, { color: c.muted }]}>Chat isn’t available for this booking.</Text>
        ) : !open && q.data ? (
          <Text style={[styles.closed, { color: c.muted }]}>Chat opens when the team is on the job.</Text>
        ) : q.data ? (
          <View style={[styles.bar, { borderTopColor: c.border }]}>
            <Pressable onPress={sendPhoto} hitSlop={8} style={styles.icon}><Text style={{ fontSize: 22 }}>📷</Text></Pressable>
            <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={c.muted} multiline
              style={[styles.input, { color: c.text, backgroundColor: c.field }]} />
            <Pressable onPress={sendText} disabled={!text.trim()} style={[styles.send, { backgroundColor: accent, opacity: text.trim() ? 1 : 0.4 }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Send</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  who: { paddingHorizontal: 14, paddingVertical: 8, fontSize: 13, borderBottomWidth: StyleSheet.hairlineWidth },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  img: { width: 220, height: 220, borderRadius: 10 },
  closed: { textAlign: 'center', padding: 16 },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  icon: { paddingBottom: 8 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, maxHeight: 120 },
  send: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11 },
});
