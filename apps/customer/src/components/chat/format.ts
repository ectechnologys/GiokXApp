// Labels and colours for the conversation screen, copied from the web
// ChatPanel "workspace" look (src/components/ChatPanel.tsx).
import type { ChatMessage } from '@/lib/extras';
import { t } from '@/lib/i18n';

/** Fields the server may send that the app's ChatMessage type leaves out. */
export type Msg = ChatMessage & {
  sender_id?: string | null;
  file_mime?: string | null;
  delivery_status?: 'sent' | 'delivered' | 'read' | 'failed' | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "1:05 PM" (12h) or "13:05" (24h), like the web fmtMsgTime. */
export function fmtMsgTime(iso: string, timeFormat: '12h' | '24h'): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  if (timeFormat === '24h') return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Today", "Yesterday", a weekday this week, else "5 November 2026". */
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const a = new Date(d); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  const ago = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (ago <= 0) return t('Today');
  if (ago === 1) return t('Yesterday');
  if (ago < 7) return t(WEEKDAYS[d.getDay()]);
  return `${d.getDate()} ${t(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
}

// One name colour per person in a chat (web --cw-name-0..8, light theme).
const NAME_COLOURS = ['#0f9f7a', '#c2410c', '#7c3aed', '#db2777', '#2563eb', '#0e7490', '#4d7c0f', '#b91c1c', '#a16207'];
const personKey = (m: Msg) => `${m.sender_type}:${m.sender_id ?? m.sender_name ?? ''}`;

export function nameSlots(messages: Msg[]): Map<string, number> {
  const keys = [...new Set(messages.filter(m => m.sender_type !== 'customer').map(personKey))].sort();
  const used = new Set<number>();
  const out = new Map<string, number>();
  for (const k of keys) {
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    let slot = h % NAME_COLOURS.length;
    for (let n = 0; n < NAME_COLOURS.length && used.has(slot); n++) slot = (slot + 1) % NAME_COLOURS.length;
    used.add(slot);
    out.set(k, slot);
  }
  return out;
}

export function nameColour(m: Msg, slots: Map<string, number>, accent: string) {
  if (m.sender_type === 'customer') return accent;
  return NAME_COLOURS[slots.get(personKey(m)) ?? 0];
}

/** "Team" / "Driver" after a crew member's name; the office has none. */
export function roleLabel(m: Msg): string | null {
  if (m.sender_type === 'admin') return null;
  if (m.sender_type === 'customer') return 'Customer';
  return m.sender_role === 'driver' ? 'Driver' : 'Team';
}

export function senderName(m: Msg) {
  return m.sender_type === 'admin' ? (m.sender_name || t('Office')) : m.sender_name;
}

/** Who wrote it, for grouping a run of messages under one name. */
export const whoKey = (m: Msg) => (m.sender_type === 'staff' ? `staff:${m.sender_id ?? m.sender_name}` : String(m.sender_type));

const IMG_NAME = /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i;
const AUDIO_EXT = /\.(ogg|opus|oga|m4a|mp3|aac|amr|wav|webm)(\?|$)/i;
const VIDEO_EXT = /\.(mp4|mov|m4v|3gp)(\?|$)/i;

export const isImageName = (s: string) => IMG_NAME.test(s.trim());
export const isAudioLabel = (b: string) => /^🎤|^voice message|\.(ogg|opus|oga|m4a|mp3|aac|amr|wav|webm)$/i.test(b.trim());
export const isAudio = (m: Msg) => !!m.file_url && ((m.file_mime ?? '').startsWith('audio/') || AUDIO_EXT.test(m.file_name || m.file_url));
export const isVideo = (m: Msg) => !!m.file_url && ((m.file_mime ?? '').startsWith('video/') || VIDEO_EXT.test(m.file_name || m.file_url));
export const isPdf = (m: Msg) => /pdf/i.test(m.file_mime ?? '') || /\.pdf(\?|$)/i.test(m.file_name || m.file_url || '');

/** Photos sent together share one bubble (web album): no caption, no reply. */
export const albumable = (m: Msg) => !!m.image_url && !m.reply_to_id && !m.failed && !m.deleted_at
  && (!m.body?.trim() || isImageName(m.body));

/** Short text standing in for a message inside a quote. */
export function quoteSnippet(m: Msg): string {
  if (m.image_url) return m.body && !isImageName(m.body) ? `📷 ${m.body}` : `📷 ${t('Photo')}`;
  if (isAudio(m)) return `🎤 ${t('Voice message')}`;
  if (m.file_url) return `📎 ${m.file_name || m.body || t('Attachment')}`;
  return m.body || t('Message');
}

export type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; m: Msg; mine: boolean; first: boolean }
  | { kind: 'album'; key: string; items: Msg[]; mine: boolean; first: boolean };

/** Day separators, runs from one sender (the tail sits on the first) and
 *  photo albums, in the web's order. */
export function buildRows(messages: Msg[]): Row[] {
  const out: Row[] = [];
  let lastDay = '', lastSender = '';
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const mine = m.sender_type === 'customer';
    const day = dayKey(m.created_at);
    if (day !== lastDay) {
      lastDay = day; lastSender = '';
      out.push({ kind: 'day', key: `d-${m.id}`, label: dayLabel(m.created_at) });
    }
    const sender = mine ? 'me' : whoKey(m);
    const first = sender !== lastSender;
    lastSender = sender;
    if (albumable(m)) {
      const album = [m];
      while (i + album.length < messages.length) {
        const nx = messages[i + album.length], prev = album[album.length - 1];
        if (!albumable(nx) || whoKey(nx) !== whoKey(m) || dayKey(nx.created_at) !== day
          || Math.abs(new Date(nx.created_at).getTime() - new Date(prev.created_at).getTime()) > 60_000) break;
        album.push(nx);
      }
      if (album.length > 1) {
        i += album.length - 1;
        out.push({ kind: 'album', key: m.id, items: album, mine, first });
        continue;
      }
    }
    out.push({ kind: 'msg', key: m.id, m, mine, first });
  }
  return out;
}
