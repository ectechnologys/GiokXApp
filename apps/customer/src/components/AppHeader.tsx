// The web portal's top bar: logo with "MY ACCOUNT" / "BOOK ONLINE" under it,
// EN | 中文 switch, (booking: points chip), avatar menu with Sign out.
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Coins, LogOut, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { loadLangConfig, useT } from '@/lib/i18n';
import { useProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { accent, accentSoft, gray } from '@/lib/theme';

const wordmark = require('@/assets/tenant/wordmark.png');

export function LangSwitch() {
  const { lang, setLang, allowed } = useT();
  useEffect(() => { loadLangConfig(); }, []);
  if (!allowed) return null;
  return (
    <View style={styles.lang}>
      {(['en', 'zh'] as const).map(v => (
        <Pressable key={v} onPress={() => setLang(v)} style={[styles.langBtn, lang === v && styles.langOn]}>
          <Text style={[styles.langText, { color: lang === v ? '#fff' : gray[600] }]}>{v === 'en' ? 'EN' : '中文'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function AppHeader({ kicker = 'My account', points, ground }: {
  kicker?: string;
  /** Booking page: the customer's points balance chip. */
  points?: number | null;
  /** Background behind the safe area (the page colour). */
  ground?: string;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useSession();
  const name = useProfile().data?.customer.name ?? session?.customer.name ?? '';
  const [menu, setMenu] = useState(false);
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 10, backgroundColor: ground ?? '#fff' }]}>
      <View style={styles.inner}>
        <Pressable onPress={() => router.navigate('/')} style={styles.brand}>
          <Image source={wordmark} style={styles.logo} contentFit="contain" />
          <Text style={styles.kicker}>{t(kicker).toUpperCase()}</Text>
        </Pressable>
        <View style={styles.right}>
          <LangSwitch />
          {points != null && (
            <Pressable onPress={() => router.navigate('/credits')} style={styles.points}>
              <Coins size={13} color="#b45309" strokeWidth={2.5} />
              <Text style={styles.pointsText}>{points.toLocaleString('en-MY', { maximumFractionDigits: 2 })}</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setMenu(true)} style={styles.avatarBtn} accessibilityLabel={t('Account menu')}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{name.charAt(0).toUpperCase() || '?'}</Text></View>
            <Svg width={10} height={10} viewBox="0 0 24 24"><Path d="M6 9l6 6 6-6" stroke={gray[500]} strokeWidth={2.5} strokeLinecap="round" fill="none" /></Svg>
          </Pressable>
        </View>
      </View>
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)}>
          <View style={[styles.menu, { top: insets.top + 60 }]}>
            <Pressable onPress={() => { setMenu(false); router.navigate('/account'); }} style={styles.menuItem}>
              <User size={14} color={gray[700]} strokeWidth={2} />
              <Text style={[styles.menuText, { color: gray[700] }]}>{t('My account')}</Text>
            </Pressable>
            <Pressable onPress={() => { setMenu(false); signOut(); }} style={styles.menuItem}>
              <LogOut size={14} color="#dc2626" strokeWidth={2} />
              <Text style={[styles.menuText, { color: '#dc2626' }]}>{t('Sign out')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: 1, borderBottomColor: gray[100] },
  inner: { paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brand: { alignItems: 'center', gap: 3 },
  logo: { height: 36, width: 119 },
  kicker: { fontSize: 9.5, fontWeight: '700', letterSpacing: 2.1, color: gray[400] },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lang: { flexDirection: 'row', borderWidth: 1, borderColor: gray[200], borderRadius: 999, padding: 2, backgroundColor: '#fff' },
  langBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  langOn: { backgroundColor: gray[900] },
  langText: { fontSize: 12, fontWeight: '500' },
  points: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.35)',
  },
  pointsText: { fontSize: 12, fontWeight: '700', color: '#b45309', fontVariant: ['tabular-nums'] },
  avatarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: gray[200], borderRadius: 999, paddingLeft: 4, paddingRight: 12, paddingVertical: 4 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10.5, fontWeight: '700', color: accent },
  menu: {
    position: 'absolute', right: 16, minWidth: 160, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: gray[100], padding: 4,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  menuText: { fontSize: 13, fontWeight: '500' },
});
