// Reload (top-up) bottom sheet — the web ReloadPointsModal: dark header with a
// gold bolt tile and the current balance, 2-column tier cards, custom amount,
// You pay / You receive summary and the gold "Pay RM x" button.
import { LinearGradient } from 'expo-linear-gradient';
import { CheckCircle2, X, Zap } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

import { usePayment } from '@/components/booking/Extras';
import { startPointsReload, type ReloadConfig } from '@/lib/extras';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';
import { accent, gray } from '@/lib/theme';

const AMBER = '#f59e0b';
const AMBER_600 = '#d97706';
const fmtPts = (n: number) => n.toLocaleString('en-MY', { maximumFractionDigits: 2 });
const fmtRm = (n: number) => `RM ${n.toLocaleString('en-MY')}`;
const tabular = { fontVariant: ['tabular-nums' as const] };

export type ReloadResult = { tone: 'ok' | 'warn' | 'error'; text: string };

export function ReloadSheet({ cfg, pointsName, balance, onClose, onResult }: {
  cfg: ReloadConfig; pointsName: string; balance: number; onClose: () => void; onResult: (r: ReloadResult) => void;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const tierW = Math.floor((useWindowDimensions().width - 40 - 10) / 2);
  const { session } = useSession();
  const pay = usePayment(session!.token);
  const [selected, setSelected] = useState<number | null>(cfg.tiers[0]?.amount ?? null);
  const [customText, setCustomText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);

  const customAmount = customText ? Math.floor(parseInt(customText.replace(/[^\d]/g, ''), 10) || 0) : 0;
  const usingCustom = customText.length > 0;
  const amount = usingCustom ? customAmount : (selected ?? 0);
  const bonus = cfg.tiers.find(x => x.amount === amount)?.bonus ?? 0;
  const credited = amount + bonus;
  const belowMin = usingCustom && customAmount > 0 && customAmount < cfg.custom_min;
  const canPay = amount > 0 && !belowMin && !busy;

  const go = async () => {
    if (!canPay) return;
    setBusy(true); setErr(null);
    try {
      const out = await pay.run(() => startPointsReload(session!.token, amount));
      onResult(out === 'done'
        ? { tone: 'ok', text: `${fmtPts(credited)} ${pointsName} ${t('added')}.` }
        : { tone: 'warn', text: t("The reload payment didn't complete — nothing was charged and no {points} were added.", { points: pointsName }) });
      onClose();
    } catch (e) {
      setErr((e as Error)?.message ?? 'Could not start the reload — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          {/* Dark header — mirrors the member card on the account hero. */}
          <View style={styles.head}>
            <LinearGradient colors={['#0b1220', '#131b2c', '#0b1220']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <RadialGradient id="g1" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={accent} stopOpacity={0.22} /><Stop offset="1" stopColor={accent} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="g2" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={accent} stopOpacity={0.1} /><Stop offset="1" stopColor={accent} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx="100%" cy="0%" r={170} fill="url(#g1)" />
              <Circle cx="0%" cy="100%" r={150} fill="url(#g2)" />
            </Svg>
            <View style={styles.headRow}>
              <View style={styles.headLeft}>
                <View style={styles.bolt}><Zap size={16} color="#f5d27e" strokeWidth={2.5} /></View>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.title}>{t('Reload {points}', { points: pointsName })}</Text>
                  <Text style={styles.subline}>{`1 ${pointsName.replace(/s$/i, '')} = RM 1 — ${t('usable on any booking')}`}</Text>
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={{ padding: 6 }}>
                <X size={16} color="rgba(255,255,255,0.4)" strokeWidth={2.5} />
              </Pressable>
            </View>
            <View style={styles.balStrip}>
              <Text style={styles.balLabel}>{t('Current balance').toUpperCase()}</Text>
              <Text style={[styles.balValue, tabular]}>{fmtPts(balance)}</Text>
            </View>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={[styles.body, { paddingBottom: 20 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            {pay.waiting ? (
              <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
                <ActivityIndicator color={AMBER} />
                <Text style={{ color: gray[600], fontSize: 13 }}>{t('Confirming your {points} reload…', { points: pointsName })}</Text>
                <Pressable onPress={pay.cancel} hitSlop={8}><Text style={{ color: '#dc2626', fontWeight: '600', fontSize: 13 }}>{t('I cancelled the payment')}</Text></Pressable>
              </View>
            ) : (
              <>
                {cfg.tiers.length > 0 && (
                  <View style={styles.grid}>
                    {cfg.tiers.map(x => {
                      const on = !usingCustom && selected === x.amount;
                      return (
                        <Pressable key={x.amount} onPress={() => { setSelected(x.amount); setCustomText(''); }} style={[styles.tier, { width: tierW }, on ? styles.tierOn : styles.tierOff]}>
                          {on && <LinearGradient colors={['#fffbeb', 'rgba(255,247,237,0.7)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />}
                          {on && <CheckCircle2 size={16} color={AMBER} strokeWidth={2.5} style={styles.check} />}
                          <Text style={styles.tierKicker} numberOfLines={1}>{pointsName.toUpperCase()}</Text>
                          <Text style={[styles.tierAmt, tabular]}>{x.amount.toLocaleString('en-MY')}</Text>
                          {x.bonus > 0 && (
                            <LinearGradient colors={['#fde68a', '#fbbf24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bonus}>
                              <Text style={styles.bonusText}>{`+${x.bonus.toLocaleString('en-MY')} ${t('reward')}`.toUpperCase()}</Text>
                            </LinearGradient>
                          )}
                          <Text style={styles.tierPay}>{t('Pay')} {fmtRm(x.amount)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {cfg.custom_enabled && (
                  <View style={{ marginBottom: 16 }}>
                    <View style={styles.orRow}>
                      <View style={styles.orLine} />
                      <Text style={styles.orLabel}>
                        {t('Or a custom amount').toUpperCase()}{' '}
                        <Text style={{ fontWeight: '500', letterSpacing: 0 }}>({t('min')} RM {cfg.custom_min})</Text>
                      </Text>
                      <View style={styles.orLine} />
                    </View>
                    <View>
                      <Text style={styles.rm}>RM</Text>
                      <TextInput
                        value={customText}
                        onChangeText={v => setCustomText(v.split(/[.,]/)[0].replace(/[^\d]/g, ''))}
                        keyboardType="number-pad"
                        placeholder={t('e.g. {n}', { n: cfg.custom_min })}
                        placeholderTextColor={gray[400]}
                        onFocus={() => setFocus(true)}
                        onBlur={() => setFocus(false)}
                        style={[styles.input, tabular, belowMin
                          ? { borderColor: focus ? '#f87171' : '#fca5a5', borderWidth: focus ? 2 : 1 }
                          : { borderColor: focus ? AMBER : gray[200], borderWidth: focus ? 2 : 1 }]}
                      />
                    </View>
                    {belowMin && <Text style={styles.minErr}>{t('Minimum reload is RM {n}.', { n: cfg.custom_min })}</Text>}
                  </View>
                )}

                {amount > 0 && !belowMin && (
                  <View style={styles.sum}>
                    <View style={styles.sumRow}>
                      <Text style={styles.sumKey}>{t('You pay')}</Text>
                      <Text style={[styles.sumVal, tabular]}>{fmtRm(amount)}</Text>
                    </View>
                    {bonus > 0 && (
                      <View style={[styles.sumRow, { marginTop: 6 }]}>
                        <Text style={styles.sumKey}>{t('Reward')}</Text>
                        <Text style={[styles.sumVal, tabular, { color: AMBER_600 }]}>+{bonus.toLocaleString('en-MY')} {pointsName}</Text>
                      </View>
                    )}
                    <View style={styles.dashed}><View style={styles.dashedInner} /></View>
                    <View style={[styles.sumRow, { alignItems: 'baseline' }]}>
                      <Text style={styles.sumKey}>{t('You receive')}</Text>
                      <Text style={[styles.receive, tabular]}>{credited.toLocaleString('en-MY')} {pointsName}</Text>
                    </View>
                  </View>
                )}

                {err && <Text style={styles.err}>{t(err)}</Text>}

                <Pressable onPress={go} disabled={!canPay} style={({ pressed }) => [styles.payWrap, { opacity: !canPay ? 0.4 : pressed ? 0.9 : 1 }]}>
                  <LinearGradient colors={['#e6c66a', '#b18b2e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pay}>
                    {busy ? (
                      <><ActivityIndicator size="small" color="#1c1917" /><Text style={styles.payText}>{t('Redirecting to payment…')}</Text></>
                    ) : amount > 0 ? (
                      <><Zap size={16} color="#1c1917" strokeWidth={2.5} /><Text style={styles.payText}>{t('Pay')} {fmtRm(amount)}</Text></>
                    ) : (
                      <Text style={styles.payText}>{t('Choose an amount')}</Text>
                    )}
                  </LinearGradient>
                </Pressable>
                <Text style={styles.note}>{t('Secure payment via HitPay. {points} are credited the moment payment completes.', { points: pointsName })}</Text>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', maxHeight: '86%',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 50, shadowOffset: { width: 0, height: 25 }, elevation: 24,
  },
  head: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  bolt: {
    width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(245,192,90,0.14)', borderWidth: 1, borderColor: 'rgba(245,192,90,0.3)',
  },
  title: { fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.4, color: '#fff' },
  subline: { fontSize: 11, lineHeight: 16, marginTop: 2, color: 'rgba(255,255,255,0.55)' },
  balStrip: {
    marginTop: 16, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  balLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4, color: 'rgba(245,210,126,0.9)' },
  balValue: { fontSize: 14, fontWeight: '900', color: '#fff' },
  body: { padding: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  tier: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff' },
  tierOff: { borderWidth: 1, borderColor: gray[200] },
  tierOn: {
    borderWidth: 2, borderColor: AMBER, paddingHorizontal: 13, paddingVertical: 11,
    shadowColor: AMBER, shadowOpacity: 0.12, shadowRadius: 15, shadowOffset: { width: 0, height: 10 }, elevation: 3,
  },
  check: { position: 'absolute', top: 10, right: 10 },
  tierKicker: { fontSize: 9.5, fontWeight: '700', letterSpacing: 1.14, color: gray[400], paddingRight: 18 },
  tierAmt: { fontSize: 20, lineHeight: 25, fontWeight: '900', letterSpacing: -0.5, color: gray[900] },
  bonus: { marginTop: 6, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  bonusText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, color: '#78350f' },
  tierPay: { marginTop: 6, fontSize: 11, fontWeight: '600', color: gray[400] },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  orLine: { flex: 1, height: 1, backgroundColor: gray[100] },
  orLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: gray[400], flexShrink: 1, textAlign: 'center' },
  rm: { position: 'absolute', left: 14, top: 0, bottom: 0, textAlignVertical: 'center', lineHeight: 42, fontSize: 12, fontWeight: '700', color: gray[400], zIndex: 1 },
  input: { borderRadius: 12, paddingLeft: 40, paddingRight: 14, height: 42, paddingVertical: 0, fontSize: 14, fontWeight: '600', color: gray[900] },
  minErr: { fontSize: 11, color: '#dc2626', marginTop: 4 },
  sum: { borderRadius: 16, backgroundColor: 'rgba(249,250,251,0.8)', borderWidth: 1, borderColor: gray[100], paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sumKey: { fontSize: 12, color: gray[500] },
  sumVal: { fontSize: 12, fontWeight: '700', color: gray[900] },
  dashed: { marginVertical: 10, height: 1, overflow: 'hidden' },
  dashedInner: { height: 2, borderWidth: 1, borderStyle: 'dashed', borderColor: gray[200] },
  receive: { fontSize: 14, fontWeight: '900', color: AMBER_600 },
  err: { fontSize: 12, color: '#dc2626', backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  payWrap: {
    borderRadius: 16,
    shadowColor: '#e6c66a', shadowOpacity: 0.65, shadowRadius: 12, shadowOffset: { width: 0, height: 10 }, elevation: 6,
  },
  pay: { borderRadius: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  payText: { fontSize: 14, fontWeight: '700', color: '#1c1917' },
  note: { fontSize: 10.5, color: gray[400], textAlign: 'center', marginTop: 10 },
});
