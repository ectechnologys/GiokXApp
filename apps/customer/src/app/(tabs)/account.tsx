// Account tab — the web's Account Info: "About you" (name, email, locked
// phone), every saved address editable (first = Primary), Add another address,
// and the sticky "Nothing to save / Save changes" bar.
import { Crosshair, Lock, MapPin, Plus, Save, Trash2, User } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { AddressSearchField } from '@/components/AddressSearchField';
import { AppHeader } from '@/components/AppHeader';
import { MapPinPicker } from '@/components/MapPinPicker';
import { InfoCard } from '@/components/web';
import { callFunction, updateProfile, type SavedAddress } from '@/lib/api';
import { currentAddress } from '@/lib/location';
import { geocode } from '@/lib/places';
import { useT } from '@/lib/i18n';
import { queryClient, useProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { judgeCoverage, useDisplaySettings, type CoverageVerdict } from '@/lib/settings';
import { accent, accentSoft, bf, gray } from '@/lib/theme';

const MAX_ADDRESSES = 3;
const titleCase = (v: string) => v.replace(/[a-zA-Z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
const newId = () => `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const blank = (): SavedAddress => ({ id: newId(), unit_number: '', address: '', city: '', postcode: '', lat: null, lng: null, lobby_note: '' });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function Field({ label, required, value, onText, placeholder, icon, ...rest }: {
  label: string; required?: boolean; value: string; onText: (v: string) => void; placeholder?: string; icon?: React.ReactNode;
} & Omit<React.ComponentProps<typeof TextInput>, 'value' | 'onChangeText'>) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? <Text style={{ color: accent, fontWeight: '700' }}>  *</Text> : null}</Text>
      <View style={styles.inputWrap}>
        {icon}
        <TextInput value={value} onChangeText={onText} placeholder={placeholder} placeholderTextColor={bf.muted2} style={styles.input}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} selection={focused ? undefined : { start: 0 }} {...rest} />
      </View>
    </View>
  );
}

function CoverageNote({ verdict }: { verdict: CoverageVerdict | null }) {
  const { t } = useT();
  if (!verdict) return null;
  const ok = verdict.kind === 'covered';
  const soon = verdict.kind === 'coming_soon';
  const c = ok ? { bg: '#ecfdf5', ring: '#d1fae5', fg: '#047857' } : soon ? { bg: '#fffbeb', ring: '#fde68a', fg: '#92400e' } : { bg: '#fef2f2', ring: '#fee2e2', fg: '#b91c1c' };
  const text = verdict.kind === 'covered' ? t('This address is inside our {zone} service area.', { zone: verdict.zoneName })
    : verdict.kind === 'coming_soon' ? t("We're not in {zone} just yet — this area is coming soon. Please use an address inside our service area.", { zone: verdict.zoneName })
      : t('Sorry — this address is outside our service area. Please use an address we cover.');
  return (
    <View style={[styles.cov, { backgroundColor: c.bg, borderColor: c.ring }]}>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '500' }}>{ok ? '✓' : soon ? '🔜' : '✕'}</Text>
      <Text style={{ color: c.fg, fontSize: 12, fontWeight: '500', flex: 1, lineHeight: 17 }}>{text}</Text>
    </View>
  );
}

function AddressCard({ a, primary, verdict, onChange, onDelete }: {
  a: SavedAddress; primary: boolean; verdict: CoverageVerdict | null; onChange: (p: Partial<SavedAddress>) => void; onDelete: () => void;
}) {
  const { t } = useT();
  const [locating, setLocating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const locate = async () => {
    setErr(null); setLocating(true);
    try {
      const l = await currentAddress();
      onChange({ lat: l.lat, lng: l.lng, address: l.address || a.address, postcode: l.postcode || a.postcode, city: l.city || a.city });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLocating(false);
    }
  };
  // Web: a typed unit + address (changed from what was saved) re-finds the pin.
  const initial = useRef({ unit: a.unit_number, address: a.address });
  const picked = useRef(false);
  useEffect(() => {
    if (picked.current) { picked.current = false; return; }
    if (!a.unit_number.trim() || !a.address.trim()) return;
    if (a.unit_number === initial.current.unit && a.address === initial.current.address) return;
    const h = setTimeout(async () => {
      const q = [a.unit_number.trim(), a.address.trim(), a.postcode.trim(), a.city.trim(), 'Malaysia'].filter(Boolean).join(', ');
      const c = await geocode(q).catch(() => null);
      if (c) onChange({ lat: c.lat, lng: c.lng });
    }, 700);
    return () => clearTimeout(h);
  }, [a.unit_number, a.address]); // eslint-disable-line react-hooks/exhaustive-deps
  const coords = a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null;
  return (
    <View style={styles.addrCard}>
      <View style={styles.addrHead}>
        <View style={styles.tile}><MapPin size={16} color={accent} /></View>
        <Text style={styles.addrTitle}>{primary ? t('Primary address') : t('Saved address')}</Text>
        {primary && <View style={styles.primary}><Text style={styles.primaryText}>{t('Primary').toUpperCase()}</Text></View>}
        <Pressable onPress={onDelete} style={styles.remove} hitSlop={6}>
          <Trash2 size={14} color={gray[400]} /><Text style={styles.removeText}>{t('Remove')}</Text>
        </Pressable>
      </View>
      {primary && <Text style={styles.addrHint}>{t('Booking pre-fills from this one. Edit, drag the pin, or pick a new place via the search field.')}</Text>}
      <Field label={t('Unit / House No.')} value={a.unit_number} onText={v => onChange({ unit_number: titleCase(v) })} placeholder="A-12-34" />
      <AddressSearchField label={t('Address')} value={a.address} onChangeText={v => onChange({ address: v })}
        onPick={p => { picked.current = true; onChange({ address: p.address, postcode: p.postcode, city: p.city, lat: p.lat, lng: p.lng }); }} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Field label={t('Postcode')} value={a.postcode} onText={v => onChange({ postcode: v.replace(/\D/g, '') })} keyboardType="number-pad" maxLength={6} /></View>
        <View style={{ flex: 1 }}><Field label={t('City')} value={a.city} onText={v => onChange({ city: v })} /></View>
      </View>
      <Field label={t('Lobby / guard notes (optional)')} value={a.lobby_note} onText={v => onChange({ lobby_note: titleCase(v) })}
        placeholder={t('e.g. Tower B Side Entrance, Ask Guard For #123')} />
      <MapPinPicker coords={coords} onCoordsChange={c => onChange({ lat: c.lat, lng: c.lng })} />
      {!coords && (
        <Pressable onPress={locate} disabled={locating} style={styles.locBtn}>
          {locating ? <ActivityIndicator size="small" color={accent} /> : <Crosshair size={14} color={accent} strokeWidth={2.5} />}
          <Text style={styles.pinBtnText}>{t('Use my current location')}</Text>
        </Pressable>
      )}
      {err && <Text style={{ fontSize: 11, color: '#dc2626' }}>{err}</Text>}
      <CoverageNote verdict={verdict} />
    </View>
  );
}

export default function Account() {
  const { t } = useT();
  const { session, signIn } = useSession();
  const q = useProfile();
  const p = q.data?.customer;
  const coverage = useDisplaySettings().data?.coverage ?? null;
  const enforced = coverage?.enforce_booking === true;

  const initial = useMemo(() => ({ name: p?.name ?? '', email: p?.email ?? '', addresses: q.data?.addresses ?? [] }), [p, q.data?.addresses]);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  // Fresh server data (first load, after a save) resets the form.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setForm(initial); }

  const nameDirty = form.name !== initial.name || form.email !== initial.email;
  const addrDirty = !same(form.addresses, initial.addresses);
  const dirty = nameDirty || addrDirty;
  const atLimit = form.addresses.length >= MAX_ADDRESSES;

  const patchAddr = (i: number, patch: Partial<SavedAddress>) => {
    setOk(false);
    setForm(f => ({ ...f, addresses: f.addresses.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));
  };

  const save = async () => {
    if (!session) return;
    setErr(null); setOk(false);
    if (!form.name.trim()) return setErr(t('Enter your name'));
    if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setErr(t('Enter a valid email'));
    setBusy(true);
    try {
      if (nameDirty) {
        const r = await updateProfile(session.token, { name: form.name.trim(), email: form.email.trim() || undefined });
        await signIn(session.token, { ...session.customer, name: r.customer.name });
      }
      if (addrDirty) {
        await callFunction('customer-auth', {
          action: 'set-addresses',
          addresses: form.addresses
            .filter(a => a.address.trim() || a.unit_number.trim())
            .map(a => ({ ...a, id: a.id.startsWith('new-') ? '' : a.id })),
        }, session.token);
      }
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setOk(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: bf.ground }}>
      <AppHeader />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!p ? <ActivityIndicator color={accent} style={{ marginTop: 40 }} /> : (
            <>
              <InfoCard title={t('About you')} icon={<User size={16} color={accent} />}>
                <Field label={t('Full name')} required value={form.name} onText={v => { setOk(false); setForm(f => ({ ...f, name: titleCase(v) })); }}
                  placeholder={t('e.g. Ahmad Razif')} autoComplete="name" />
                <Field label={t('Email')} value={form.email} onText={v => { setOk(false); setForm(f => ({ ...f, email: v.toLowerCase().replace(/\s/g, '') })); }}
                  placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                <View style={styles.field}>
                  <View style={styles.lockHead}>
                    <Text style={styles.label}>{t('Phone number')}</Text>
                    <View style={styles.lockBadge}><Lock size={10} color={bf.muted} strokeWidth={2.5} /><Text style={styles.lockText}>{t('Locked').toUpperCase()}</Text></View>
                  </View>
                  <View style={styles.locked}>
                    <Lock size={14} color={bf.muted2} strokeWidth={2.5} />
                    <Text style={styles.lockedValue}>{p.phone_e164 ?? '—'}</Text>
                  </View>
                  <Text style={styles.hint}>{t('Phone changes go through customer support — contact us to swap your sign-in number.')}</Text>
                </View>
              </InfoCard>

              {form.addresses.length === 0 && (
                <View style={styles.emptyAddr}>
                  <View style={[styles.tile, { width: 40, height: 40, borderRadius: 16 }]}><MapPin size={16} color={accent} strokeWidth={2.5} /></View>
                  <Text style={styles.emptyTitle}>{t('No saved addresses yet')}</Text>
                  <Text style={styles.emptySub}>{t('Add one so it pre-fills your bookings.')}</Text>
                  <Pressable onPress={() => setForm(f => ({ ...f, addresses: [...f.addresses, blank()] }))} style={styles.addFirst}>
                    <Plus size={14} color="#fff" strokeWidth={2.5} /><Text style={styles.addFirstText}>{t('Add an address')}</Text>
                  </Pressable>
                </View>
              )}
              {form.addresses.map((a, i) => (
                <AddressCard key={a.id} a={a} primary={i === 0}
                  verdict={enforced ? judgeCoverage(coverage, a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null) : null}
                  onChange={patch => patchAddr(i, patch)}
                  onDelete={() => { setOk(false); setForm(f => ({ ...f, addresses: f.addresses.filter((_, j) => j !== i) })); }} />
              ))}
              {form.addresses.length > 0 && !atLimit && (
                <Pressable onPress={() => setForm(f => ({ ...f, addresses: [...f.addresses, blank()] }))} style={styles.addMore}>
                  <Plus size={14} color={gray[600]} strokeWidth={2.5} />
                  <Text style={styles.addMoreText}>{t('Add another address')}</Text>
                  <Text style={styles.addMoreCount}>({form.addresses.length}/{MAX_ADDRESSES})</Text>
                </Pressable>
              )}
              {atLimit && <Text style={styles.limit}>{t("You've saved {n} addresses — the maximum. Remove or edit one to add another.", { n: MAX_ADDRESSES })}</Text>}
            </>
          )}
        </ScrollView>
        {p && (
          <View style={styles.saveBar}>
            {err ? <Text style={[styles.status, styles.statusErr]}>{err}</Text>
              : ok ? <Text style={[styles.status, styles.statusOk]}>✓ {t('Saved')}</Text>
                : <Text style={styles.status}>{dirty ? t('You have unsaved changes.') : t('Nothing to save.')}</Text>}
            <Pressable onPress={save} disabled={busy || !dirty} style={[styles.saveBtn, (busy || !dirty) && { opacity: 0.4 }]}>
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Save size={16} color="#fff" strokeWidth={2.5} />}
              <Text style={styles.saveText}>{busy ? t('Saving…') : t('Save changes')}</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 24, paddingBottom: 24, gap: 20 },
  field: { gap: 5 },
  label: { fontSize: 11.5, fontWeight: '600', color: bf.ink2 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 8, paddingHorizontal: 12 },
  input: { flex: 1, paddingVertical: 9, fontSize: 13, color: bf.ink },
  hint: { fontSize: 11, color: bf.muted, lineHeight: 15 },
  lockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lockBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockText: { fontSize: 10.5, fontWeight: '600', letterSpacing: 1.5, color: bf.muted },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: bf.raised, borderWidth: 1, borderColor: bf.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  lockedValue: { fontFamily: 'monospace', fontSize: 13, color: bf.ink3 },
  tile: { width: 28, height: 28, borderRadius: 8, backgroundColor: accentSoft, alignItems: 'center', justifyContent: 'center' },
  addrCard: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: gray[100], padding: 20, gap: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  addrHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addrTitle: { fontSize: 14, fontWeight: '700', color: gray[900] },
  primary: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#d1fae5', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  primaryText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8, color: '#047857' },
  remove: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  removeText: { fontSize: 11, fontWeight: '600', color: gray[400] },
  addrHint: { fontSize: 11, color: gray[500], lineHeight: 16 },
  locBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderWidth: 1, borderColor: bf.line, borderRadius: 10, backgroundColor: '#fff' },
  pinBox: { borderWidth: 1, borderColor: bf.line, borderRadius: 12, overflow: 'hidden', backgroundColor: bf.raised },
  pinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: bf.line },
  pinBtnText: { fontSize: 13, fontWeight: '600', color: accent },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  coords: { fontFamily: 'monospace', fontSize: 12, color: bf.ink3 },
  cov: { flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  emptyAddr: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: gray[100], padding: 24, alignItems: 'center', gap: 4 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: gray[900], marginTop: 4 },
  emptySub: { fontSize: 11, color: gray[500], marginBottom: 8 },
  addFirst: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  addFirstText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  addMore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.6)',
    borderWidth: 1, borderStyle: 'dashed', borderColor: gray[300], borderRadius: 16, paddingVertical: 12,
  },
  addMoreText: { fontSize: 12, fontWeight: '600', color: gray[600] },
  addMoreCount: { fontSize: 10, fontWeight: '600', color: gray[400] },
  limit: { fontSize: 11, color: gray[500], backgroundColor: gray[50], borderWidth: 1, borderColor: gray[100], borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, textAlign: 'center' },
  saveBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: bf.ground },
  status: { flex: 1, fontSize: 12, color: gray[500], backgroundColor: 'rgba(255,255,255,0.8)', borderWidth: 1, borderColor: gray[200], borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  statusErr: { color: '#dc2626', backgroundColor: '#fef2f2', borderColor: '#fee2e2' },
  statusOk: { color: '#047857', backgroundColor: '#ecfdf5', borderColor: '#d1fae5' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: accent, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10,
    shadowColor: accent, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  saveText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
