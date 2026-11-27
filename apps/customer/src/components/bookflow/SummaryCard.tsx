// Web SummaryCard ("Your booking" sidebar, shown under the step on a phone)
// and PointsRedeemControl (step 4: tick, balance, amount to use, Max).
import { CheckCircle2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { durationLabel, type ServiceRow } from '@/lib/booking';
import { fmtBookingTime, useT } from '@/lib/i18n';
import { accent, accentTint, bf } from '@/lib/theme';
import type { SpecialDiscountConfig } from '@/shared/specialDiscount';
import type { TaxMode } from '@/shared/tax';

import { fmtDayMid, line2, redeemCap, redeemClamp, rm, Tick } from './atoms';

export interface PointsProps {
  name: string;
  /** Feature on and the customer has a balance (web pointsEnabled). */
  enabled: boolean;
  balance: number;
  whole: boolean;
  use: boolean;
  onToggle: (on: boolean) => void;
  amount: number | null;
  onAmount: (n: number | null) => void;
  applied: number;
}

export interface SummaryProps {
  service: ServiceRow | null;
  isMember: boolean;
  date: string | null;
  time: string | null;
  timeFormat: '12h' | '24h';
  addons: { id: string; name: string; price: number }[];
  addonTotal: number;
  priceFrom: number | null;
  slotPrice: number | null;
  peakName: string;
  sdAmount: number;
  sdCfg: SpecialDiscountConfig | null;
  taxRate: number;
  taxMode: TaxMode;
  taxName: string;
  tax: { tax: number; total: number; rounding: number };
  checkout: boolean;
  points: PointsProps;
}

function sdLabel(t: (s: string, v?: Record<string, string | number>) => string, cfg: SpecialDiscountConfig | null): string {
  if (!cfg) return t('Discount');
  const pct = cfg.type === 'percentage' && cfg.value > 0;
  if (cfg.appliesTo === 'services') return pct ? t('Discount ({n}%) on services', { n: cfg.value }) : t('Discount on services');
  if (cfg.appliesTo === 'addons') return pct ? t('Discount ({n}%) on add-ons', { n: cfg.value }) : t('Discount on add-ons');
  return pct ? t('Discount ({n}%)', { n: cfg.value }) : t('Discount');
}

function Line({ label, value, color }: { label: string; value?: string; color?: string }) {
  return (
    <View style={st.line}>
      <Text style={[st.lineK, color ? { color } : null]}>{label}</Text>
      {value != null && <Text style={[st.lineV, color ? { color } : null]}>{value}</Text>}
    </View>
  );
}
function Big({ label, value }: { label: string; value: string }) {
  return (
    <View style={[st.line, st.big]}>
      <Text style={st.bigK}>{label}</Text>
      <Text style={st.bigV}>{value}</Text>
    </View>
  );
}
function Row({ label, value, placeholder, last }: { label: string; value?: string | null; placeholder: string; last?: boolean }) {
  return (
    <View style={[st.row, last && { borderBottomWidth: 0 }]}>
      <Text style={st.rowK}>{label}</Text>
      <Text style={[st.rowV, !value && st.rowMuted]}>{value || placeholder}</Text>
    </View>
  );
}

export function SummaryCard(p: SummaryProps) {
  const { t } = useT();
  const basePrice = p.time && p.slotPrice !== null ? p.slotPrice : p.priceFrom;
  const status = !p.service ? 'Pending' : !p.date || !p.time ? 'Live' : 'Ready';
  const taxLabel = `${p.taxMode === 'inclusive' ? t('Incl. {name}', { name: t(p.taxName) }) : t(p.taxName)} (${p.taxRate}%)`;
  const grandTotal = p.tax.total;
  const breakdown = (
    <>
      {p.sdAmount > 0 && <Line label={sdLabel(t, p.sdCfg)} value={`− ${rm(p.sdAmount)}`} />}
      {p.taxRate > 0 && <Line label={taxLabel} value={rm(p.tax.tax)} />}
      {p.tax.rounding > 0.001 && <Line label={t('Round up')} value={rm(p.tax.rounding)} />}
    </>
  );

  const head = (
    <View style={st.head}>
      <Text style={st.h3}>{t('Your booking')}</Text>
      <Text style={st.live}>{t(status)}</Text>
    </View>
  );

  if (p.checkout && p.service) {
    const applied = Math.min(Math.max(0, p.points.applied), grandTotal);
    const toPay = Math.max(0, Math.round((grandTotal - applied) * 100) / 100);
    return (
      <View style={st.card}>
        {head}
        <View>
          <Line label={`${p.service.name}${p.isMember ? ` · ${t('Member')}` : ''}`} value={rm(basePrice ?? 0)} />
          {!!p.peakName && <Line label={`${t('Peak day')} · ${p.peakName}`} color={accent} />}
          {p.addons.map(a => <Line key={a.id} label={a.name} value={rm(a.price)} />)}
          {breakdown}
          <Big label={t('Total')} value={rm(grandTotal)} />
          {applied > 0 && (
            <>
              <Line label={t('{name} applied', { name: t(p.points.name || 'Points') })} value={`− ${rm(applied)}`} color={accent} />
              <Big label={t('To pay')} value={rm(toPay)} />
              {toPay <= 0 && (
                <View style={st.covered}>
                  <CheckCircle2 size={13} color={accent} strokeWidth={2.5} style={{ marginTop: 1 }} />
                  <Text style={st.coveredText}>{t('Fully covered — your booking will be confirmed without payment.')}</Text>
                </View>
              )}
            </>
          )}
          {p.points.enabled && <PointsRedeemControl {...p.points} total={grandTotal} />}
        </View>
      </View>
    );
  }

  return (
    <View style={st.card}>
      {head}
      <View>
        <Row label={t('Service')} value={p.service?.name} placeholder={t('Not picked yet')} />
        {p.service && <Row label={t('Duration')} value={durationLabel(p.service, p.time)} placeholder="—" />}
        <Row label={t('Date')} value={p.date ? fmtDayMid(p.date) : null} placeholder={t('Not picked yet')} />
        <Row label={t('Time')} value={p.time ? fmtBookingTime(p.time, p.timeFormat) : null} placeholder="—" />
        <Row label={t('Extras')} value={p.addons.length ? p.addons.map(a => a.name).join(' · ') : null} placeholder={t('None selected')} last />
      </View>
      {p.service && p.priceFrom !== null && (
        <View style={st.totals}>
          <Line label={`${t('Service')}${p.isMember ? ` · ${t('Member')}` : ''}`} value={rm(basePrice ?? 0)} />
          {!!p.peakName && <Line label={`${t('Peak day')} · ${p.peakName}`} color={accent} />}
          {p.addonTotal > 0 && <Line label={t('Extras ({n})', { n: p.addons.length })} value={rm(p.addonTotal)} />}
          {breakdown}
          <Big label={p.time && p.slotPrice !== null ? t('Total') : t('Estimated total')} value={rm(grandTotal)} />
        </View>
      )}
      {!p.service && <Text style={st.hint}>{t('Pick a service to see your total. It updates as you choose date, time, and extras.')}</Text>}
    </View>
  );
}

function PointsRedeemControl({ name, balance, whole, use, onToggle, amount, onAmount, total }: PointsProps & { total: number }) {
  const { t } = useT();
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const maxRedeem = redeemCap(balance, total, whole);
  const fmtRm = (n: number) => `RM ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const [text, setText] = useState<string | null>(null);
  const fieldValue = text ?? String(amount ?? maxRedeem);
  const rawCap = round2(Math.min(Math.max(0, balance), total));
  const capNoMin = whole && balance < total ? Math.floor(rawCap) : rawCap;
  const [minHit, setMinHit] = useState(false);
  const showMinNote = amount === null && text === null ? maxRedeem < capNoMin - 0.001 : minHit;
  const noteMin = (n: number, adj: number) => {
    const r = round2(Math.max(0, Math.min(n, rawCap)));
    setMinHit(adj < (whole && r < capNoMin ? Math.floor(r) : r) - 0.001);
  };
  const commit = (raw: string) => {
    const n = round2(parseFloat(raw.replace(/[^\d.]/g, '')));
    const clamped = Number.isFinite(n) ? redeemClamp(n, maxRedeem, whole, total) : maxRedeem;
    if (Number.isFinite(n)) noteMin(n, clamped);
    setText(null);
    onAmount(clamped >= maxRedeem - 0.001 ? null : clamped);
  };
  const usingMax = amount === null || amount >= maxRedeem - 0.001;
  const toggle = () => {
    const on = !use;
    onToggle(on);
    // Re-ticking always starts back at the full-redeem default.
    if (!on) onAmount(null);
  };
  return (
    <View style={[st.pts, use && { backgroundColor: accentTint, borderColor: accent }]}>
      <Pressable onPress={toggle} style={st.ptsHead} accessibilityRole="checkbox" accessibilityState={{ checked: use }}>
        <Tick on={use} color={accent} size={16} radius={3} />
        <Text style={st.ptsName} numberOfLines={1}>{t('Use my {name}', { name: t(name) })}</Text>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={st.ptsBalK}>{t('Balance')}</Text>
          <Text style={st.ptsBalV}>{fmtRm(balance)}</Text>
        </View>
      </Pressable>
      {use && (
        <View style={st.ptsAmt}>
          <Text style={st.ptsAmtK}>{t('Amount to use')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TextInput
              value={fieldValue}
              keyboardType={whole ? 'number-pad' : 'decimal-pad'}
              onChangeText={v => {
                const cleaned = whole
                  ? v.split(/[.,]/)[0].replace(/\D/g, '')
                  : v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1').replace(/(\.\d{2})\d+$/, '$1');
                setText(cleaned);
                const n = parseFloat(cleaned);
                const adj = Number.isFinite(n) ? redeemClamp(n, maxRedeem, whole, total) : 0;
                if (Number.isFinite(n)) noteMin(n, adj);
                onAmount(adj);
              }}
              onEndEditing={e => commit(e.nativeEvent.text)}
              style={st.ptsInput}
            />
            <Pressable disabled={usingMax} onPress={() => { setText(null); onAmount(null); }} style={[st.max, usingMax && { opacity: 0.4 }]}>
              <Text style={st.maxText}>{t('Max')}</Text>
            </Pressable>
          </View>
        </View>
      )}
      {use && showMinNote && (
        <Text style={st.minNote}>{t('Rounded down so the card payment is at least RM 0.30 (the lowest amount the payment gateway accepts).')}</Text>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: bf.raised, borderWidth: 1, borderColor: bf.line, borderRadius: 14, padding: 16, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  h3: { fontSize: 13.5, fontWeight: '600', color: bf.ink },
  live: { fontSize: 10.5, fontWeight: '700', letterSpacing: 2.3, textTransform: 'uppercase', color: bf.muted },
  row: { flexDirection: 'row', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: line2 },
  rowK: { width: 72, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.68, textTransform: 'uppercase', color: bf.muted },
  rowV: { flex: 1, fontSize: 13, fontWeight: '500', color: bf.ink, lineHeight: 17.5 },
  rowMuted: { color: bf.muted, fontStyle: 'italic' },
  totals: { marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: bf.line },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, paddingVertical: 2 },
  lineK: { fontSize: 12, color: bf.ink3, flexShrink: 1 },
  lineV: { fontSize: 12, color: bf.ink, fontWeight: '600' },
  big: { paddingTop: 8, marginTop: 6, borderTopWidth: 1, borderTopColor: line2 },
  bigK: { fontSize: 12.5, fontWeight: '600', color: bf.ink },
  bigV: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4, color: bf.ink },
  hint: { fontSize: 11.5, color: bf.muted, lineHeight: 16 },
  covered: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 2 },
  coveredText: { flex: 1, fontSize: 11.5, color: accent, fontWeight: '600', lineHeight: 16 },

  pts: { marginTop: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: bf.paper, borderWidth: 1.5, borderColor: bf.line },
  ptsHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 12 },
  ptsName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '600', color: bf.ink },
  ptsBalK: { fontSize: 9, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: '#9ca3af' },
  ptsBalV: { fontSize: 12, fontWeight: '700', color: bf.ink },
  ptsAmt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: bf.line, borderStyle: 'dashed' },
  ptsAmtK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.74, textTransform: 'uppercase', color: '#6b7280' },
  ptsInput: { width: 88, textAlign: 'right', fontSize: 13, fontWeight: '700', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1.5, borderColor: bf.line, backgroundColor: bf.paper, color: bf.ink },
  max: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 9, borderWidth: 1.5, borderColor: accent },
  maxText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: accent },
  minNote: { paddingHorizontal: 12, paddingBottom: 10, fontSize: 11, lineHeight: 15, color: '#6b7280' },
});
