// Pieces of the web ChatWorkspace look (light theme, tenant accent).
import { CalendarDays, Globe } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { accent, rgba } from '@/lib/theme';

export const cw = {
  line: '#e8edf5', text: '#0e1425', sub: '#6b7488', muted: '#98a1b3', field: '#f1f4f9', chip: '#eef2f8', chipText: '#4a5468',
  bg: '#eef3fa', theirs: '#ffffff', tag: '#fff4d6', tagText: '#8a5a00', warn: '#fff7e6', warnText: '#8a5a00', danger: '#e5484d',
  accent, accentSoft: rgba(accent, 0.14), sel: rgba(accent, 0.1),
};

const AV = [
  ['#dbe9ff', '#1557b0'], ['#ffe3d6', '#9a3d16'], ['#dcf5e8', '#126b45'],
  ['#ece6ff', '#5b3fc4'], ['#fde7f1', '#a12a62'], ['#e3f4fb', '#0b6b8f'],
];

function slot(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 6;
}

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (/^\d/.test(words[0])) return '#';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

export function ChatAvatar({ id, name, channel, size = 44 }: { id: string; name: string; channel: 'web' | 'booking'; size?: number }) {
  const [bg, fg] = AV[slot(id)];
  // Web WsAvatar: a white disc at the bottom right with the channel icon in
  // its colour (calendar in the accent for a booking, globe in amber for an
  // enquiry).
  const badge = channel === 'booking'
    ? <CalendarDays size={12} color={accent} strokeWidth={2.4} />
    : <Globe size={12} color="#d97706" strokeWidth={2.4} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: fg, fontSize: size * 0.34, fontWeight: '600' }}>{initials(name)}</Text>
      <View style={styles.badge}>{badge}</View>
    </View>
  );
}

/** "9:41 AM" today, "Yesterday", weekday this week, else d/m/yy (web whenLabel). */
export function whenLabel(iso: string, timeFormat: '12h' | '24h' = '12h') {
  if (!iso) return '';
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ago = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (ago <= 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: timeFormat !== '24h' });
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'numeric', year: '2-digit' });
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', right: -2, bottom: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
