// Credits tab — the web's membership-card hero (identity, member pill,
// balance, Reload) and the points history card with Export PDF.
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { ArrowDownToLine, ChevronDown, ChevronsUpDown, Coins, Crown, TrendingDown, TrendingUp, X, Zap } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { AppHeader } from '@/components/AppHeader';
import { usePayment } from '@/components/booking/Extras';
import { Notice } from '@/components/ui';
import { PageCard } from '@/components/web';
import { tenant } from '@/config/tenant';
import type { CoinTxn } from '@/lib/booking';
import { startPointsReload, type ReloadConfig } from '@/lib/extras';
import { fmtMonth, fmtShortDate, useT } from '@/lib/i18n';
import { useCoins, useProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { accent, accentSoft, bf, gray, heroColors } from '@/lib/theme';

const wordmark = require('@/assets/tenant/wordmark.png');
const GOLD = ['#e6c66a', '#b18b2e'] as const;
const fmtPts = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Booking UUIDs in coin descriptions → BK-XXXXXXXX; hidden [IV…] markers dropped (web friendlyDesc). */
const friendlyDesc = (text: string) => text
  .replace(/\[([0-9a-f-]{16,})\]/gi, (_m, id: string) => `BK-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`)
  .replace(/\s*\[[A-Z][A-Z0-9]{4,}\]/g, '');

function GoldButton({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start' })}>
      <LinearGradient colors={GOLD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gold}>
        {icon}
        <Text style={styles.goldText}>{label.toUpperCase()}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function MembershipHero({ onReload }: { onReload: () => void }) {
  const { t } = useT();
  const p = useProfile().data?.customer;
  const coins = useCoins().data;
  if (!p) return null;
  const expMs = p.member_expires ? new Date(p.member_expires).getTime() : null;
  const memberActive = p.is_member && (expMs == null || expMs >= startOfToday());
  const memberLapsed = p.is_member && expMs != null && expMs < startOfToday();
  const pointsName = coins?.points_name ?? '';

  return (
    <View style={styles.hero}>
      <LinearGradient colors={heroColors} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="o1" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.3} /><Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="o2" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={accent} stopOpacity={0.18} /><Stop offset="1" stopColor={accent} stopOpacity={0} />
          </RadialGradient>
          <Pattern id="dots" width={22} height={22} patternUnits="userSpaceOnUse">
            <Circle cx={11} cy={11} r={1} fill="#fff" fillOpacity={0.18} />
          </Pattern>
          <RadialGradient id="fade" cx="50%" cy="50%" r="60%">
            <Stop offset="0.3" stopColor="#fff" stopOpacity={0.18} /><Stop offset="0.75" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#dots)" opacity={0.9} />
        <Circle cx="100%" cy="0%" r={230} fill="url(#o1)" />
        <Circle cx="0%" cy="100%" r={200} fill="url(#o2)" />
      </Svg>
      <Text style={styles.watermark} numberOfLines={1} ellipsizeMode="clip">{tenant.name}</Text>

      <View style={styles.heroBody}>
        <View style={styles.eyebrow}>
          <Image source={wordmark} style={styles.heroLogo} contentFit="contain" tintColor="#ffffff" />
          <Text style={styles.kicker}>{`${tenant.name}${memberActive ? ` · ${t('Member account')}` : ''}`.toUpperCase()}</Text>
        </View>

        <View style={styles.idRow}>
          <LinearGradient colors={[accent, 'rgba(255,255,255,0.25)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Text style={styles.avatarText}>{(p.name || '?').trim().charAt(0).toUpperCase()}</Text>
          </LinearGradient>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
            <Text style={styles.phone}>{p.phone_e164 || '—'}</Text>
          </View>
        </View>

        {(p.is_member || p.is_restricted) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 }}>
            {p.is_member && (
              <View style={[styles.pill, memberActive ? styles.pillGold : styles.pillMute]}>
                <Crown size={12} color={memberActive ? '#f5d27e' : 'rgba(255,255,255,0.75)'} strokeWidth={2.5} />
                <Text style={[styles.pillLabel, { color: memberActive ? '#f5d27e' : 'rgba(255,255,255,0.75)' }]}>{t('Member').toUpperCase()}</Text>
                <View style={styles.pillStatus}>
                  <Text style={[styles.pillStatusText, { color: memberActive ? '#f5d27e' : 'rgba(255,255,255,0.75)' }]}>
                    {(memberActive ? t('Active') : memberLapsed ? t('Lapsed') : t('Pending')).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.pillDates, { color: memberActive ? 'rgba(245,230,200,0.85)' : 'rgba(255,255,255,0.6)' }]}>
                  {`${p.member_start ? fmtShortDate(p.member_start) : '—'} → ${p.member_expires ? fmtShortDate(p.member_expires) : '—'}`}
                </Text>
              </View>
            )}
          </View>
        )}

        {coins?.enabled && (
          <View style={styles.balanceBox}>
            <Text style={styles.kicker}>{`${pointsName} · ${t('Balance')}`.toUpperCase()}</Text>
            <Text style={styles.balance}>{Number(coins.balance ?? 0).toLocaleString()}</Text>
            {memberActive && (
              <View style={styles.earned}>
                <Coins size={12} color="rgba(255,255,255,0.4)" />
                <Text style={styles.earnedText}>{t('Earned with every booking').toUpperCase()}</Text>
              </View>
            )}
            {coins.reload?.enabled && (
              <View style={{ marginTop: 12 }}>
                <GoldButton label={t('Reload')} icon={<Zap size={12} color="#1c1917" strokeWidth={2.75} />} onPress={onReload} />
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function ReloadSheet({ cfg, pointsName, balance, onClose, onResult }: {
  cfg: ReloadConfig; pointsName: string; balance: number; onClose: () => void; onResult: (r: { tone: 'ok' | 'warn' | 'error'; text: string }) => void;
}) {
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const pay = usePayment(session!.token);
  const [selected, setSelected] = useState<number | null>(cfg.tiers[0]?.amount ?? null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const customAmount = Number(custom) || 0;
  const usingCustom = custom.trim() !== '';
  const amount = usingCustom ? customAmount : (selected ?? 0);
  const bonus = cfg.tiers.find(x => x.amount === amount)?.bonus ?? 0;
  const belowMin = usingCustom && customAmount > 0 && customAmount < cfg.custom_min;
  const canPay = amount > 0 && !belowMin && !busy;

  const go = async () => {
    setBusy(true);
    try {
      const out = await pay.run(() => startPointsReload(session!.token, amount));
      onResult(out === 'done'
        ? { tone: 'ok', text: `${fmtPts(amount + bonus)} ${pointsName} ${t('added')}.` }
        : { tone: 'warn', text: t("The reload payment didn't complete — nothing was charged and no {points} were added.", { points: pointsName }) });
      onClose();
    } catch (e) {
      onResult({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{t('Reload {points}', { points: pointsName })}</Text>
          <Pressable onPress={onClose} hitSlop={10}><X size={20} color={gray[500]} /></Pressable>
        </View>
        <Text style={styles.sheetSub}>{t('Current balance')}: <Text style={{ fontWeight: '700', color: gray[900] }}>{fmtPts(balance)}</Text></Text>
        {pay.waiting ? (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 20 }}>
            <ActivityIndicator color={accent} />
            <Text style={{ color: gray[600] }}>{t('Confirming your {points} reload…', { points: pointsName })}</Text>
            <Pressable onPress={pay.cancel}><Text style={{ color: '#dc2626', fontWeight: '600' }}>{t('I cancelled the payment')}</Text></Pressable>
          </View>
        ) : (
          <>
            {cfg.tiers.length > 0 && (
              <>
                <Text style={styles.sheetLabel}>{t('Choose an amount').toUpperCase()}</Text>
                <View style={styles.tiers}>
                  {cfg.tiers.map(x => {
                    const on = !usingCustom && selected === x.amount;
                    return (
                      <Pressable key={x.amount} onPress={() => { setSelected(x.amount); setCustom(''); }} style={[styles.tier, on && { borderColor: accent, backgroundColor: accentSoft }]}>
                        <Text style={styles.tierAmt}>RM {x.amount.toLocaleString()}</Text>
                        {x.bonus > 0 && <Text style={styles.tierBonus}>+{x.bonus.toLocaleString()} {t('reward')}</Text>}
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            {cfg.custom_enabled && (
              <>
                <Text style={styles.sheetLabel}>{`${t('Or a custom amount')} (${t('min')} RM ${cfg.custom_min})`.toUpperCase()}</Text>
                <TextInput value={custom} onChangeText={v => setCustom(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad"
                  placeholder={t('e.g. {n}', { n: cfg.custom_min })} placeholderTextColor={gray[400]} style={styles.customInput} />
                {belowMin && <Text style={{ fontSize: 11, color: '#dc2626' }}>{t('Minimum reload is RM {n}.', { n: cfg.custom_min })}</Text>}
              </>
            )}
            <View style={styles.sumBox}>
              <View style={styles.sumRow}><Text style={styles.sumKey}>{t('You pay')}</Text><Text style={styles.sumVal}>RM {fmtPts(amount)}</Text></View>
              <View style={styles.sumRow}><Text style={styles.sumKey}>{t('You receive')}</Text><Text style={styles.sumVal}>{fmtPts(amount + bonus)} {pointsName}</Text></View>
            </View>
            <Pressable onPress={go} disabled={!canPay} style={[styles.payBig, !canPay && { opacity: 0.45 }]}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.payBigText}>{t('Pay')} RM {fmtPts(amount)}</Text>}
            </Pressable>
            <Text style={styles.sheetNote}>{t('Secure payment via HitPay. {points} are credited the moment payment completes.', { points: pointsName })}</Text>
          </>
        )}
      </View>
    </Modal>
  );
}

function HistoryCard() {
  const { t } = useT();
  const q = useCoins();
  const profile = useProfile().data?.customer;
  const data = q.data;
  const pointsName = data?.points_name ?? '';
  const txns = useMemo(() => data?.transactions ?? [], [data]);
  const [expanded, setExpanded] = useState(true);
  const [scope, setScope] = useState('all');

  const grouped = useMemo(() => {
    const m = new Map<string, CoinTxn[]>();
    for (const x of txns) {
      const d = new Date(x.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(x);
    }
    return [...m.entries()];
  }, [txns]);
  const balanceAfter = useMemo(() => {
    const m = new Map<string, number>();
    let running = data?.balance ?? 0;
    for (const x of txns) { m.set(x.id, Math.round(running * 100) / 100); running -= x.amount; }
    return m;
  }, [txns, data?.balance]);
  const monthLabel = (k: string) => { const [y, mo] = k.split('-').map(Number); return fmtMonth(y, mo - 1); };
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString()}`;

  const pickScope = () => Alert.alert(t('Export PDF'), undefined, [
    { text: t('All (last 3 months)'), onPress: () => setScope('all') },
    ...grouped.map(([k]) => ({ text: monthLabel(k), onPress: () => setScope(k) })),
    { text: t('Cancel'), style: 'cancel' as const },
  ]);

  const exportPdf = async () => {
    const rows = scope === 'all' ? txns : grouped.find(([k]) => k === scope)?.[1] ?? [];
    const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    const html = `<html><head><meta name="viewport" content="width=device-width"><style>
      body{font-family:-apple-system,Roboto,sans-serif;color:#111827;padding:28px}h1{font-size:20px;margin:0}
      .sub{color:#6b7280;font-size:12px;margin:4px 0 18px}table{width:100%;border-collapse:collapse;font-size:12px}
      th{text-align:left;color:#9ca3af;font-size:10px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #e5e7eb;padding:6px 4px}
      td{border-bottom:1px solid #f3f4f6;padding:7px 4px}.r{text-align:right;font-family:monospace}.p{color:#059669}.n{color:#ef4444}</style></head><body>
      <h1>${esc(tenant.name)} · ${esc(pointsName)}</h1>
      <div class="sub">${esc(profile?.name ?? '')} · ${esc(profile?.phone_e164 ?? '')} · ${esc(scope === 'all' ? t('All (last 3 months)') : monthLabel(scope))}</div>
      <table><tr><th>${t('Date')}</th><th>${t('Description')}</th><th class="r">${t('Amount')}</th><th class="r">${t('Balance')}</th></tr>
      ${rows.map(x => `<tr><td>${fmtShortDate(x.created_at)}</td><td>${esc(friendlyDesc(x.description || x.reason || x.type))}</td>
        <td class="r ${x.amount >= 0 ? 'p' : 'n'}">${signed(x.amount)}</td><td class="r">${fmtPts(balanceAfter.get(x.id) ?? 0)}</td></tr>`).join('')}
      </table></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch (e) {
      Alert.alert(t('Export PDF'), (e as Error).message);
    }
  };

  if (!data?.enabled) return null;
  return (
    <PageCard>
      <Pressable onPress={() => setExpanded(v => !v)} style={styles.histHead}>
        <View style={styles.tile}><Coins size={16} color={accent} /></View>
        <Text style={styles.h2}>{pointsName}</Text>
        <Text style={styles.count}>{txns.length > 0 ? `· ${t('{n} in last 3 months', { n: txns.length })}` : `· ${t('no activity')}`}</Text>
        <ChevronDown size={16} color={gray[400]} strokeWidth={2.5} style={{ marginLeft: 'auto', transform: [{ rotate: expanded ? '180deg' : '0deg' }] }} />
      </Pressable>

      {expanded && txns.length > 0 && (
        <View style={styles.exportRow}>
          <Pressable onPress={pickScope} style={styles.select}>
            <Text style={styles.selectText} numberOfLines={1}>{scope === 'all' ? t('All (last 3 months)') : monthLabel(scope)}</Text>
            <ChevronsUpDown size={14} color={gray[500]} />
          </Pressable>
          <Pressable onPress={exportPdf} style={styles.exportBtn}>
            <ArrowDownToLine size={14} color={gray[700]} /><Text style={styles.exportText}>{t('Export PDF')}</Text>
          </Pressable>
        </View>
      )}

      {expanded && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.histLabel}>{t('History · last 3 months').toUpperCase()}</Text>
          {q.isPending ? <Text style={styles.small}>{t('Loading…')}</Text> : txns.length === 0 ? (
            <Text style={styles.emptyBox}>{t('No {points} activity in the last 3 months.', { points: pointsName })}</Text>
          ) : (
            <View style={{ gap: 16 }}>
              {grouped.map(([month, items]) => (
                <View key={month}>
                  <Text style={styles.month}>{monthLabel(month)}</Text>
                  <View style={{ gap: 4 }}>
                    {items.map(x => {
                      const pos = x.amount >= 0;
                      return (
                        <View key={x.id} style={styles.txn}>
                          <View style={[styles.txnIcon, { backgroundColor: pos ? '#ecfdf5' : '#fef2f2' }]}>
                            {pos ? <TrendingUp size={12} color="#059669" strokeWidth={2.5} /> : <TrendingDown size={12} color="#ef4444" strokeWidth={2.5} />}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.txnDesc} numberOfLines={1}>{friendlyDesc(x.description || x.reason || x.type)}</Text>
                            <Text style={styles.txnDate}>{fmtShortDate(x.created_at)}</Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.txnAmt, { color: pos ? '#059669' : '#ef4444' }]}>{signed(x.amount)}</Text>
                            <Text style={styles.txnBal}>{t('Bal')} {fmtPts(balanceAfter.get(x.id) ?? 0)}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </PageCard>
  );
}

export default function Credits() {
  const coins = useCoins();
  const profile = useProfile();
  const [reload, setReload] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: bf.ground }}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={coins.isRefetching} onRefresh={() => { coins.refetch(); profile.refetch(); }} colors={[accent]} />}>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <MembershipHero onReload={() => { setMsg(null); setReload(true); }} />
        <HistoryCard />
      </ScrollView>
      {reload && coins.data?.reload && (
        <ReloadSheet cfg={coins.data.reload} pointsName={coins.data.points_name} balance={coins.data.balance} onClose={() => setReload(false)} onResult={setMsg} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 24, paddingBottom: 32, gap: 20 },
  hero: {
    borderRadius: 24, overflow: 'hidden', minHeight: 240,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 25, shadowOffset: { width: 0, height: 20 }, elevation: 10,
  },
  watermark: { position: 'absolute', bottom: -18, right: 0, width: 1400, textAlign: 'right', paddingRight: 24, fontSize: 110, fontWeight: '900', letterSpacing: -5, color: 'rgba(255,255,255,0.035)' },
  heroBody: { padding: 24, minHeight: 240 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28 },
  heroLogo: { height: 24, width: 79, opacity: 0.85 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2.8, color: 'rgba(255,255,255,0.45)', flexShrink: 1 },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '900' },
  name: { color: '#fff', fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  phone: { color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 4, letterSpacing: 1.6, fontFamily: 'monospace' },
  pill: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, borderRadius: 16, paddingLeft: 10, paddingRight: 12, paddingVertical: 6, borderWidth: 1, maxWidth: '100%' },
  pillGold: { backgroundColor: 'rgba(245,192,90,0.14)', borderColor: 'rgba(245,192,90,0.35)' },
  pillMute: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
  pillLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  pillStatus: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  pillStatusText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  pillDates: { fontSize: 10, fontFamily: 'monospace' },
  balanceBox: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 20, marginTop: 24 },
  balance: { fontSize: 40, fontWeight: '900', letterSpacing: -1, color: '#f8f3e7', marginTop: 8 },
  earned: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  earnedText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.8, color: 'rgba(255,255,255,0.4)' },
  gold: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  goldText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: '#1c1917' },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tile: { width: 28, height: 28, borderRadius: 8, backgroundColor: accentSoft, alignItems: 'center', justifyContent: 'center' },
  h2: { fontSize: 14, fontWeight: '700', color: gray[900] },
  count: { fontSize: 11, color: gray[400], fontWeight: '500', flexShrink: 1 },
  exportRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  select: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: gray[200], borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  selectText: { fontSize: 12, color: gray[900], flex: 1 },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: gray[200], borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  exportText: { fontSize: 12, fontWeight: '600', color: gray[700] },
  histLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: gray[400], marginBottom: 8 },
  small: { fontSize: 12, color: gray[400], paddingVertical: 12 },
  emptyBox: { fontSize: 12, color: gray[400], backgroundColor: gray[50], borderWidth: 1, borderColor: gray[100], borderRadius: 8, paddingHorizontal: 12, paddingVertical: 16, textAlign: 'center' },
  month: { fontSize: 11, fontWeight: '600', color: gray[600], marginBottom: 6 },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingHorizontal: 10 },
  txnIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  txnDesc: { fontSize: 12, color: gray[800] },
  txnDate: { fontSize: 10, color: gray[400] },
  txnAmt: { fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  txnBal: { fontSize: 10, color: gray[400], fontFamily: 'monospace' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: gray[900] },
  sheetSub: { fontSize: 12, color: gray[500] },
  sheetLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: gray[400], marginTop: 4 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tier: { width: '31%', borderWidth: 1, borderColor: gray[200], borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 2 },
  tierAmt: { fontSize: 14, fontWeight: '700', color: gray[900] },
  tierBonus: { fontSize: 10, fontWeight: '700', color: '#d97706' },
  customInput: { borderWidth: 1, borderColor: gray[200], borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: gray[900] },
  sumBox: { backgroundColor: gray[50], borderRadius: 12, padding: 12, gap: 6 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sumKey: { fontSize: 12, color: gray[500] },
  sumVal: { fontSize: 13, fontWeight: '700', color: gray[900] },
  payBig: { backgroundColor: accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  payBigText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sheetNote: { fontSize: 11, color: gray[400], textAlign: 'center' },
});
