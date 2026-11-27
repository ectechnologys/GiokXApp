// Building blocks that copy the web portal's look (Tailwind classes noted).
import { LinearGradient } from 'expo-linear-gradient';
import { Crown } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { tenant } from '@/config/tenant';
import { fmtDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { accent, badgeColors, gray, heroColors } from '@/lib/theme';

/** bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-5 */
export function WCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** text-[11px] font-bold uppercase tracking-wider text-gray-400 */
export function SectionLabel({ children, style }: { children: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.label}>{children.toUpperCase()}</Text>
    </View>
  );
}

/** text-[10px] font-bold uppercase tracking-wider rounded-full px-1.5 py-0.5 ring-1 */
export function Badge({ label }: { label: string }) {
  const c = badgeColors(label);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.ring }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** Account hero: dark navy gradient + accent glow, avatar initial, name,
 *  phone, member pill (web CustomerProfilePage hero). */
export function Hero({ name, phone, member, right }: {
  name: string;
  phone?: string | null;
  member?: { active: boolean; start?: string | null; expires?: string | null } | null;
  right?: ReactNode;
}) {
  return (
    <View style={styles.hero}>
      <LinearGradient colors={heroColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Soft accent glows (web: blurred orbs at 22% / 12%). */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="g1" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.34} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="g2" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.2} />
            <Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="92%" cy="0%" r="210" fill="url(#g1)" />
        <Circle cx="0%" cy="105%" r="180" fill="url(#g2)" />
      </Svg>
      <Text style={styles.heroKicker}>
        {tenant.name.toUpperCase()}{member?.active ? ' · MEMBER ACCOUNT' : ''}
      </Text>
      <View style={styles.heroRow}>
        <LinearGradient colors={[accent, 'rgba(255,255,255,0.25)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
          <Text style={styles.avatarText}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.heroName} numberOfLines={1}>{name}</Text>
          {phone ? <Text style={styles.heroPhone}>{formatPhone(phone)}</Text> : null}
        </View>
        {right}
      </View>
      {member && (
        <View style={styles.pill}>
          <Crown size={12} color={member.active ? accent : 'rgba(255,255,255,0.6)'} strokeWidth={2.5} />
          <Text style={[styles.pillText, { color: member.active ? accent : 'rgba(255,255,255,0.6)' }]}>
            MEMBER · {member.active ? 'ACTIVE' : 'LAPSED'}
          </Text>
          {member.start && member.expires ? (
            <Text style={styles.pillDates}>{fmtDate(member.start)} → {fmtDate(member.expires)}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, gap: 8, borderWidth: 1, borderColor: gray[100],
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, color: gray[400] },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  hero: { borderRadius: 24, padding: 22, paddingTop: 18, overflow: 'hidden', gap: 14 },
  heroKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2.6, color: 'rgba(255,255,255,0.45)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  heroName: { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  heroPhone: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3, letterSpacing: 1.6, fontFamily: 'monospace' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', flexWrap: 'wrap',
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  pillDates: { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
});
