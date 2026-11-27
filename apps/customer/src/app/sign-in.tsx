// Customer sign-in AND sign-up: phone number → 6-digit code (WhatsApp, SMS
// fallback) → signed in, or, for a number with no account yet, the profile
// form that creates one. Same customer-auth calls as the web /customer-login.
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, ChevronDown, KeyRound } from 'lucide-react-native';

import { ProfileForm } from '@/components/ProfileForm';
import { PrimaryButton } from '@/components/ui';
import { tenant } from '@/config/tenant';
import { requestOtp, verifyOtp } from '@/lib/api';
import { formatPhone, toE164 } from '@/lib/phone';
import { useSession } from '@/lib/session';
import { useColors } from '@/lib/theme';

/** The SMS fallback stays shut this long after a WhatsApp code goes out, so
 *  a slow WhatsApp message doesn't get a second, paid SMS (web: same rule). */
const SMS_FALLBACK_WAIT_S = 60;
const CODE_LENGTH = 6;

type Step = 'phone' | 'code' | 'profile';

export default function SignIn() {
  const c = useColors();
  const { signIn } = useSession();

  const [step, setStep] = useState<Step>('phone');
  const [phoneText, setPhoneText] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<'whatsapp' | 'sms' | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  /** Registration ticket for a new customer (verify-otp `isNew`). */
  const [ticket, setTicket] = useState<string | null>(null);

  // Countdown until "Send by SMS instead" opens.
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async (forceSms = false) => {
    setErr(null);
    const e164 = phone && forceSms ? phone : toE164(phoneText);
    if (!e164) {
      setErr('Enter a valid phone number');
      return;
    }
    setBusy(true);
    try {
      const r = await requestOtp(e164, forceSms);
      setPhone(r.phone || e164);
      setChannel(r.channel ?? null);
      setDevCode(r.devCode ?? null);
      setCode('');
      setWait(r.channel === 'whatsapp' ? SMS_FALLBACK_WAIT_S : 0);
      setStep('code');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const checkCode = async (value: string) => {
    if (!phone || value.length !== CODE_LENGTH || busy) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await verifyOtp(phone, value);
      if (r.isNew) {
        // Code is right but no account exists on this number yet: the
        // profile form creates it with this ticket.
        setTicket(r.token);
        setStep('profile');
        return;
      }
      await signIn(r.token, r.customer);
    } catch (e) {
      setErr((e as Error).message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const onCodeChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) checkCode(digits);
  };

  const back = () => {
    setStep('phone');
    setErr(null);
    setCode('');
    setDevCode(null);
  };

  return (
    <LinearGradient colors={['#eff6ff', '#ffffff', '#faf5ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.root}>
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step !== 'profile' && (
            <>
              <Image source={require('@/assets/tenant/wordmark.png')} style={styles.wordmark} contentFit="contain" />
              <Text style={styles.brand}>{tenant.name}</Text>
            </>
          )}

          {step === 'phone' && (
            <View style={styles.card}>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.sub}>We’ll send you a one-time code on WhatsApp.</Text>
              <Text style={styles.label}>Phone number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.cc}>
                  <Text style={{ fontSize: 16 }}>🇲🇾</Text>
                  <Text style={styles.ccText}>+60</Text>
                  <ChevronDown size={14} color="#9ca3af" />
                </View>
              <TextInput
                value={phoneText}
                onChangeText={setPhoneText}
                placeholder="123456789"
                placeholderTextColor="#9ca3af"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={() => sendCode()}
                editable={!busy}
                style={styles.phoneInput}
              />
              </View>
              <Text style={styles.hint}>Paste any format — we’ll detect the country from your number.</Text>
              {err && <Text style={[styles.err, { color: c.danger }]}>{err}</Text>}
              <Pressable onPress={() => sendCode()} disabled={busy}
                style={({ pressed }) => [styles.webBtn, { backgroundColor: tenant.primaryColor, opacity: busy ? 0.6 : pressed ? 0.85 : 1 }]}>
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <KeyRound size={18} color="#fff" />
                    <Text style={styles.webBtnText}>Send code</Text>
                    <ArrowRight size={18} color="#fff" />
                  </>
                )}
              </Pressable>
              <Text style={styles.terms}>New here? We’ll set up your account after the code.</Text>
            </View>
          )}
          {step === 'phone' && <Text style={styles.footer}>By continuing you agree to {tenant.name}’s terms.</Text>}

          {step === 'code' && phone && (
            <View style={styles.card}>
              <Text style={styles.title}>Verify your phone</Text>
              <Text style={styles.sub}>
                {channel === 'sms' ? 'We sent an SMS' : 'We sent a WhatsApp message'} to {formatPhone(phone)}.
              </Text>
              <TextInput
                autoFocus
                value={code}
                onChangeText={onCodeChange}
                placeholder="••••••"
                placeholderTextColor={c.muted}
                keyboardType="number-pad"
                autoComplete="sms-otp"
                textContentType="oneTimeCode"
                maxLength={CODE_LENGTH}
                editable={!busy}
                style={[styles.input, styles.code]}
              />
              {devCode && <Text style={{ color: c.muted, textAlign: 'center' }}>Test code: {devCode}</Text>}
              {err && <Text style={[styles.err, { color: c.danger }]}>{err}</Text>}
              <PrimaryButton label="Verify & continue" color={tenant.primaryColor} busy={busy} disabled={code.length !== CODE_LENGTH} onPress={() => checkCode(code)} />

              {channel === 'whatsapp' && (
                <Pressable disabled={wait > 0 || busy} onPress={() => sendCode(true)} style={styles.link}>
                  <Text style={{ color: wait > 0 ? c.muted : tenant.primaryColor, fontWeight: '600' }}>
                    {wait > 0 ? `No WhatsApp? Send by SMS in ${wait}s` : 'Send by SMS instead'}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={back} style={styles.link}>
                <Text style={{ color: c.muted }}>← Change phone</Text>
              </Pressable>
            </View>
          )}

          {step === 'profile' && phone && ticket && (
            <View style={styles.card}><ProfileForm ticket={ticket} phone={phone} onDone={(token, customer) => signIn(token, customer)} /></View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  wordmark: { width: 170, height: 52, alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 24, padding: 26, gap: 6, borderWidth: 1, borderColor: '#f3f4f6',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#4b5563', marginTop: 12 },
  phoneRow: { flexDirection: 'row', borderWidth: 1.5, borderColor: '#3b82f6', borderRadius: 12, overflow: 'hidden', marginTop: 4 },
  cc: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, backgroundColor: '#eff6ff', borderRightWidth: 1, borderRightColor: '#bfdbfe' },
  ccText: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  phoneInput: { flex: 1, fontSize: 17, paddingHorizontal: 12, paddingVertical: 13, color: '#111827' },
  hint: { fontSize: 11, color: '#6b7280', marginTop: 4 },
  webBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 14 },
  webBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  terms: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 10 },
  footer: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 12 },
  brand: { fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 14, color: '#111827' },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 14, lineHeight: 20, color: '#6b7280' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', color: '#111827', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, marginTop: 8 },
  code: { fontSize: 24, letterSpacing: 10, textAlign: 'center', fontFamily: 'monospace' },
  err: { fontSize: 14 },
  link: { alignItems: 'center', paddingVertical: 8 },
});
