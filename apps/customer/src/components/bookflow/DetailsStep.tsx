// Web DetailsStep ("Where should we come?") for a signed-in customer: saved
// address picker, lock banner, address fields, coverage verdict, lobby note
// and the note for the team. The web's Google map / Places autocomplete is
// not in the app yet — a marked placeholder sits where the map goes.
import { router } from 'expo-router';
import { ArrowLeft, Lock, MapPin, Plus } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SavedAddress } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { CoverageVerdict } from '@/lib/settings';
import { bf, gray } from '@/lib/theme';

import { AddressSearchField } from '@/components/AddressSearchField';
import { MapPinPicker } from '@/components/MapPinPicker';
import { geocode } from '@/lib/places';

import { BfField, FsetHead, Kicker, mono, StepHead } from './atoms';

export interface AddrDraft { unit: string; address: string; postcode: string; city: string; lobby: string; lat?: number | null; lng?: number | null }

const cap = (v: string) => v.replace(/[a-zA-Z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

export function DetailsStep({ firstName, saved, addrId, onPick, onUseNew, draft, setDraft, chosen, coverage, notes, setNotes }: {
  firstName: string;
  saved: SavedAddress[];
  /** A saved address id, or '__new'. */
  addrId: string;
  onPick: (id: string) => void;
  onUseNew: () => void;
  draft: AddrDraft;
  setDraft: (d: AddrDraft) => void;
  chosen: SavedAddress | null;
  coverage: CoverageVerdict | null;
  notes: string;
  setNotes: (v: string) => void;
}) {
  const { t, lang } = useT();
  const showPicker = saved.length > 1;
  const locked = !!chosen;
  const v: AddrDraft = chosen
    ? { unit: chosen.unit_number ?? '', address: chosen.address ?? '', postcode: chosen.postcode ?? '', city: chosen.city ?? '', lobby: chosen.lobby_note ?? '' }
    : draft;
  const set = (k: keyof AddrDraft, val: string) => setDraft({ ...draft, [k]: val });
  const addrLine = (a: SavedAddress) => [a.unit_number, a.address].filter(Boolean).join(', ') || a.address || t('Saved address');
  const lat = chosen ? chosen.lat : draft.lat, lng = chosen ? chosen.lng : draft.lng;
  // Web: a typed unit + street finds the pin (new address only).
  const picked = useRef(false);
  useEffect(() => {
    if (locked) return;
    if (picked.current) { picked.current = false; return; }
    if (!draft.unit.trim() || !draft.address.trim()) return;
    const h = setTimeout(async () => {
      const q = [draft.unit.trim(), draft.address.trim(), draft.postcode.trim(), draft.city.trim(), 'Malaysia'].filter(Boolean).join(', ');
      const c = await geocode(q).catch(() => null);
      if (c) setDraft({ ...draft, lat: c.lat, lng: c.lng });
    }, 700);
    return () => clearTimeout(h);
  }, [draft.unit, draft.address]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View>
      <StepHead title={t('Where should we come?')} sub={t("We've pre-filled what we know, {name}.", { name: firstName })} />

      {showPicker && (
        <View style={st.picker}>
          <View style={st.pickerH}>
            <MapPin size={14} color={bf.muted} strokeWidth={2.5} />
            <Kicker>{t('Use a saved address')}</Kicker>
            <Text style={st.count}>{t('{n} on file', { n: saved.length })}</Text>
          </View>
          <View style={{ gap: 5 }}>
            {saved.map((a, i) => {
              const on = addrId === a.id;
              return (
                <Pressable key={a.id} onPress={() => onPick(a.id)} style={[st.row, on && st.rowOn]}>
                  <Radio on={on} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.line} numberOfLines={1}>{addrLine(a)}</Text>
                    {(a.postcode || a.city) ? <Text style={st.sub}>{[a.postcode, a.city].filter(Boolean).join(' ')}</Text> : null}
                  </View>
                  {i === 0 && <View style={st.badge}><Text style={st.badgeText}>{t('Primary')}</Text></View>}
                </Pressable>
              );
            })}
            <Pressable onPress={onUseNew} style={[st.row, st.rowNew, addrId === '__new' && st.rowNewOn]}>
              <Radio on={addrId === '__new'} />
              <Plus size={14} color={bf.muted} strokeWidth={2.5} />
              <Text style={st.newText}>{t('Use a new address (just this booking)')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {addrId === '__new' && saved.length === 1 && (
        <Pressable onPress={() => onPick(saved[0].id)} style={[st.cta, { marginBottom: 12 }]}>
          <ArrowLeft size={12} color={bf.ink} strokeWidth={2.5} />
          <Text style={st.ctaText}>{t('Back to your saved address')}</Text>
        </Pressable>
      )}

      {locked && (
        <View style={st.lock}>
          <Lock size={14} color={bf.muted} strokeWidth={2.5} style={{ marginTop: 2 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={st.lockT}>{t('Locked to your saved address')}</Text>
            <Text style={st.lockP}>
              {lang === 'zh' ? '可在' : 'Manage it in '}
              <Text style={st.link} onPress={() => router.push('/account')}>{lang === 'zh' ? '个人资料' : 'your profile'}</Text>
              {lang === 'zh' ? '中管理，或 ' : ', or '}
              <Text style={[st.link, { fontWeight: '600' }]} onPress={onUseNew}>{t('use a different address just this booking')}</Text>
              {lang === 'zh' ? '。' : '.'}
            </Text>
          </View>
        </View>
      )}

      <View style={st.fset}>
        <FsetHead label={t('Address')} />
        <BfField label={t('Unit / House No.')} required locked={locked} value={v.unit} placeholder="A-12-34"
          onChangeText={x => set('unit', cap(x))} />
        {locked ? (
          <BfField label={t('Street & building')} required locked value={v.address} placeholder={t('Street address')}
            icon={<MapPin size={16} color={bf.muted2} strokeWidth={2} />} onChangeText={x => set('address', x)} />
        ) : (
          <AddressSearchField label={t('Street & building')} required value={v.address} onChangeText={x => set('address', x)}
            onPick={p => { picked.current = true; setDraft({ ...draft, address: p.address, postcode: p.postcode, city: p.city, lat: p.lat, lng: p.lng }); }} />
        )}
        <BfField label={t('City')} locked={locked} value={v.city} placeholder="Kuala Lumpur" onChangeText={x => set('city', x)} />
        <BfField label={t('Postcode')} locked={locked} value={v.postcode} placeholder="50460" keyboardType="number-pad"
          onChangeText={x => set('postcode', x)} />

        <MapPinPicker coords={lat != null && lng != null ? { lat, lng } : null} height={160} locked={locked}
          onCoordsChange={c => setDraft({ ...draft, lat: c.lat, lng: c.lng })} />

        {coverage && <CoverageNote v={coverage} />}

        <BfField label={t('Lobby / access note (optional)')} locked={locked} value={v.lobby}
          placeholder={t('e.g. Register at reception, take lift A')} onChangeText={x => set('lobby', cap(x))} />
      </View>

      <View style={st.fset}>
        <FsetHead label={t('For the team')} />
        <BfField label={t('Anything else? (optional)')} textarea numberOfLines={2} value={notes} onChangeText={setNotes}
          placeholder={t('Pet at home, key under mat, special instructions…')} />
      </View>
    </View>
  );
}

function Radio({ on }: { on: boolean }) {
  return <View style={[st.radio, on && { borderColor: bf.ink }]}>{on && <View style={st.radioDot} />}</View>;
}

function CoverageNote({ v }: { v: CoverageVerdict }) {
  const { t, lang } = useT();
  const tone = v.kind === 'covered' ? 'ok' : v.kind === 'coming_soon' ? 'warn' : 'err';
  const c = tone === 'ok' ? { bg: '#ecfdf5', bd: '#a7f3d0', fg: '#047857' }
    : tone === 'warn' ? { bg: '#fffbeb', bd: '#fde68a', fg: '#b45309' }
    : { bg: '#fef2f2', bd: '#fecaca', fg: '#b91c1c' };
  const b = (s: string) => <Text style={{ fontWeight: '700' }}>{s}</Text>;
  return (
    <View style={[st.cov, { backgroundColor: c.bg, borderColor: c.bd }]}>
      <Text style={[st.covText, { color: c.fg }]}>{tone === 'ok' ? '✓' : tone === 'warn' ? '🔜' : '✕'}</Text>
      <Text style={[st.covText, { color: c.fg, flex: 1 }]}>
        {v.kind === 'covered' && (lang === 'zh'
          ? <>您的地址在我们的 {b(v.zoneName)} 服务范围内。</>
          : <>Your address is inside our {b(v.zoneName)} coverage area.</>)}
        {v.kind === 'coming_soon' && (lang === 'zh'
          ? <>我们暂未覆盖 {b(v.zoneName)}，该地区即将开通，所以暂时无法接受此预约。抱歉！</>
          : <>We&apos;re not in {b(v.zoneName)} just yet — this area is coming soon, so we can&apos;t take this booking. Sorry!</>)}
        {v.kind === 'outside' && t("Sorry — this address looks outside our current service area, so we can't take this booking yet.")}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  picker: { borderWidth: 1, borderColor: bf.line, backgroundColor: bf.raised, borderRadius: 10, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12, marginTop: -6, marginBottom: 18 },
  pickerH: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  count: { marginLeft: 'auto', fontSize: 10.5, fontWeight: '600', color: bf.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 8 },
  rowOn: { borderColor: bf.ink, borderWidth: 2, paddingVertical: 8, paddingHorizontal: 11 },
  rowNew: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  rowNewOn: { backgroundColor: '#fff', borderStyle: 'solid', borderColor: bf.ink, borderWidth: 2, paddingVertical: 8, paddingHorizontal: 11 },
  radio: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: bf.muted2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: bf.ink },
  line: { fontSize: 12.5, fontWeight: '500', color: bf.ink },
  sub: { fontSize: 11, color: bf.muted, marginTop: 2 },
  badge: { borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: bf.goodSoft },
  badgeText: { fontSize: 9.5, fontWeight: '700', letterSpacing: 1.52, textTransform: 'uppercase', color: bf.good },
  newText: { fontSize: 12.5, fontWeight: '500', color: bf.ink3, flexShrink: 1 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  ctaText: { fontSize: 11.5, fontWeight: '600', color: bf.ink, textDecorationLine: 'underline' },
  lock: { flexDirection: 'row', gap: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: bf.raised, borderWidth: 1, borderColor: '#ecead9', borderRadius: 8, marginBottom: 12 },
  lockT: { fontSize: 11.5, fontWeight: '600', color: bf.ink },
  lockP: { fontSize: 11.5, color: bf.ink3, marginTop: 2, lineHeight: 17 },
  link: { color: bf.ink, textDecorationLine: 'underline' },
  fset: { gap: 10, marginBottom: 18 },
  map: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: gray[200] },
  mapArea: { height: 160, backgroundColor: gray[100], alignItems: 'center', justifyContent: 'center', gap: 6 },
  mapText: { fontSize: 11, fontWeight: '600', color: gray[500] },
  mapFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: gray[50], borderTopWidth: 1, borderTopColor: gray[100] },
  mapPin: { fontSize: 11, color: gray[400], fontFamily: mono },
  cov: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  covText: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
});
