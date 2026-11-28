// Web ConfirmStep ("Review your booking"), SuccessStep, PaymentFailedStep and
// the payment-return "checking" spinner.
import { CheckCircle2, XCircle } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { fmtBookingTime, useT } from '@/lib/i18n';
import { accent, bf, gray } from '@/lib/theme';

import { fmtDayLong, fmtDayMid, line2, mono, StepHead } from './atoms';
import type { MultiPick } from './multi';

// ── Step 4 — Confirm ────────────────────────────────────────────────────────

function ConfirmRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <View style={st.reviewRow}>
      <Text style={st.reviewK}>{label}</Text>
      <View style={st.reviewV}>
        <Text style={st.reviewVal}>{value}</Text>
        {note ? <Text style={st.reviewNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

export function ConfirmStep({ tenantName, serviceName, slotPrice, isMember, date, time, timeFormat, addons, addonTotal, name, phone, addressLine, addressSub, lobby, notes, visits }: {
  tenantName: string; serviceName: string; slotPrice: number | null; isMember: boolean;
  date: string; time: string; timeFormat: '12h' | '24h';
  addons: { name: string }[]; addonTotal: number;
  name: string; phone: string; addressLine: string; addressSub: string; lobby: string; notes: string;
  /** Multi-date checkout: one row per visit replaces Service / Extras / When. */
  visits?: MultiPick[] | null;
}) {
  const { t } = useT();
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const isMulti = !!visits?.length;
  return (
    <View>
      <StepHead title={isMulti ? t('Review your {n} bookings', { n: visits!.length }) : t('Review your booking')}
        sub={t('A quick read-back before we send it to {name}.', { name: tenantName })} />
      <View style={st.review}>
        {/* marginBottom -1 clips the last row's divider (web :last-child). */}
        <View style={{ marginBottom: -1 }}>
        {isMulti ? visits!.map((p, i) => (
          <ConfirmRow key={p.dateKey} label={t('Visit {n}', { n: i + 1 })}
            value={`${fmtDayLong(p.dateKey)} · ${fmtBookingTime(p.time, timeFormat)}`}
            note={[
              `${p.serviceName} RM ${r2(p.basePrice)}`,
              ...p.addons.map(a => `${a.name} RM ${r2(a.price)}`),
              ...(p.addons.length ? [t('RM {n} total', { n: r2(p.price) })] : []),
              ...(p.member ? [t('Member price')] : []),
              ...(p.requestedMaidLabel ? [t('Team: {name}', { name: p.requestedMaidLabel })] : []),
            ].join(' · ')} />
        )) : (
          <>
            <ConfirmRow label={t('Service')} value={serviceName}
              note={slotPrice !== null ? `RM ${r2(slotPrice)}${isMember ? ` · ${t('Member price')}` : ''}` : undefined} />
            {addons.length > 0 && (
              <ConfirmRow label={t('Extras ({n})', { n: addons.length })} value={addons.map(a => a.name).join(' · ')} note={`+ RM ${r2(addonTotal)}`} />
            )}
            <ConfirmRow label={t('When')} value={fmtDayLong(date)} note={fmtBookingTime(time, timeFormat)} />
          </>
        )}
        <ConfirmRow label={t('Customer')} value={name || '—'} note={phone} />
        <ConfirmRow label={t('Address')} value={addressLine || '—'} note={addressSub} />
        {!!lobby && <ConfirmRow label={t('Lobby / guard')} value={lobby} />}
        {!!notes && <ConfirmRow label={t('Notes')} value={notes} />}
        </View>
      </View>
    </View>
  );
}

// ── Step 5 — Success ────────────────────────────────────────────────────────

export function SuccessStep({ tenantName, bookingRef, serviceName, date, time, timeFormat, addons, more, onBookAgain, onViewBookings }: {
  tenantName: string; bookingRef: string; serviceName: string; date: string; time: string; timeFormat: '12h' | '24h';
  addons?: { name: string }[];
  /** Multi-date checkout: the confirmed visits after the first one. */
  more?: { ref: string; serviceName: string; date: string; time: string }[];
  onBookAgain: () => void; onViewBookings: () => void;
}) {
  const { t } = useT();
  const n = more?.length ?? 0;
  const when = { date: fmtDayMid(date), time: fmtBookingTime(time, timeFormat) };
  return (
    <View style={st.done}>
      <View style={st.doneMark}><CheckCircle2 size={24} color={bf.good} strokeWidth={2.4} /></View>
      <View style={{ alignItems: 'center' }}>
        <Text style={st.doneKicker}>{n ? t('{n} bookings confirmed', { n: n + 1 }) : t('Booking confirmed')}</Text>
        <Text style={st.doneH2}>
          {n
            ? t(n > 1 ? 'See you {date} at {time} — and {n} more visits.' : 'See you {date} at {time} — and {n} more visit.', { ...when, n })
            : t('See you {date} at {time}.', when)}
        </Text>
        <Text style={st.doneP}>
          {n
            ? t("{name} will reach out shortly to confirm the team. Keep these references — you'll need them to reschedule or cancel.", { name: tenantName })
            : t("{name} will reach out shortly to confirm the team. Keep this reference — you'll need it to reschedule or cancel.", { name: tenantName })}
        </Text>
      </View>

      {!!bookingRef && (
        <View style={st.ref}>
          <Text style={st.refK}>{t('Reference')}</Text>
          <Text style={st.refVal} selectable>{bookingRef}</Text>
          {/* No clipboard module in Expo Go without a new package — the share
              sheet offers Copy instead. */}
          <Pressable onPress={() => { Share.share({ message: bookingRef }).catch(() => {}); }} style={({ pressed }) => [st.copy, pressed && { backgroundColor: bf.hover }]}>
            <Text style={st.copyText}>{t('Copy')}</Text>
          </Pressable>
        </View>
      )}

      <View>
        <Text style={st.details}>
          <Text style={{ color: bf.muted }}>
            {n ? `${t('Visit {n}', { n: 1 })} · ${when.date} ${when.time} · ` : `${t('Service')} · `}
          </Text>
          <Text style={st.detailsB}>{serviceName}</Text>
        </Text>
        {!!addons?.length && (
          <Text style={st.details}>
            <Text style={{ color: bf.muted }}>{`${t('Extras')} · `}</Text>
            <Text style={st.detailsB}>{addons.map(a => a.name).join(' · ')}</Text>
          </Text>
        )}
        {(more ?? []).map((m, i) => (
          <Text key={m.ref || i} style={st.details}>
            <Text style={{ color: bf.muted }}>{`${t('Visit {n}', { n: i + 2 })} · ${fmtDayMid(m.date)} ${fmtBookingTime(m.time, timeFormat)} · `}</Text>
            <Text style={st.detailsB}>{m.serviceName}</Text>
            {!!m.ref && <Text style={st.detailsRef}>{`  ${m.ref}`}</Text>}
          </Text>
        ))}
      </View>

      <View style={st.actions}>
        <Pressable onPress={onBookAgain} style={({ pressed }) => [st.act, st.actPrimary, pressed && { backgroundColor: bf.ink2 }]}>
          <Text style={[st.actText, { color: '#fff' }]}>{t('Book another')}</Text>
        </Pressable>
        <Pressable onPress={onViewBookings} style={({ pressed }) => [st.act, st.actSecondary, pressed && { backgroundColor: bf.hover }]}>
          <Text style={st.actText}>{t('View my bookings')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Payment failed / cancelled ──────────────────────────────────────────────

export function PaymentFailedStep({ tenantName, tone, headline, subtext, onTryAgain, onBack }: {
  tenantName: string; tone: 'red' | 'amber' | 'gray'; headline: string; subtext: string; onTryAgain: () => void; onBack: () => void;
}) {
  const { t } = useT();
  const p = tone === 'red'
    ? { ring: '#fee2e2', solid: '#ef4444', label: '#b91c1c', text: 'Payment failed' }
    : tone === 'amber'
    ? { ring: '#fef3c7', solid: '#f59e0b', label: '#b45309', text: 'Payment not completed' }
    : { ring: gray[200], solid: '#6b7280', label: gray[600], text: 'Payment cancelled' };
  return (
    <View style={{ paddingVertical: 16, alignItems: 'center' }}>
      <View style={st.failMark}>
        <View style={[StyleSheet.absoluteFill, { borderRadius: 40, backgroundColor: p.ring, opacity: 0.45 }]} />
        <View style={[st.failInner, { backgroundColor: p.ring }]} />
        <View style={[st.failSolid, { backgroundColor: p.solid }]}><XCircle size={36} color="#fff" strokeWidth={3} /></View>
      </View>
      <Text style={[st.failLabel, { color: p.label }]}>{t(p.text)}</Text>
      <Text style={st.failH1}>{headline}</Text>
      <Text style={st.failP}>{subtext}</Text>

      <View style={st.failCard}>
        <View style={st.failRow}>
          <XCircle size={16} color={gray[400]} strokeWidth={2.5} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={st.failRowT}>{t('Booking not created')}</Text>
            <Text style={st.failRowP}>{t("Your slot has been released. Nothing is on {name}'s calendar.", { name: tenantName })}</Text>
          </View>
        </View>
        <View style={[st.failRow, { paddingTop: 8, borderTopWidth: 1, borderTopColor: gray[100] }]}>
          <XCircle size={16} color={gray[400]} strokeWidth={2.5} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={st.failRowT}>{t('Payment not captured')}</Text>
            <Text style={st.failRowP}>{t('No card was charged and no funds were moved. You may see a pending authorisation that will drop off in a few days.')}</Text>
          </View>
        </View>
      </View>

      <View style={st.failActions}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={st.failBack}>{t('Back to site')}</Text></Pressable>
        <Text style={{ color: gray[300] }}>·</Text>
        <Pressable onPress={onTryAgain} style={st.failTry}><Text style={st.failTryText}>{t('Try again')}</Text></Pressable>
      </View>
    </View>
  );
}

// ── Waiting for HitPay (web PaymentReturn "checking") ───────────────────────

export function PayingStep({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  const { t } = useT();
  return (
    <View style={{ alignItems: 'center', gap: 14, paddingVertical: 40 }}>
      <ActivityIndicator size="large" color={accent} accessibilityLabel={t('Checking payment')} />
      <Text style={[st.failRowT, { fontSize: 14, textAlign: 'center' }]}>{t('Waiting for your payment to go through…')}</Text>
      <Text style={[st.failRowP, { fontSize: 12.5, textAlign: 'center' }]}>{t('This screen updates by itself.')}</Text>
      <Pressable onPress={onCancel} disabled={busy} style={{ padding: 10 }}>
        <Text style={{ color: bf.danger, fontWeight: '600', fontSize: 13 }}>{busy ? t('Checking…') : t('I cancelled the payment')}</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  review: { backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 10, overflow: 'hidden' },
  reviewRow: { flexDirection: 'row', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: line2 },
  reviewK: { width: 88, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.89, textTransform: 'uppercase', color: bf.muted, paddingTop: 3 },
  reviewV: { flex: 1, minWidth: 0, gap: 4 },
  reviewVal: { fontSize: 13.5, color: bf.ink, fontWeight: '500', lineHeight: 19.5 },
  reviewNote: { fontSize: 11.5, color: bf.muted, lineHeight: 17 },

  done: { paddingVertical: 28, paddingHorizontal: 4, alignItems: 'center', gap: 18 },
  doneMark: { width: 56, height: 56, borderRadius: 28, backgroundColor: bf.goodSoft, borderWidth: 1, borderColor: 'rgba(8,96,72,0.16)', alignItems: 'center', justifyContent: 'center' },
  doneKicker: { fontSize: 10.5, fontWeight: '700', letterSpacing: 2.3, textTransform: 'uppercase', color: bf.good },
  doneH2: { marginTop: 8, fontSize: 20, fontWeight: '600', letterSpacing: -0.4, lineHeight: 23, color: bf.ink, textAlign: 'center' },
  doneP: { marginTop: 8, fontSize: 14, color: bf.ink3, lineHeight: 21.7, textAlign: 'center' },
  ref: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 10, alignSelf: 'stretch' },
  refK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 2.3, textTransform: 'uppercase', color: bf.muted },
  refVal: { flex: 1, fontFamily: mono, fontSize: 15, fontWeight: '600', color: bf.ink, letterSpacing: 0.3 },
  copy: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: bf.line, borderRadius: 6 },
  copyText: { fontSize: 11.5, color: bf.ink3, fontWeight: '500' },
  details: { fontSize: 12.5, color: bf.ink3, lineHeight: 20, textAlign: 'center' },
  detailsB: { color: bf.ink, fontWeight: '600' },
  detailsRef: { fontFamily: mono, fontSize: 11, color: bf.muted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  act: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  actPrimary: { backgroundColor: bf.ink },
  actSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line },
  actText: { fontSize: 13, fontWeight: '600', color: bf.ink },

  failMark: { width: 80, height: 80, marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  failInner: { position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderRadius: 32 },
  failSolid: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  failLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2.2, textTransform: 'uppercase' },
  failH1: { fontSize: 30, fontWeight: '700', letterSpacing: -0.75, color: gray[900], marginTop: 8, textAlign: 'center' },
  failP: { fontSize: 14, color: gray[500], marginTop: 8, textAlign: 'center', lineHeight: 20 },
  failCard: { marginTop: 24, alignSelf: 'stretch', borderRadius: 16, borderWidth: 1, borderColor: gray[100], backgroundColor: '#fff', padding: 20, gap: 10 },
  failRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  failRowT: { fontSize: 12, fontWeight: '600', color: gray[900] },
  failRowP: { fontSize: 12, color: gray[500], marginTop: 2, lineHeight: 16 },
  failActions: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  failBack: { fontSize: 12, fontWeight: '600', color: gray[500] },
  failTry: {
    backgroundColor: accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  failTryText: { fontSize: 12, fontWeight: '600', color: '#fff' },
});
