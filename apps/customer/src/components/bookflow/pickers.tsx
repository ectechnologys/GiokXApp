// Web ServiceStep (service cards + "Add extras" pill) and the time column of
// DateTimeStep (.bf-time-panel: times, "Your team" pills), plus the closed /
// suspended panels.
import { Check, Clock, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { durationLabel, type ServiceRow } from '@/lib/booking';
import { fmtBookingTime, useT } from '@/lib/i18n';
import { accent, bf } from '@/lib/theme';

import { fmtDayShort, Kicker, line2, mono, pressedLine, rm, StepHead } from './atoms';

export interface ServiceCard {
  svc: ServiceRow;
  /** Lowest price (member + peak for the picked date), null = none set. */
  from: number | null;
  disabled: boolean;
}

export function ServiceStep({ cards, value, onChange, isMember, addonCount, pickedCount, onOpenAddons }: {
  cards: ServiceCard[];
  value: string | null;
  onChange: (svc: ServiceRow) => void;
  isMember: boolean;
  addonCount: number;
  pickedCount: number;
  onOpenAddons: () => void;
}) {
  const { t } = useT();
  return (
    <View>
      <StepHead title={t('Choose your service')} sub={t("Pick the one that fits — you'll pick a time next.")} />
      {cards.length === 0 ? (
        <Text style={st.empty}>{t('No services published yet. Check back soon.')}</Text>
      ) : (
        <View style={{ gap: 8 }}>
          {cards.map(({ svc, from, disabled }) => {
            const active = value === svc.id;
            const color = (svc as ServiceRow & { calendar_color?: string | null }).calendar_color || accent;
            return (
              <Pressable key={svc.id} disabled={disabled} onPress={() => onChange(svc)}
                style={({ pressed }) => [st.svc, pressed && !active && st.svcPressed, active && st.svcActive, disabled && st.svcDisabled]}>
                <View style={st.mark}>
                  {active ? <Check size={16} color={bf.ink} strokeWidth={2.6} /> : <View style={[st.markDot, { backgroundColor: color }]} />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.name}>{svc.name}</Text>
                  {svc.description ? <Text style={st.desc} numberOfLines={3}>{svc.description}</Text> : null}
                  <View style={st.meta}>
                    <Clock size={12} color={bf.muted} />
                    <Text style={st.metaText}>{durationLabel(svc)}</Text>
                  </View>
                </View>
                {from !== null && (
                  <View style={st.price}>
                    <Text style={st.priceSmall}>{t('From')}</Text>
                    <Text style={st.priceVal}>{rm(from)}</Text>
                    {isMember && <Text style={st.member}>{t('Member')}</Text>}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      {value && addonCount > 0 && (
        <View style={st.extrasRow}>
          <View style={{ gap: 3 }}>
            <Kicker>{t('Optional')}</Kicker>
            <Text style={st.extrasT}>{t('Extras for this booking')}</Text>
          </View>
          <Pressable onPress={onOpenAddons} style={({ pressed }) => [st.extrasBtn, pressed && { backgroundColor: bf.ink2 }]}>
            {pickedCount > 0 ? (
              <>
                <View style={st.extrasDot} />
                <Text style={st.extrasBtnText}>
                  {pickedCount === 1 ? t('{n} extra added', { n: pickedCount }) : t('{n} extras added', { n: pickedCount })}
                </Text>
              </>
            ) : (
              <>
                <View style={st.extrasPlus}><Plus size={10} color="#fff" strokeWidth={2.6} /></View>
                <Text style={st.extrasBtnText}>{t('Add extras')}</Text>
              </>
            )}
            <View style={st.badge}><Text style={st.badgeText}>{addonCount}</Text></View>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export interface TimeRow { time: string; price: number | null; blocked: boolean }

export function TimesPanel({ date, rows, timeFormat, time, onTime, maids, maidId, onMaid, emptyHint }: {
  date: string | null;
  /** null = no service yet (date-first, nothing to list). */
  rows: TimeRow[] | null;
  timeFormat: '12h' | '24h';
  time: string | null;
  onTime: (t: string) => void;
  maids: { id: string; label: string }[];
  maidId: string | null;
  onMaid: (id: string | null) => void;
  emptyHint?: boolean;
}) {
  const { t } = useT();
  return (
    <View style={st.panel}>
      <Kicker style={{ marginBottom: 8 }}>{date ? t('Times') : t('Pick a date first')}</Kicker>
      {date && <Text style={st.panelDate}>{fmtDayShort(date)}</Text>}
      {!date ? (
        emptyHint ? <View style={st.timeEmpty}><Text style={st.timeEmptyText}>{t("Time slots appear once you've picked a date.")}</Text></View> : null
      ) : (
        <View style={{ gap: 4 }}>
          {(rows ?? []).map(r => {
            const on = time === r.time && !r.blocked;
            return (
              <Pressable key={r.time} disabled={r.blocked} onPress={() => onTime(r.time)}
                style={({ pressed }) => [st.time, pressed && !on && st.timePressed, on && st.timeOn, r.blocked && st.timeOff]}>
                <Text style={[st.timeText, on && { color: '#fff' }, r.blocked && st.strike]}>{fmtBookingTime(r.time, timeFormat)}</Text>
                {r.price != null && r.price > 0 && (
                  <Text style={[st.timePrice, on && { color: 'rgba(255,255,255,0.72)' }, r.blocked && st.strike]}>{rm(r.price)}</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
      {date && time && maids.length > 0 && (
        <View style={st.maids}>
          <Kicker style={{ marginBottom: 8 }}>{t('Your team')}</Kicker>
          <View style={st.maidList}>
            {[{ id: null as string | null, label: t('Any available') }, ...maids].map(m => {
              const on = m.id === null ? !maidId : maidId === m.id;
              return (
                <Pressable key={m.id ?? 'any'} onPress={() => onMaid(m.id === null ? null : maidId === m.id ? null : m.id)}
                  style={[st.maid, on && st.maidOn]}>
                  <Text style={[st.maidText, on && { color: '#fff' }]}>{m.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={st.maidNote}>
            {t("Free to choose — we'll hold them for this visit. Where a job takes two people, the one you pick is the one we promise. If they become unavailable before you finish, we'll say so.")}
          </Text>
        </View>
      )}
    </View>
  );
}

/** Kill switch (web step 1 when config.bookingsPaused). */
export function ClosedStep({ tenantName }: { tenantName: string }) {
  const { t } = useT();
  return (
    <View>
      <StepHead title={t('Not taking bookings right now')} sub={t('{name} has paused online booking for the moment.', { name: tenantName })} />
      <View style={st.closed}>
        <Text style={st.closedT}>{t('Please check back soon')}</Text>
        <Text style={st.closedP}>{t("Nothing you've booked before is affected. If you need something urgently, get in touch with us directly.")}</Text>
      </View>
    </View>
  );
}

export function SuspendedNote() {
  const { t } = useT();
  return (
    <View style={st.susp}>
      <Text style={[st.suspText, { fontWeight: '700', marginBottom: 2 }]}>{t('Bookings are unavailable on this account')}</Text>
      <Text style={st.suspText}>{t("Please contact us and we'll help sort it out.")}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  empty: { fontSize: 14, color: '#9ca3af', fontStyle: 'italic', marginTop: 32 },
  svc: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 10 },
  svcPressed: { borderColor: pressedLine, backgroundColor: bf.hover },
  svcActive: { borderColor: bf.ink, borderWidth: 2, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: bf.paper },
  svcDisabled: { opacity: 0.45, backgroundColor: bf.raised },
  mark: { width: 34, height: 34, borderRadius: 8, backgroundColor: bf.hover, alignItems: 'center', justifyContent: 'center' },
  markDot: { width: 14, height: 14, borderRadius: 4 },
  name: { fontSize: 13.5, fontWeight: '600', lineHeight: 17, color: bf.ink },
  desc: { fontSize: 11.5, color: bf.muted, marginTop: 3, lineHeight: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  metaText: { fontSize: 11.5, color: bf.muted },
  price: { alignItems: 'flex-end', gap: 2, paddingLeft: 8 },
  priceSmall: { fontSize: 9.5, fontWeight: '500', color: bf.muted, letterSpacing: 1.33, textTransform: 'uppercase' },
  priceVal: { fontSize: 13, fontWeight: '600', color: bf.ink },
  member: { fontSize: 11, fontWeight: '600', color: accent, marginTop: 1 },

  extrasRow: { marginTop: 24, paddingTop: 22, borderTopWidth: 1, borderTopColor: line2, gap: 12 },
  extrasT: { fontSize: 13.5, color: bf.ink2, fontWeight: '500' },
  extrasBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: bf.ink, borderRadius: 999,
    paddingTop: 9, paddingBottom: 9, paddingLeft: 16, paddingRight: 12,
    shadowColor: '#14140f', shadowOpacity: 0.55, shadowRadius: 11, shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  extrasBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '500' },
  extrasPlus: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
  extrasDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: accent },
  badge: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  badgeText: { fontFamily: mono, fontSize: 10.5, color: 'rgba(255,255,255,0.72)' },

  panel: { backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 10, padding: 14 },
  panelDate: { fontSize: 13.5, fontWeight: '600', color: bf.ink, marginBottom: 12 },
  time: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: bf.line, borderRadius: 6, backgroundColor: '#fff' },
  timePressed: { borderColor: pressedLine, backgroundColor: bf.hover },
  timeOn: { backgroundColor: bf.ink, borderColor: bf.ink },
  timeOff: { backgroundColor: bf.raised },
  timeText: { fontSize: 13, fontWeight: '500', color: bf.ink },
  timePrice: { fontSize: 11.5, fontWeight: '500', color: bf.muted },
  strike: { color: bf.muted2, textDecorationLine: 'line-through' },
  timeEmpty: { paddingVertical: 28, paddingHorizontal: 20, backgroundColor: bf.raised, borderWidth: 1, borderStyle: 'dashed', borderColor: bf.line, borderRadius: 8 },
  timeEmptyText: { textAlign: 'center', color: bf.muted, fontSize: 12.5, lineHeight: 19 },
  maids: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: bf.line },
  maidList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  maid: { paddingVertical: 7, paddingHorizontal: 12, borderWidth: 1, borderColor: bf.line, borderRadius: 999, backgroundColor: '#fff' },
  maidOn: { backgroundColor: bf.ink, borderColor: bf.ink },
  maidText: { fontSize: 12.5, fontWeight: '500', color: bf.ink },
  maidNote: { marginTop: 8, fontSize: 11.5, lineHeight: 17, color: bf.muted },

  closed: { gap: 6, marginTop: 18, paddingVertical: 26, paddingHorizontal: 24, borderRadius: 12, backgroundColor: bf.raised, borderWidth: 1, borderColor: bf.line, alignItems: 'center' },
  closedT: { fontSize: 15, fontWeight: '600', color: bf.ink, textAlign: 'center' },
  closedP: { fontSize: 12.5, lineHeight: 19, color: bf.muted, textAlign: 'center' },
  susp: { borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 },
  suspText: { color: '#991b1b', fontSize: 13, lineHeight: 19 },
});
