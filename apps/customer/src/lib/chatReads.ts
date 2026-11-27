// "Read up to" stamps per chat on this phone, so the Chats list can show which
// conversations have a new message (web: localStorage chat reads).
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { tenant } from '@/config/tenant';

const KEY = `chat_reads_${tenant.slug}`;
let reads: Record<string, string> = {};
const subs = new Set<() => void>();
SecureStore.getItemAsync(KEY).then(v => { if (v) { reads = JSON.parse(v); subs.forEach(f => f()); } }).catch(() => {});

export function markRead(id: string, upTo: string) {
  if (reads[id] && reads[id] >= upTo) return;
  reads = { ...reads, [id]: upTo };
  SecureStore.setItemAsync(KEY, JSON.stringify(reads)).catch(() => {});
  subs.forEach(f => f());
}

export function useChatReads() {
  return useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => reads);
}
