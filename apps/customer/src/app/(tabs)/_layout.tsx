// The web portal's bottom bar: Booking · Appt. · Chat · Credits · Account.
// Icon over label; the current one is accent + bold with a short bar on top.
// Booking opens the booking page (like the web, where it is a link out).
import { Tabs, router } from 'expo-router';
import { CalendarDays, CalendarPlus, Coins, MessageCircle, User } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '@/lib/i18n';
import { useCoins } from '@/lib/queries';
import { useDisplaySettings } from '@/lib/settings';
import { accent, gray } from '@/lib/theme';

function Item({ label, icon, active, onPress }: { label: string; icon: (c: string) => ReactNode; active?: boolean; onPress: () => void }) {
  const color = active ? accent : gray[700];
  return (
    <Pressable onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: !!active }}>
      {active && <View style={styles.mark} />}
      {icon(color)}
      <Text style={[styles.label, { color, fontWeight: active ? '700' : '500' }]}>{label}</Text>
    </Pressable>
  );
}

export const unstable_settings = { initialRouteName: 'index' };

export default function TabsLayout() {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const coins = useCoins().data;
  const coinsOn = coins?.enabled === true;
  const chatOn = useDisplaySettings().data?.chatEnabled !== false;
  const pointsName = coins?.points_name ?? '';
  const pointsShort = pointsName.split(' ').filter(Boolean).slice(-1)[0] || pointsName;
  // The web bar sits under the keyboard; here it would ride on top of it.
  const [kb, setKb] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setKb(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setKb(false));
    return () => { a.remove(); b.remove(); };
  }, []);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigateToTab }) => {
        if (kb) return null;
        const current = state.routes[state.index]?.name;
        const go = (name: string) => { const r = state.routes.find(x => x.name === name); if (r) navigateToTab(r.key); };
        return (
          <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <Item label={t('Booking')} icon={c => <CalendarPlus size={20} color={c} strokeWidth={2} />} onPress={() => router.push('/book')} />
            <Item label={t('Appt.')} icon={c => <CalendarDays size={20} color={c} strokeWidth={2} />} active={current === 'index'} onPress={() => go('index')} />
            {chatOn && <Item label={t('Chat')} icon={c => <MessageCircle size={20} color={c} strokeWidth={2} />} active={current === 'chats'} onPress={() => go('chats')} />}
            {coinsOn && <Item label={pointsShort} icon={c => <Coins size={20} color={c} strokeWidth={2} />} active={current === 'credits'} onPress={() => go('credits')} />}
            <Item label={t('Account')} icon={c => <User size={20} color={c} strokeWidth={2} />} active={current === 'account'} onPress={() => go('account')} />
          </View>
        );
      }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="credits" />
      <Tabs.Screen name="account" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: gray[200], paddingTop: 10, paddingHorizontal: 12, gap: 4 },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  mark: { position: 'absolute', top: -10, left: 12, right: 12, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: accent },
  label: { fontSize: 11 },
});
