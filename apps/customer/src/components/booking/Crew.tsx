// "Assigned crew" popup from the booking card (web CrewModal): each team
// member / driver with full name, ID and van plate, plus a one-tap copy so the
// customer can check who's at the door. get-bookings only sends the crew once
// the company's reveal rule allows it, so the button shows only then.
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BookingAssignee } from '@/lib/api';
import { t } from '@/lib/i18n';
import { accent, accentSoft, gray } from '@/lib/theme';

export function CrewModal({ assignees, visible, onClose }: { assignees: BookingAssignee[]; visible: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState<number | null>(null);
  // Team members first, drivers after.
  const ordered = [...assignees].sort((a, b) => (a.role.startsWith('Team') ? 0 : 1) - (b.role.startsWith('Team') ? 0 : 1));
  const copy = async (i: number, a: BookingAssignee) => {
    const text = [a.name || a.nickname, a.id && `ID: ${a.id}`, a.vehicle && `Vehicle: ${a.vehicle}`].filter(Boolean).join(' · ');
    await Clipboard.setStringAsync(text);
    setCopied(i);
    setTimeout(() => setCopied(c => (c === i ? null : c)), 1500);
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose}>
        <Pressable style={st.card} onPress={() => {}}>
          <View style={st.head}>
            <View style={st.headL}>
              <Users size={16} color={accent} strokeWidth={2.25} />
              <Text style={st.title}>{t('Assigned crew')}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('Close')}><X size={18} color={gray[400]} strokeWidth={2} /></Pressable>
          </View>
          <View style={st.body}>
            {ordered.map((a, i) => (
              <View key={i} style={st.row}>
                <View style={st.role}><Text style={st.roleText}>{t(a.role).toUpperCase()}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.name} numberOfLines={1}>{a.name || a.nickname || '—'}</Text>
                  {!!a.id && <Text style={st.mono} numberOfLines={1}>ID: {a.id}</Text>}
                  {!!a.vehicle && <Text style={st.mono} numberOfLines={1}>{t('Vehicle')}: {a.vehicle}</Text>}
                </View>
                <Pressable onPress={() => copy(i, a)} hitSlop={8} style={{ padding: 4 }} accessibilityLabel={t('Copy name & ID')}>
                  {copied === i ? <Check size={16} color="#16a34a" strokeWidth={2.5} /> : <Copy size={16} color={gray[400]} strokeWidth={2} />}
                </Pressable>
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 384, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: gray[100] },
  headL: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700', color: gray[900] },
  body: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  role: { backgroundColor: accentSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  roleText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: accent },
  name: { fontSize: 14, fontWeight: '500', color: gray[800] },
  mono: { fontSize: 12, color: gray[500], fontFamily: 'monospace' },
});
