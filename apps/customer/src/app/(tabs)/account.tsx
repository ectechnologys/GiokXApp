// Account: profile (editable name / email), points balance + history,
// saved addresses, sign out.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, Notice, PrimaryButton } from '@/components/ui';
import { Hero, SectionLabel, WCard } from '@/components/web';
import { tenant } from '@/config/tenant';
import { updateProfile } from '@/lib/api';
import { getCoins } from '@/lib/booking';
import { fmtDate, fmtStamp } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { queryClient, useProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { accent, gray, useColors } from '@/lib/theme';

const titleCase = (v: string) => v.replace(/[a-zA-Z]+/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

export default function Account() {
  const c = useColors();
  const { session, signIn, signOut } = useSession();
  const q = useProfile();
  const p = q.data?.customer;
  const coins = useQuery({
    queryKey: ['coins', session?.customer.id],
    queryFn: () => getCoins(session!.token),
    enabled: !!session,
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const startEdit = () => {
    setName(p?.name ?? session?.customer.name ?? '');
    setEmail(p?.email ?? '');
    setMsg(null);
    setEditing(true);
  };

  const save = async () => {
    if (!session) return;
    if (!name.trim()) return setMsg({ tone: 'error', text: 'Enter your name' });
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setMsg({ tone: 'error', text: 'Enter a valid email' });
    setBusy(true);
    setMsg(null);
    try {
      const r = await updateProfile(session.token, { name: name.trim(), email: email.trim() || undefined });
      await signIn(session.token, { ...session.customer, name: r.customer.name });
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setEditing(false);
      setMsg({ tone: 'ok', text: 'Profile saved.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const refresh = () => {
    q.refetch();
    coins.refetch();
  };

  const cd = coins.data;
  const pointsName = cd?.points_name || 'Points';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: gray[50] }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={q.isRefetching || coins.isRefetching} onRefresh={refresh} colors={[accent]} />}>
        <Hero name={p?.name ?? session?.customer.name ?? ''} phone={p?.phone_e164 ?? session?.customer.phone_e164}
          member={p?.is_member ? { active: !!p.member_expires && p.member_expires.slice(0, 10) >= new Date().toISOString().slice(0, 10), start: p.member_start, expires: p.member_expires } : null} />
        {q.isError && <Notice tone="error">{`Couldn’t load your profile: ${(q.error as Error).message}`}</Notice>}
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}

        {!editing ? (
          <WCard>
            <View style={styles.row}>
              <SectionLabel>Profile</SectionLabel>
              <Pressable onPress={startEdit} hitSlop={10}>
                <Text style={{ color: accent, fontWeight: '700' }}>Edit</Text>
              </Pressable>
            </View>
            <Text style={[styles.name, { color: c.text }]}>{p?.name ?? session?.customer.name}</Text>
            <Text style={{ color: c.muted }}>{formatPhone(p?.phone_e164 ?? session?.customer.phone_e164 ?? '')}</Text>
            <Text style={{ color: c.muted }}>{p?.email || 'No email'}</Text>
          </WCard>
        ) : (
          <WCard style={{ gap: 12 }}>
            <Field label="Your name" required value={name} onChangeText={v => setName(titleCase(v))} autoComplete="name" />
            <Field label="Email" value={email} onChangeText={v => setEmail(v.toLowerCase().replace(/\s/g, ''))}
              keyboardType="email-address" autoCapitalize="none" hint="Used for booking reminders and receipts." />
            <Text style={{ color: c.muted, fontSize: 12 }}>To change your phone number, please contact {tenant.name}.</Text>
            <PrimaryButton label="Save" busy={busy} onPress={save} />
            <Pressable onPress={() => { setEditing(false); setMsg(null); }} style={{ alignItems: 'center', padding: 6 }}>
              <Text style={{ color: c.muted }}>Cancel</Text>
            </Pressable>
          </WCard>
        )}

        {cd?.enabled && (
          <>
            <WCard>
              <SectionLabel>{pointsName}</SectionLabel>
              <Text style={styles.balance}>{Number(cd.balance ?? 0).toLocaleString('en-MY', { maximumFractionDigits: 2 })}</Text>
              <Text style={{ color: c.muted }}>
                Available balance{cd.expires ? ` · expires ${fmtDate(cd.expires)}` : ''}
              </Text>
              {(cd.transactions ?? []).slice(0, 10).map(t => {
                const plus = t.type === 'earned' || (t.type === 'adjusted' && t.amount > 0);
                return (
                  <View key={t.id} style={[styles.txn, { borderTopColor: c.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text }} numberOfLines={2}>{t.description || t.reason || t.type}</Text>
                      <Text style={{ color: c.muted, fontSize: 12 }}>{fmtStamp(t.created_at)}</Text>
                    </View>
                    <Text style={{ color: plus ? '#1a7f37' : c.text, fontWeight: '700' }}>
                      {plus ? '+' : '−'}{Math.abs(Number(t.amount)).toLocaleString('en-MY', { maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                );
              })}
              {cd.transactions?.length === 0 && <Text style={{ color: c.muted, marginTop: 6 }}>No activity in the last 3 months.</Text>}
            </WCard>
          </>
        )}

        <SectionLabel style={{ marginTop: 6 }}>Saved addresses</SectionLabel>
        {(q.data?.addresses ?? []).map(a => (
          <WCard key={a.id} style={{ gap: 3 }}>
            <Text style={{ color: c.text, fontSize: 16 }}>{[a.unit_number, a.address].filter(Boolean).join(', ')}</Text>
            {(a.postcode || a.city) ? <Text style={{ color: c.muted }}>{[a.postcode, a.city].filter(Boolean).join(' ')}</Text> : null}
            {!a.lat && <Text style={{ color: c.muted, fontSize: 12 }}>No map pin</Text>}
          </WCard>
        ))}
        {q.data && !q.data.addresses?.length && <Text style={{ color: c.muted }}>No saved addresses yet.</Text>}

        <Pressable onPress={signOut} style={({ pressed }) => [styles.out, { borderColor: c.border, opacity: pressed ? 0.6 : 1 }]}>
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  h1: { fontSize: 28, fontWeight: '700' },
  card: { borderRadius: 14, padding: 16, gap: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 20, fontWeight: '700', flexShrink: 1 },
  balance: { fontSize: 34, fontWeight: '800', color: accent },
  txn: { flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 10 },
  section: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginTop: 10 },
  out: { borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16, backgroundColor: '#fff' },
});
