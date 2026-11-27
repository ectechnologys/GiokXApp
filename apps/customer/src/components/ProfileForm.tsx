// New-customer profile, shown after the phone is verified. Mirrors the web
// sign-up's profile stage: name (+ race when the company asks), email per the
// company's setting, unit + address required. Saving creates the account.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Field, Notice, PrimaryButton } from '@/components/ui';
import { tenant } from '@/config/tenant';
import {
  ApiError,
  customerSiteConfig,
  RACE_OPTIONS,
  updateProfile,
  type CustomerProfile,
  type EmailRequirement,
} from '@/lib/api';
import { currentAddress } from '@/lib/location';
import { formatPhone } from '@/lib/phone';
import { useColors } from '@/lib/theme';

/** "ahmad RAZIF" → "Ahmad Razif", "a-12-34" → "A-12-34" (web: same rule). */
const titleCase = (v: string) => v.replace(/[a-zA-Z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
const validEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

export function ProfileForm({ ticket, phone, onDone }: {
  /** Registration ticket from verify-otp (no customer yet). */
  ticket: string;
  phone: string;
  onDone: (token: string, customer: CustomerProfile) => void;
}) {
  const c = useColors();
  const [raceOn, setRaceOn] = useState(false);
  const [emailReq, setEmailReq] = useState<EmailRequirement>('optional');
  const [f, setF] = useState({ name: '', race: '', email: '', unit_number: '', address: '', postcode: '', city: '', lobby_note: '' });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [emailWarned, setEmailWarned] = useState(false);

  useEffect(() => {
    customerSiteConfig()
      .then(r => {
        setRaceOn(r.race_enabled === true);
        setEmailReq(r.email_requirement ?? 'optional');
      })
      .catch(() => {});
  }, []);

  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  const useMyLocation = async () => {
    setErr(null);
    setLocating(true);
    try {
      const l = await currentAddress();
      setCoords({ lat: l.lat, lng: l.lng });
      setF(p => ({ ...p, address: l.address || p.address, postcode: l.postcode || p.postcode, city: l.city || p.city }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    setErr(null);
    if (!f.name.trim()) return setErr('Enter your name');
    if (raceOn && !f.race) return setErr('Select your race');
    if (!f.unit_number.trim()) return setErr('Enter your unit / house number');
    if (!f.address.trim()) return setErr('Enter your address');
    if (!validEmail(f.email)) {
      if (emailReq === 'required') return setErr(f.email.trim() ? 'Enter a valid email' : 'Enter your email');
      if (f.email.trim()) return setErr('Enter a valid email, or leave it empty');
      if (emailReq === 'warn' && !emailWarned) return setEmailWarned(true);
    }
    setBusy(true);
    try {
      const r = await updateProfile(ticket, {
        name: f.name.trim(),
        race: raceOn ? f.race : undefined,
        email: f.email.trim() || undefined,
        unit_number: f.unit_number.trim(),
        address: f.address.trim(),
        postcode: f.postcode.trim() || undefined,
        city: f.city.trim() || undefined,
        lobby_note: f.lobby_note.trim() || undefined,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
      });
      onDone(r.token ?? ticket, r.customer);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 401
        ? 'Your sign-up session has expired. Go back and verify your phone number again.'
        : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const noEmailWarning = emailWarned && !f.email.trim();

  return (
    <View style={{ gap: 16 }}>
      <Text style={[styles.verified]}>✓ PHONE VERIFIED · {formatPhone(phone)}</Text>
      <View style={{ gap: 4 }}>
        <Text style={[styles.title, { color: c.text }]}>Complete your profile</Text>
        <Text style={{ color: c.muted, fontSize: 15 }}>A few details for your bookings with {tenant.name}.</Text>
      </View>

      <Field label="Your name" required value={f.name} onChangeText={v => set('name', titleCase(v))}
        placeholder="e.g. Ahmad Razif" autoComplete="name" textContentType="name" />

      {raceOn && (
        <View style={{ gap: 6 }}>
          <Text style={[styles.label, { color: c.muted }]}>Race<Text style={{ color: c.danger }}> *</Text></Text>
          <View style={styles.chips}>
            {RACE_OPTIONS.map(r => {
              const on = f.race === r;
              return (
                <Pressable key={r} onPress={() => set('race', r)}
                  style={[styles.chip, { borderColor: on ? tenant.primaryColor : c.border, backgroundColor: on ? tenant.primaryColor : c.field }]}>
                  <Text style={{ color: on ? '#fff' : c.text, fontWeight: '600' }}>{r}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <Field label="Email" required={emailReq === 'required'} value={f.email}
        onChangeText={v => { set('email', v.toLowerCase().replace(/\s/g, '')); setEmailWarned(false); }}
        placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email"
        hint={noEmailWarning ? undefined : 'Used for booking reminders and receipts.'} />
      {noEmailWarning && (
        <Notice tone="warn">No email given. You won’t get booking reminders or receipts by email. Press “Finish without email” to continue.</Notice>
      )}

      <Pressable onPress={useMyLocation} disabled={locating}
        style={({ pressed }) => [styles.locBtn, { borderColor: tenant.primaryColor, opacity: pressed ? 0.7 : 1 }]}>
        {locating ? <ActivityIndicator color={tenant.primaryColor} /> : (
          <Text style={{ color: tenant.primaryColor, fontWeight: '700', fontSize: 16 }}>📍 Use my current location</Text>
        )}
      </Pressable>
      {coords && <Notice tone="ok">Location pinned. Check the address below and add your unit number.</Notice>}

      <Field label="Unit / House No." required value={f.unit_number} onChangeText={v => set('unit_number', titleCase(v))}
        placeholder="A-12-34 or 56" />
      <Field label="Address" required value={f.address} onChangeText={v => set('address', v)}
        placeholder="Street, area" multiline style={{ minHeight: 56 }} />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="Postcode" value={f.postcode} onChangeText={v => set('postcode', v.replace(/\D/g, ''))}
            keyboardType="number-pad" maxLength={6} placeholder="50450" />
        </View>
        <View style={{ flex: 1.4 }}>
          <Field label="City" value={f.city} onChangeText={v => set('city', v)} placeholder="Kuala Lumpur" />
        </View>
      </View>
      <Field label="Directions for our team (optional)" value={f.lobby_note} onChangeText={v => set('lobby_note', v)}
        placeholder="e.g. Block B lobby, call on arrival" multiline />

      {err && <Notice tone="error">{err}</Notice>}
      <PrimaryButton label={noEmailWarning ? 'Finish without email' : 'Finish'} busy={busy} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  verified: { color: '#1a7f37', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  title: { fontSize: 26, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  locBtn: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  row: { flexDirection: 'row', gap: 12 },
});
