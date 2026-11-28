// Multi-date checkout (web BookingFlowPage: MultiPick, MULTI_MAX, the
// .bf-multi-tick pill on the date step and MultiAddonPrompt, the per-visit
// "Add extras to any visit" sheet raised on Continue).
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { priceAddons, type AddonRow } from '@/lib/booking';
import { fmtBookingTime, useT } from '@/lib/i18n';
import { accent, accentSoft, accentTint, bf } from '@/lib/theme';

import { fmtDayMid, line2, Sheet, Tick } from './atoms';

/** Web MULTI_MAX — payments-start refuses more than 10 visits. */
export const MULTI_MAX = 10;

/** One completed visit. Prices are display-only — the server re-prices every
 *  visit from its own date's member gate. */
export interface MultiPick {
  dateKey: string;
  serviceId: string;
  serviceName: string;
  time: string;
  /** Visit total = basePrice + extras. */
  price: number;
  /** Slot price alone (member + peak for this visit's date). */
  basePrice: number;
  addons: { id: string; name: string; price: number }[];
  /** Pick order (the first-picked member special wins in 'single' mode). */
  addonIds: string[];
  /** Every add-on this visit's service offers, snapshotted at pick time. */
  serviceAddons: AddonRow[];
  /** Member on THIS visit's date. */
  member: boolean;
  peakName?: string;
  requestedMaidId?: string | null;
  requestedMaidLabel?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "☐ Book multiple dates  up to 10 · one payment" (web .bf-multi-tick). */
export function MultiTick({ on, onToggle }: { on: boolean; onToggle: (on: boolean) => void }) {
  const { t } = useT();
  return (
    <Pressable onPress={() => onToggle(!on)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
      style={({ pressed }) => [st.tick, pressed && { backgroundColor: bf.hover }]}>
      <Tick on={on} size={15} radius={3} />
      <Text style={st.tickLabel}>{t('Book multiple dates')}</Text>
      <Text style={st.tickEm}>{t('up to {n} · one payment', { n: MULTI_MAX })}</Text>
    </Pressable>
  );
}

/** Extras chosen for a visit in the sheet, each priced by that visit's own
 *  membership and the member-special mode (web priceMemberAddonSet). */
function visitChosen(v: MultiPick, ids: string[] | undefined): AddonRow[] {
  if (!ids?.length) return [];
  return ids.map(id => v.serviceAddons.find(a => a.id === id)).filter((a): a is AddonRow => !!a);
}

/** Apply the sheet's picks: each visit gets ITS OWN extras, re-summed. */
export function applyVisitAddons(picks: MultiPick[], selection: Record<string, string[]>, mode: 'single' | 'all'): MultiPick[] {
  return picks.map(p => {
    const chosen = visitChosen(p, selection[p.dateKey]);
    if (!chosen.length) return p;
    const eff = priceAddons(chosen, p.member, mode);
    const priceOf = (a: AddonRow) => eff.get(a.id) ?? Number(a.price ?? 0);
    const extras = chosen.reduce((s, a) => s + priceOf(a), 0);
    return {
      ...p,
      addonIds: chosen.map(a => a.id),
      addons: chosen.map(a => ({ id: a.id, name: a.name, price: priceOf(a) })),
      price: r2(p.basePrice + extras),
    };
  });
}

/** Web MultiAddonPrompt: the visits with no extras yet, each with its own
 *  service's add-ons — a tick targets that one visit only. */
export function MultiAddonPrompt({ open, onClose, onConfirm, visits, tenantName, memberMode, timeFormat }: {
  open: boolean;
  onClose: () => void;
  /** { dateKey: [addonIds in pick order] } for the visits that got extras. */
  onConfirm: (selection: Record<string, string[]>) => void;
  visits: MultiPick[];
  tenantName: string;
  memberMode: 'single' | 'all';
  timeFormat: '12h' | '24h';
}) {
  const { t } = useT();
  const [sel, setSel] = useState<Record<string, string[]>>({});
  // Every opening starts empty (web: reset on open).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) { setWasOpen(open); if (open) setSel({}); }

  const toggle = (k: string, id: string) => setSel(prev => {
    const cur = prev[k] ?? [];
    return { ...prev, [k]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
  });
  const count = Object.values(sel).reduce((s, x) => s + x.length, 0);
  const visitExtras = (v: MultiPick) => {
    const chosen = visitChosen(v, sel[v.dateKey]);
    if (!chosen.length) return 0;
    const eff = priceAddons(chosen, v.member, memberMode);
    return chosen.reduce((s, a) => s + (eff.get(a.id) ?? Number(a.price ?? 0)), 0);
  };
  // Browse price per option: in 'single' mode the first special ticked on this
  // visit keeps the member price; the rest show standard.
  const optPrice = (v: MultiPick, a: AddonRow) => {
    let p = a.is_member_special && v.member ? Number(a.member_price ?? 0) : Number(a.price ?? 0);
    if (v.member && memberMode === 'single' && a.is_member_special) {
      const claimed = visitChosen(v, sel[v.dateKey]).find(x => x.is_member_special)?.id ?? null;
      if (claimed && a.id !== claimed) p = Number(a.price ?? 0);
    }
    return p;
  };
  const total = visits.reduce((s, v) => s + visitExtras(v), 0);

  return (
    <Sheet open={open} onClose={onClose}>
      <View style={st.head}>
        <Text style={st.headK}>{t('Optional extras')}</Text>
        <Pressable onPress={onClose} hitSlop={8} style={st.x} accessibilityLabel={t('Close')}>
          <X size={16} color={bf.muted2} strokeWidth={2.5} />
        </Pressable>
        <Text style={st.headT}>{t('Add extras to any visit')}</Text>
        <Text style={st.headP}>
          {visits.length === 1 ? t('This visit has no extras yet.') : t('These {n} visits have no extras yet.', { n: visits.length })}{' '}
          {t('Anything you tick is added to that visit only — {name} bills each visit separately.', { name: tenantName })}
        </Text>
      </View>

      <ScrollView style={st.body} contentContainerStyle={{ padding: 14, gap: 12 }}>
        {visits.map((v, i) => {
          const n = sel[v.dateKey]?.length ?? 0;
          return (
            <View key={v.dateKey} style={st.card}>
              <View style={st.cardHead}>
                <View style={st.idx}><Text style={st.idxText}>{i + 1}</Text></View>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text style={st.when} numberOfLines={1}>{`${fmtDayMid(v.dateKey)} · ${fmtBookingTime(v.time, timeFormat)}`}</Text>
                  <Text style={st.svc} numberOfLines={1}>{v.serviceName}</Text>
                </View>
                <Text style={[st.sub, n > 0 && st.subOn]}>{n > 0 ? `+ RM ${r2(visitExtras(v))}` : t('No extras')}</Text>
              </View>
              <View style={{ padding: 4 }}>
                {v.serviceAddons.map(a => {
                  const on = sel[v.dateKey]?.includes(a.id) ?? false;
                  return (
                    <Pressable key={a.id} onPress={() => toggle(v.dateKey, a.id)}
                      style={({ pressed }) => [st.opt, on && { backgroundColor: accentTint }, pressed && !on && { backgroundColor: bf.hover }]}>
                      <Tick on={on} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.optName}>{a.name}</Text>
                        {a.description ? <Text style={st.optDesc}>{a.description}</Text> : null}
                      </View>
                      <Text style={st.optPrice}>RM {optPrice(v, a)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={st.foot}>
        <Text style={st.footText}>
          {count > 0 ? (
            <>
              {count > 1 ? t('{n} extras', { n: count }) : t('{n} extra', { n: count })}
              <Text> · <Text style={st.footTotal}>{`RM ${total.toFixed(2).replace(/\.00$/, '')}`}</Text></Text>
            </>
          ) : t('No extras added')}
        </Text>
        <Pressable onPress={() => onConfirm(sel)} style={({ pressed }) => [st.footBtn, pressed && { backgroundColor: bf.ink2 }]}>
          <Text style={st.footBtnText}>{count > 0 ? t('Add {n} & continue', { n: count }) : t('No thanks, continue')}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  tick: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingVertical: 7, paddingHorizontal: 12,
    backgroundColor: bf.raised, borderWidth: 1, borderColor: bf.line, borderRadius: 10,
  },
  tickLabel: { fontSize: 12.5, fontWeight: '600', color: bf.ink2 },
  tickEm: { fontSize: 11, fontWeight: '500', color: bf.muted },

  head: { paddingTop: 18, paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: line2 },
  headK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 2.1, textTransform: 'uppercase', color: accent, marginBottom: 5 },
  x: { position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  headT: { fontSize: 16, fontWeight: '600', letterSpacing: -0.16, color: bf.ink, marginBottom: 5 },
  headP: { fontSize: 12.5, color: bf.muted, lineHeight: 19 },
  body: { flexGrow: 0, flexShrink: 1, backgroundColor: bf.ground },
  card: { backgroundColor: bf.paper, borderWidth: 1, borderColor: bf.line, borderRadius: 12, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: bf.raised, borderBottomWidth: 1, borderBottomColor: line2 },
  idx: { width: 22, height: 22, borderRadius: 11, backgroundColor: bf.ink, alignItems: 'center', justifyContent: 'center' },
  idxText: { color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  when: { fontSize: 12.5, fontWeight: '600', color: bf.ink },
  svc: { fontSize: 11, color: bf.muted },
  sub: { fontSize: 11, fontWeight: '600', color: bf.muted2, fontVariant: ['tabular-nums'] },
  subOn: { color: accent, backgroundColor: accentSoft, paddingVertical: 2, paddingHorizontal: 9, borderRadius: 999, overflow: 'hidden' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 8 },
  optName: { fontSize: 13.5, fontWeight: '500', color: bf.ink },
  optDesc: { fontSize: 11.5, color: bf.muted, marginTop: 2, lineHeight: 16 },
  optPrice: { fontSize: 12.5, fontWeight: '600', color: bf.ink2 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: line2, backgroundColor: bf.paper },
  footText: { fontSize: 12, color: bf.muted, flexShrink: 1 },
  footTotal: { color: bf.ink, fontWeight: '600', fontSize: 13.5 },
  footBtn: { backgroundColor: bf.ink, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  footBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
});
