// "Customer Service" — the general enquiry chat (web SupportChatModal). The
// first message is a request; it becomes a two-way chat once the business
// opens it.
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ChatThread } from '@/components/ChatThread';
import type { PickedPhoto } from '@/components/chat/pickPhotos';
import { useOutbox } from '@/components/chat/useOutbox';
import { markRead } from '@/lib/chatReads';
import { supportList, supportRequest, supportSend, supportSendImage, uuid, type ChatMessage } from '@/lib/extras';
import { useT } from '@/lib/i18n';
import { queryClient } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';

export default function Support() {
  const { t } = useT();
  const { session } = useSession();
  const token = session!.token;
  const timeFormat = useDisplaySettings().data?.timeFormat ?? '12h';
  const q = useQuery({ queryKey: ['support'], queryFn: () => supportList(token), refetchInterval: 4000 });
  const [err, setErr] = useState<string | null>(null);
  const refetch = useCallback(() => queryClient.invalidateQueries({ queryKey: ['support'] }), []);
  const outbox = useOutbox(refetch);

  const thread = q.data?.thread && q.data.thread.status !== 'closed' ? q.data.thread : null;
  const server = thread ? q.data?.messages ?? [] : [];
  const messages = outbox.merge(server);
  const lastAt = server[server.length - 1]?.created_at;
  useEffect(() => { if (lastAt) markRead('s:support', lastAt); }, [lastAt]);

  const base = (at = new Date()): ChatMessage => ({ id: uuid(), sender_type: 'customer', sender_name: session!.customer.name, body: '', created_at: at.toISOString(), pending: true });

  const sendText = (m: ChatMessage) => {
    setErr(null);
    outbox.send(m, () => (thread ? supportSend(token, thread.id, m.body, m.id) : supportRequest(token, m.body)));
  };
  const sendPhoto = (m: ChatMessage, f: PickedPhoto) => {
    if (!thread) return;
    setErr(null);
    outbox.send(m, () => supportSendImage(token, thread.id, f, m.id), f);
  };

  const allowed = q.data?.allowed !== false;
  const status = thread?.status;
  const pending = status === 'pending';
  const canSend = allowed && (!thread || status === 'open');

  return (
    <ChatThread
      id="s:support"
      name={t('Customer Service')}
      subtitle={status === 'open' ? t('The team can reply here') : pending ? t('Waiting for the team to open this chat') : t('Ask us anything — we reply here')}
      channel="web"
      banner={pending ? (
        <View style={styles.pending}>
          <Text style={styles.pendingText}>{t("Request sent. We'll open this chat shortly — no need to send it again.")}</Text>
        </View>
      ) : null}
      messages={messages}
      loading={q.isPending}
      error={err ?? (q.isError ? t((q.error as Error).message) : null)}
      canSend={canSend}
      closedNote={!allowed ? t("Messaging isn't available right now. Please call us instead.") : pending ? t('You can write again once the team opens the chat.') : null}
      emptyHint={!thread ? t("We'll open the chat as soon as someone picks it up, and you'll see their reply here.") : undefined}
      placeholder={!thread ? t('Type your question…') : undefined}
      timeFormat={timeFormat}
      onSendText={body => sendText({ ...base(), body })}
      onSendPhotos={thread ? files => {
        const now = Date.now();
        files.forEach((f, i) => sendPhoto({ ...base(new Date(now + i)), image_url: f.uri }, f));
      } : undefined}
      onRetry={m => {
        const f = outbox.photoFor(m.id);
        outbox.drop(m.id);
        if (f) sendPhoto({ ...base(), image_url: f.uri }, f);
        else if (m.body) sendText({ ...m, failed: null, pending: true, created_at: new Date().toISOString() });
      }}
      onError={setErr}
    />
  );
}

const styles = StyleSheet.create({
  pending: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fffbeb', borderBottomWidth: 1, borderBottomColor: '#fef3c7' },
  pendingText: { fontSize: 12, color: '#92400e' },
});
