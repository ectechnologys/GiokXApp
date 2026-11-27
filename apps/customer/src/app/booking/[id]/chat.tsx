// Chat with the team on one booking (web CustomerChatModal). Sendable while a
// team member is live on the job; read-only before and after. Polls every 4 s.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Car, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatThread, CrewStrip } from '@/components/ChatThread';
import type { PickedPhoto } from '@/components/chat/pickPhotos';
import { useOutbox } from '@/components/chat/useOutbox';
import { markRead } from '@/lib/chatReads';
import { chatList, chatSend, chatSendImage, uuid, type ChatMessage } from '@/lib/extras';
import { fmtBookingDate, fmtBookingTime, useT } from '@/lib/i18n';
import { useBookings } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';

export default function BookingChat() {
  const { t } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const token = session!.token;
  const timeFormat = useDisplaySettings().data?.timeFormat ?? '12h';
  const b = useBookings().data?.find(x => x.id === id);
  const q = useQuery({ queryKey: ['chat', id], queryFn: () => chatList(token, id), refetchInterval: 4000 });
  const [err, setErr] = useState<string | null>(null);
  const outbox = useOutbox(q.refetch);

  const server = q.data?.messages ?? [];
  const messages = outbox.merge(server);
  const lastAt = server[server.length - 1]?.created_at;
  useEffect(() => { if (lastAt) markRead(`b:${id}`, lastAt); }, [id, lastAt]);

  const base = (at = new Date()): ChatMessage => ({ id: uuid(), sender_type: 'customer', sender_name: session!.customer.name, body: '', created_at: at.toISOString(), pending: true });
  const sendText = (m: ChatMessage) => { setErr(null); outbox.send(m, () => chatSend(token, id, m.body, m.id, m.created_at)); };
  const sendPhoto = (m: ChatMessage, f: PickedPhoto) => { setErr(null); outbox.send(m, () => chatSendImage(token, id, f, m.id, m.created_at), f); };

  // Who is on the job, as the web crew strip lists them.
  const people = q.data?.participants ?? [];
  const team = people.filter(p => p.role === 'Team').map(p => p.name);
  const legs = ([['Send', 'Driver · Send'], ['Pickup', 'Driver · Pickup'], ['', 'Driver']] as const)
    .map(([tag, role]) => [tag, people.filter(p => p.role === role).map(p => p.name)] as const)
    .filter(([, names]) => names.length > 0);
  const crew = team.length || legs.length ? (
    <CrewStrip>
      <View style={styles.crew}>
        {team.length ? (
          <View style={styles.crewItem}>
            <Users size={12} color="#9ca3af" strokeWidth={2} />
            <Text style={styles.crewText} numberOfLines={1}>{team.join(', ')}</Text>
          </View>
        ) : null}
        {legs.map(([tag, names]) => (
          <View key={tag || 'driver'} style={styles.crewItem}>
            <Car size={12} color="#9ca3af" strokeWidth={2} />
            {tag ? <Text style={styles.crewTag}>{t(tag).toUpperCase()}</Text> : null}
            <Text style={styles.crewText} numberOfLines={1}>{names.join(', ')}</Text>
          </View>
        ))}
      </View>
    </CrewStrip>
  ) : null;

  const open = !!q.data?.open;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatThread
        id={`b:${id}`}
        name={b?.service_name || t('Booking')}
        subtitle={b ? `${fmtBookingDate(b.booking_date)} · ${fmtBookingTime(b.start_time, timeFormat)}` : undefined}
        channel="booking"
        banner={crew}
        messages={messages}
        loading={q.isPending}
        error={err ?? (q.isError ? t((q.error as Error).message) : null)}
        canSend={open}
        closedNote={!q.data ? null
          : !q.data.enabled ? t('Chat isn’t available for this booking.')
          : server.length ? t('This chat closed when the job was completed.')
          : t('Chat opens when the team is on the job.')}
        timeFormat={timeFormat}
        onSendText={body => sendText({ ...base(), body })}
        onSendPhotos={files => {
          const now = Date.now();
          files.forEach((f, i) => sendPhoto({ ...base(new Date(now + i)), image_url: f.uri }, f));
        }}
        onRetry={m => {
          const f = outbox.photoFor(m.id);
          outbox.drop(m.id);
          if (f) sendPhoto({ ...base(), image_url: f.uri }, f);
          else if (m.body) sendText({ ...m, failed: null, pending: true, created_at: new Date().toISOString() });
        }}
        onError={setErr}
      />
    </>
  );
}

const styles = StyleSheet.create({
  crew: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 2 },
  crewItem: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0, flexShrink: 1 },
  crewTag: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, color: '#9ca3af' },
  crewText: { fontSize: 11, color: '#6b7280', flexShrink: 1 },
});
