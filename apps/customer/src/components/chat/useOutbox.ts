// Messages on their way from this phone. Each bubble shows at once; the sends
// run one after another so the thread is stored in the order typed / picked
// (web chatQueue), and a failure leaves the bubble red with "Tap to retry".
import { useCallback, useRef, useState } from 'react';

import type { PickedPhoto } from '@/components/chat/pickPhotos';
import { rememberPreview } from '@/components/chat/preview';
import type { ChatMessage } from '@/lib/extras';

type Sent = { message?: ChatMessage } | unknown;

export function useOutbox(refetch: () => Promise<unknown>) {
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  /** The photo behind each photo bubble, kept for its retry. */
  const photos = useRef(new Map<string, PickedPhoto>());

  const send = useCallback((msg: ChatMessage, go: () => Promise<Sent>, photo?: PickedPhoto) => {
    if (photo) photos.current.set(msg.id, photo);
    setLocal(l => [...l.filter(x => x.id !== msg.id), msg]);
    chain.current = chain.current.then(async () => {
      try {
        const r = await go();
        const stored = (r as { message?: ChatMessage } | undefined)?.message;
        if (photo) rememberPreview(stored?.image_url, photo.uri);
        await refetch().catch(() => {});
        photos.current.delete(msg.id);
        setLocal(l => l.filter(m => m.id !== msg.id));
      } catch (e) {
        const reason = (e as Error)?.message || 'Could not send — please try again.';
        setLocal(l => l.map(m => (m.id === msg.id ? { ...m, pending: false, failed: reason } : m)));
      }
    });
  }, [refetch]);

  const drop = useCallback((id: string) => {
    photos.current.delete(id);
    setLocal(l => l.filter(m => m.id !== id));
  }, []);

  /** Server rows first, then what is still on its way. */
  const merge = (server: ChatMessage[]) => {
    const ids = new Set(server.map(m => m.id));
    return [...server, ...local.filter(m => !ids.has(m.id))];
  };

  return { local, send, drop, merge, photoFor: (id: string) => photos.current.get(id) };
}
