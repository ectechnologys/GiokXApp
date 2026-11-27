// "Customer Service" — the general enquiry chat (web SupportChatModal). The
// first message is a request; it becomes a two-way chat once the business
// opens it.
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ChatThread } from '@/components/ChatThread';
import { markRead } from '@/lib/chatReads';
import { pickPhoto, supportList, supportRequest, supportSend, supportSendImage, uuid, type ChatMessage } from '@/lib/extras';
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
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const thread = q.data?.thread && q.data.thread.status !== 'closed' ? q.data.thread : null;
  const server = thread ? q.data?.messages ?? [] : [];
  const ids = new Set(server.map(m => m.id));
  const messages = [...server, ...local.filter(m => !ids.has(m.id))];
  const lastAt = server[server.length - 1]?.created_at;
  useEffect(() => { if (lastAt) markRead('s:support', lastAt); }, [lastAt]);

  const base = () => ({ id: uuid(), sender_type: 'customer' as const, sender_name: session!.customer.name, created_at: new Date().toISOString(), pending: true });
  const sendWith = async (msg: ChatMessage, go: () => Promise<unknown>) => {
    setErr(null);
    setLocal(l => [...l, msg]);
    try {
      await go();
      await queryClient.invalidateQueries({ queryKey: ['support'] });
      await q.refetch();
      setLocal(l => l.filter(m => m.id !== msg.id));
    } catch (e) {
      setLocal(l => l.map(m => (m.id === msg.id ? { ...m, pending: false, failed: (e as Error).message } : m)));
    }
  };

  const allowed = q.data?.allowed !== false;
  const pending = thread?.status === 'pending';
  const canSend = allowed && (!thread || thread.status === 'open');

  return (
    <ChatThread
      id="s:support"
      name={t('Customer Service')}
      subtitle={pending ? t('Waiting for the team to open this chat') : !thread ? t('Ask about anything — prices, invoices, a visit') : undefined}
      channel="web"
      messages={messages}
      loading={q.isPending}
      error={err ?? (q.isError ? (q.error as Error).message : null)}
      canSend={canSend}
      notice={!allowed ? t('Chat isn’t available right now.') : pending ? t("We've got your message — the team will open this chat shortly.") : null}
      placeholder={!thread ? t('Write your question…') : undefined}
      timeFormat={timeFormat}
      onSendText={body => {
        const m = { ...base(), body };
        void sendWith(m, () => (thread ? supportSend(token, thread.id, body, m.id) : supportRequest(token, body)));
      }}
      onSendPhoto={thread ? async () => {
        try {
          const f = await pickPhoto('library');
          if (!f) return;
          const m = { ...base(), body: '', image_url: f.uri };
          void sendWith(m, () => supportSendImage(token, thread.id, f, m.id));
        } catch (e) { setErr((e as Error).message); }
      } : undefined}
    />
  );
}
