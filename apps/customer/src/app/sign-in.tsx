// Customer sign-in AND sign-up: phone number → 6-digit code (WhatsApp, SMS
// fallback) → signed in, or, for a number with no account yet, the profile
// form that creates one. Same customer-auth calls as the web /customer-login.
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';
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
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {step !== 'profile' && (
            <>
              <BrandLogo size={96} />
              <Text style={[styles.brand, { color: c.text }]}>{tenant.name}</Text>
            </>
          )}

          {step === 'phone' && (
            <>
              <Text style={[styles.title, { color: c.text }]}>Sign in or sign up</Text>
              <Text style={[styles.sub, { color: c.muted }]}>
                Enter your phone number. We’ll send you a 6-digit code on WhatsApp. New here? We’ll set up your account
                after the code.
              </Text>
              <TextInput
                value={phoneText}
                onChangeText={setPhoneText}
                placeholder="012-345 6789"
                placeholderTextColor={c.muted}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                returnKeyType="send"
                onSubmitEditing={() => sendCode()}
                editable={!busy}
                style={[styles.input, { color: c.text, backgroundColor: c.field, borderColor: c.border }]}
              />
              {err && <Text style={[styles.err, { color: c.danger }]}>{err}</Text>}
              <PrimaryButton label="Send code" busy={busy} onPress={() => sendCode()} />
            </>
          )}

          {step === 'code' && phone && (
            <>
              <Text style={[styles.title, { color: c.text }]}>Enter code</Text>
              <Text style={[styles.sub, { color: c.muted }]}>
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
                style={[styles.input, styles.code, { color: c.text, backgroundColor: c.field, borderColor: c.border }]}
              />
              {devCode && <Text style={{ color: c.muted, textAlign: 'center' }}>Test code: {devCode}</Text>}
              {err && <Text style={[styles.err, { color: c.danger }]}>{err}</Text>}
              <PrimaryButton label="Verify" busy={busy} disabled={code.length !== CODE_LENGTH} onPress={() => checkCode(code)} />

              {channel === 'whatsapp' && (
                <Pressable disabled={wait > 0 || busy} onPress={() => sendCode(true)} style={styles.link}>
                  <Text style={{ color: wait > 0 ? c.muted : tenant.primaryColor, fontWeight: '600' }}>
                    {wait > 0 ? `No WhatsApp? Send by SMS in ${wait}s` : 'Send by SMS instead'}
                  </Text>
                </Pressable>
              )}
              <Pressable onPress={back} style={styles.link}>
                <Text style={{ color: c.muted }}>Use a different number</Text>
              </Pressable>
            </>
          )}

          {step === 'profile' && phone && ticket && (
            <ProfileForm ticket={ticket} phone={phone} onDone={(token, customer) => signIn(token, customer)} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
  brand: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 21 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18 },
  code: { fontSize: 28, letterSpacing: 12, textAlign: 'center' },
  err: { fontSize: 14 },
  link: { alignItems: 'center', paddingVertical: 8 },
});
