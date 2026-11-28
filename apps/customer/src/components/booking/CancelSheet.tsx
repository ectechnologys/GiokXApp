// "Cancel this booking?" — the web's cancel dialog (CustomerProfilePage
// cancelTarget): red ✕ tile, service · date · time, the refund note, the amber
// cancellation-fee note, and Keep booking / Cancel booking. Slides up from the
// bottom like the web does on a phone.
import { X } from 'lucide-react-native';
import { Fragment, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CustomerBooking } from '@/lib/api';
import { fmtBookingDate, fmtBookingTime, useT } from '@/lib/i18n';
import { gray } from '@/lib/theme';

/** t() with some placeholders rendered bold (web `fill`). */
function fill(template: string, parts: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((seg, i) => {
    const k = seg.match(/^\{(\w+)\}$/)?.[1];
    return k && k in parts ? <Fragment key={i}>{parts[k]}</Fragment> : seg;
  });
}

const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface FeePreview { fee: number; net: number; hours: number; fromCredit: boolean }

export function CancelSheet({ b, fee, pointsName, timeFormat, busy, err, onKeep, onCancel }: {
  b: CustomerBooking | null;
  fee: FeePreview | null;
  pointsName: string;
  timeFormat: '12h' | '24h';
  busy: boolean;
  err: string | null;
  onKeep: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const pts = pointsName || t('points');
  const B = (s: string) => <Text style={st.b}>{s}</Text>;
  const paid = b && (b.payment_status === 'paid' || b.payment_status === 'cash');

  return (
    <Modal visible={!!b} transparent animationType="slide" onRequestClose={() => { if (!busy) onKeep(); }} statusBarTranslucent>
      <Pressable style={st.backdrop} onPress={() => { if (!busy) onKeep(); }} />
      {b && (
        <View style={[st.sheet, { paddingBottom: 20 + insets.bottom }]}>
          <View style={st.head}>
            <View style={st.icon}><X size={16} color="#ef4444" strokeWidth={2.5} /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.title}>{t('Cancel this booking?')}</Text>
              <Text style={st.sub}>{t(b.service_name)} · {fmtBookingDate(b.booking_date)} · {fmtBookingTime(b.start_time, timeFormat)}</Text>
            </View>
          </View>

          <View style={st.info}>
            <Text style={st.infoText}>
              {paid
                ? fill(t("You've paid {amount} for this booking. It'll be returned to your account as {points} you can use on your next booking — no cash refund.", { points: pts }), { amount: B(`RM ${b.total_amount.toLocaleString()}`) })
                : b.redeemed_amount > 0
                  ? fill(t('The {amount} {points} you redeemed will be returned to your account.', { points: pts }), { amount: B(b.redeemed_amount.toLocaleString()) })
                  : t('This booking will be cancelled. Any {points} you paid are returned to your account.', { points: pts })}
            </Text>
          </View>

          {fee && (
            <View style={st.fee}>
              <Text style={st.feeText}>
                {fee.hours > 0
                  ? fill(t('A {fee} cancellation fee applies for cancelling within {hours} of the booking time.'), {
                    fee: B(rm(fee.fee)), hours: B(fee.hours === 1 ? t('1 hour') : t('{n} hours', { n: fee.hours })),
                  })
                  : fill(t('A {fee} cancellation fee applies for cancelling this booking.'), { fee: B(rm(fee.fee)) })}
                {' '}
                {fee.fromCredit
                  ? t("It's deducted from your account credit — if your balance is short, you'll be asked to top up first.")
                  : t("It's deducted from your {points} wallet.", { points: pts })}
              </Text>
            </View>
          )}

          {!!err && <View style={st.err}><Text style={st.errText}>{err}</Text></View>}

          <View style={st.btns}>
            <Pressable onPress={onKeep} disabled={busy} style={({ pressed }) => [st.keep, pressed && { backgroundColor: gray[50] }, busy && { opacity: 0.5 }]}>
              <Text style={st.keepText}>{t('Keep booking')}</Text>
            </Pressable>
            <Pressable onPress={onCancel} disabled={busy} style={({ pressed }) => [st.go, pressed && { backgroundColor: '#dc2626' }, busy && { opacity: 0.6 }]}>
              {busy
                ? <><ActivityIndicator size="small" color="#fff" /><Text style={st.goText}>{t('Cancelling…')}</Text></>
                : <Text style={st.goText}>{t('Cancel booking')}</Text>}
            </Pressable>
          </View>
        </View>
      )}
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: gray[900] },
  sub: { fontSize: 12, color: gray[500], marginTop: 2 },
  info: { borderRadius: 12, backgroundColor: gray[50], borderWidth: 1, borderColor: gray[100], paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  infoText: { fontSize: 12, color: gray[600], lineHeight: 19 },
  fee: { borderRadius: 12, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 },
  feeText: { fontSize: 12, color: '#b45309', lineHeight: 19 },
  b: { fontWeight: '700' },
  err: { borderRadius: 8, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fee2e2', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  errText: { fontSize: 12, color: '#dc2626' },
  btns: { flexDirection: 'row', gap: 8 },
  keep: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: gray[200], backgroundColor: '#fff' },
  keepText: { fontSize: 14, fontWeight: '600', color: gray[700] },
  go: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: '#ef4444' },
  goText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
