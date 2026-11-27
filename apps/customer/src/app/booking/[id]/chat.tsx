// Chat with the team on one booking (web CustomerChatModal). Sendable while a
// team member is live on the job; read-only before and after. Polls every 4 s.
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ChatThread } from '@/components/ChatThread';
import { markRead } from '@/lib/chatReads';
import { chatList, chatSend, chatSendImage, pickPhoto, uuid, type ChatMessage } from '@/lib/extras';
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
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const server = q.data?.messages ?? [];
  const ids = new Set(server.map(m => m.id));
  const messages = [...server, ...local.filter(m => !ids.has(m.id))];
  const lastAt = server[server.length - 1]?.created_at;
  useEffect(() => { if (lastAt) markRead(`b:${id}`, lastAt); }, [id, lastAt]);

  const sendWith = async (msg: ChatMessage, go: () => Promise<unknown>) => {
    setLocal(l => [...l, msg]);
    try {
      await go();
      await q.refetch();
      setLocal(l => l.filter(m => m.id !== msg.id));
    } catch (e) {
      setLocal(l => l.map(m => (m.id === msg.id ? { ...m, pending: false, failed: (e as Error).message } : m)));
    }
  };

  const base = () => ({ id: uuid(), sender_type: 'customer' as const, sender_name: session!.customer.name, created_at: new Date().toISOString(), pending: true });

  const who = (q.data?.participants ?? []).map(p => p.name).join(', ');
  const open = !!q.data?.open;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatThread
        id={`b:${id}`}
        name={b?.service_name || t('Booking')}
        subtitle={who || (b ? `${fmtBookingDate(b.booking_date)} · ${fmtBookingTime(b.start_time, timeFormat)}` : undefined)}
        channel="booking"
        messages={messages}
        loading={q.isPending}
        error={err ?? (q.isError ? (q.error as Error).message : null)}
        canSend={open}
        notice={q.data && !q.data.enabled ? t('Chat isn’t available for this booking.') : q.data && !open ? t('Chat opens when the team is on the job.') : null}
        timeFormat={timeFormat}
        onSendText={body => { const m = { ...base(), body }; void sendWith(m, () => chatSend(token, id, body, m.id, m.created_at)); }}
        onSendPhoto={async () => {
          setErr(null);
          try {
            const f = await pickPhoto('library');
            if (!f) return;
            const m = { ...base(), body: '', image_url: f.uri };
            void sendWith(m, () => chatSendImage(token, id, f, m.id, m.created_at));
          } catch (e) { setErr((e as Error).message); }
        }}
      />
    </>
  );
}
