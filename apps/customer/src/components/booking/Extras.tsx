// Booking-detail extras: pay the balance, add add-ons, photos, van ETA, review.
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Notice, PrimaryButton } from '@/components/ui';
import { tenant } from '@/config/tenant';
import type { CustomerBooking } from '@/lib/api';
import {
  addonOptionPrices, deleteBookingPhoto, getAddonOptions, isImageUrl, myReviews, payWithHitPay, pickPhoto, startAddonPayment,
  startBookingPayment, submitReview, uploadBookingPhoto, vanEta,
} from '@/lib/extras';
import { money, todayIso } from '@/lib/format';
import { queryClient } from '@/lib/queries';
import { useColors } from '@/lib/theme';

const refreshBooking = () => Promise.all([
  queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  queryClient.invalidateQueries({ queryKey: ['coins'] }),
]);

export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.field }]}>
      <Text style={[styles.cardTitle, { color: c.muted }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/** Runs a HitPay checkout and reports the outcome; one in flight at a time. */
function usePayment(token: string) {
  const [waiting, setWaiting] = useState(false);
  const cancelled = useRef(false);
  const run = async (start: () => Promise<{ checkout_url?: string; hold_token?: string; free?: boolean }>) => {
    cancelled.current = false;
    const r = await start();
    if (r.free || !r.checkout_url || !r.hold_token) { await refreshBooking(); return 'done' as const; }
    setWaiting(true);
    try {
      const s = await payWithHitPay(token, r.checkout_url, r.hold_token, () => cancelled.current);
      await refreshBooking();
      return s.status === 'confirmed' ? ('done' as const) : ('not-paid' as const);
    } finally {
      setWaiting(false);
    }
  };
  return { waiting, run, cancel: () => { cancelled.current = true; } };
}

function Waiting({ onCancel }: { onCancel: () => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 8, alignItems: 'center', paddingVertical: 6 }}>
      <ActivityIndicator color={tenant.primaryColor} />
      <Text style={{ color: c.text, textAlign: 'center' }}>Waiting for your payment to go through…</Text>
      <Pressable onPress={onCancel} hitSlop={8}><Text style={{ color: '#c62828', fontWeight: '600' }}>I cancelled the payment</Text></Pressable>
    </View>
  );
}

// ── Amount due ───────────────────────────────────────────────────────────────

export function PayBalance({ b, token }: { b: CustomerBooking; token: string }) {
  const c = useColors();
  const pay = usePayment(token);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  if (b.status === 'cancelled' || !(b.outstanding_amount > 0)) return msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null;

  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const out = await pay.run(() => startBookingPayment(token, b.id));
      setMsg(out === 'done' ? { tone: 'ok', text: 'Payment received. Thank you!' } : { tone: 'warn', text: 'The payment was not completed.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Amount due">
      <Text style={{ color: '#c2410c', fontSize: 24, fontWeight: '800' }}>{money(b.outstanding_amount)}</Text>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {pay.waiting ? <Waiting onCancel={pay.cancel} /> : <PrimaryButton label="Pay now" busy={busy} onPress={go} />}
      <Text style={{ color: c.muted, fontSize: 12 }}>Paid securely with HitPay.</Text>
    </Card>
  );
}

// ── Add extras to this booking ───────────────────────────────────────────────

export function AddExtras({ b, token }: { b: CustomerBooking; token: string }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const pay = usePayment(token);
  const q = useQuery({
    queryKey: ['addon-options', b.id],
    queryFn: () => getAddonOptions(token, b.id),
    enabled: open && b.status !== 'cancelled',
  });
  if (b.status === 'cancelled' || b.team_completed_at) return null;

  const prices = q.data ? addonOptionPrices(q.data, picked) : new Map<string, number>();
  const total = Array.from(prices.values()).reduce((s, n) => s + n, 0);

  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const out = await pay.run(() => startAddonPayment(token, b.id, picked));
      if (out === 'done') { setPicked([]); setOpen(false); setMsg({ tone: 'ok', text: 'Extras added to your booking.' }); }
      else setMsg({ tone: 'warn', text: 'The payment was not completed, so nothing was added.' });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        <Pressable onPress={() => setOpen(true)} style={[styles.outline, { borderColor: tenant.primaryColor }]}>
          <Text style={{ color: tenant.primaryColor, fontWeight: '700', fontSize: 16 }}>+ Add extras</Text>
        </Pressable>
      </>
    );
  }

  return (
    <Card title="Add extras">
      {q.isPending && <ActivityIndicator color={tenant.primaryColor} />}
      {q.isError && <Notice tone="error">{(q.error as Error).message}</Notice>}
      {q.data && q.data.addons.length === 0 && <Text style={{ color: c.muted }}>No more extras can be added to this booking.</Text>}
      {q.data?.addons.map(a => {
        const on = picked.includes(a.id);
        const shown = on ? prices.get(a.id) ?? a.price : a.is_member_special && q.data.is_member ? a.member_price : a.price;
        return (
          <Pressable key={a.id} onPress={() => setPicked(p => (on ? p.filter(x => x !== a.id) : [...p, a.id]))} style={styles.addonRow}>
            <Text style={{ fontSize: 18, color: on ? tenant.primaryColor : c.muted }}>{on ? '☑' : '☐'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: '600' }}>{a.name}</Text>
              {a.description ? <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={2}>{a.description}</Text> : null}
            </View>
            <Text style={{ color: c.text, fontWeight: '600' }}>{money(shown)}</Text>
          </Pressable>
        );
      })}
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {pay.waiting ? <Waiting onCancel={pay.cancel} /> : (
        <>
          {picked.length > 0 && <Text style={{ color: c.text, fontWeight: '700' }}>Extras total: {money(total)}</Text>}
          {q.data && !['paid', 'cash'].includes(q.data.payment_status) && picked.length > 0 && (
            <Text style={{ color: c.muted, fontSize: 12 }}>This booking isn’t paid yet, so checkout covers the booking and the extras together.</Text>
          )}
          <PrimaryButton label={total > 0 ? `Add and pay` : 'Add extras'} busy={busy} disabled={!picked.length} onPress={go} />
          <Pressable onPress={() => { setOpen(false); setPicked([]); setMsg(null); }} style={{ alignItems: 'center', padding: 6 }}>
            <Text style={{ color: c.muted }}>Cancel</Text>
          </Pressable>
        </>
      )}
    </Card>
  );
}

// ── Photos ───────────────────────────────────────────────────────────────────

export function Photos({ b, token }: { b: CustomerBooking; token: string }) {
  const c = useColors();
  const photos = (b.attachment_urls ?? []).filter(u => u && isImageUrl(u));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<string | null>(null);
  if (b.status === 'cancelled' && photos.length === 0) return null;

  const add = (source: 'camera' | 'library') => async () => {
    setErr(null);
    try {
      const f = await pickPhoto(source);
      if (!f) return;
      setBusy(true);
      await uploadBookingPhoto(token, b.id, f);
      await refreshBooking();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (url: string) => {
    Alert.alert('Remove this photo?', 'It will be removed for you and the team.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          setView(null); setBusy(true); setErr(null);
          try { await deleteBookingPhoto(token, b.id, url); await refreshBooking(); }
          catch (e) { setErr((e as Error).message); }
          finally { setBusy(false); }
        },
      },
    ]);
  };

  return (
    <Card title="Photos">
      <Text style={{ color: c.muted, fontSize: 13 }}>Share photos of the areas to clean. The team sees them on their job card.</Text>
      <View style={styles.grid}>
        {photos.map(u => (
          <Pressable key={u} onPress={() => setView(u)}>
            <Image source={{ uri: u }} style={styles.thumb} contentFit="cover" />
          </Pressable>
        ))}
        {busy && <View style={[styles.thumb, styles.center]}><ActivityIndicator color={tenant.primaryColor} /></View>}
      </View>
      {err && <Notice tone="error">{err}</Notice>}
      {b.status !== 'cancelled' && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable disabled={busy} onPress={add('camera')} style={[styles.outline, styles.flex1, { borderColor: tenant.primaryColor }]}>
            <Text style={{ color: tenant.primaryColor, fontWeight: '700' }}>Take photo</Text>
          </Pressable>
          <Pressable disabled={busy} onPress={add('library')} style={[styles.outline, styles.flex1, { borderColor: tenant.primaryColor }]}>
            <Text style={{ color: tenant.primaryColor, fontWeight: '700' }}>From gallery</Text>
          </Pressable>
        </View>
      )}
      <Modal visible={!!view} transparent animationType="fade" onRequestClose={() => setView(null)}>
        <View style={styles.viewer}>
          {view && <Image source={{ uri: view }} style={{ flex: 1, width: '100%' }} contentFit="contain" />}
          <View style={{ flexDirection: 'row', gap: 12, padding: 20 }}>
            <Pressable onPress={() => setView(null)} style={[styles.viewerBtn, { backgroundColor: '#ffffff22' }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Close</Text></Pressable>
            {view && b.status !== 'cancelled' && (
              <Pressable onPress={() => remove(view)} style={[styles.viewerBtn, { backgroundColor: '#c62828' }]}><Text style={{ color: '#fff', fontWeight: '700' }}>Remove</Text></Pressable>
            )}
          </View>
        </View>
      </Modal>
    </Card>
  );
}

// ── Van on the way (today, driver assigned) ──────────────────────────────────

export function VanPills({ b, token }: { b: CustomerBooking; token: string }) {
  const show = b.status !== 'cancelled' && !b.team_completed_at && b.booking_date === todayIso()
    && (b.assignees ?? []).some(a => a.role.startsWith('Driver'));
  const q = useQuery({ queryKey: ['van-eta', b.id], queryFn: async () => ({ vans: await vanEta(token, b.id), now: Date.now() }), enabled: show, refetchInterval: 30_000 });
  if (!show || !q.data?.vans.length) return null;
  const now = q.data.now;
  const plates: Record<string, string> = {};
  for (const a of b.assignees ?? []) {
    if (!a.vehicle) continue;
    if (a.role.includes('Pickup')) plates.pickup = a.vehicle; else plates.send = a.vehicle;
  }
  return (
    <View style={{ gap: 6 }}>
      {q.data.vans.map((v, i) => {
        const plate = v.plate || plates[v.leg];
        const sec = v.at ? Math.max(1, Math.round((now - Date.parse(v.at)) / 1000)) : null;
        const dist = v.km == null ? '' : v.km < 1 ? `${Math.round(v.km * 1000)} m` : `${v.km.toFixed(1)} km`;
        const time = v.min == null ? '' : v.min < 60 ? `${v.min} min` : `${Math.floor(v.min / 60)} h ${v.min % 60} min`;
        const who = `${v.leg === 'pickup' ? 'Pick-up ' : ''}${plate ? `${plate} on the way` : v.leg === 'pickup' ? 'on the way' : 'Crew on the way'}`;
        return (
          <Notice key={i} tone="ok">
            {`🚐 ${who}${dist && time ? ` · ${dist} · ${time}` : ''}${sec != null ? ` · ${sec < 120 ? `${sec}s` : `${Math.round(sec / 60)}m`} ago` : ''}`}
          </Notice>
        );
      })}
    </View>
  );
}

// ── Rate your service ────────────────────────────────────────────────────────

export function Review({ b, token, googleUrl, googleThreshold }: { b: CustomerBooking; token: string; googleUrl: string; googleThreshold: number }) {
  const c = useColors();
  const q = useQuery({ queryKey: ['my-reviews'], queryFn: () => myReviews(token), enabled: !!b.team_completed_at });
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!b.team_completed_at || b.status === 'cancelled' || q.isPending) return null;
  const mine = q.data?.find(r => r.appointment_id === b.id);

  if (mine) {
    return (
      <Card title="Your review">
        <Text style={{ fontSize: 22, color: '#f5a623' }}>{'★'.repeat(mine.rating)}<Text style={{ color: c.border }}>{'★'.repeat(5 - mine.rating)}</Text></Text>
        {mine.review_text ? <Text style={{ color: c.text }}>{mine.review_text}</Text> : null}
        {mine.reply_text ? <Text style={{ color: c.muted }}>{`Reply from ${tenant.name}: ${mine.reply_text}`}</Text> : null}
        {googleUrl && mine.rating >= googleThreshold ? (
          <Pressable onPress={() => WebBrowser.openBrowserAsync(googleUrl)}>
            <Text style={{ color: tenant.primaryColor, fontWeight: '700' }}>Share it on Google too ›</Text>
          </Pressable>
        ) : null}
      </Card>
    );
  }

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      await submitReview(token, b.id, rating, text.trim());
      await queryClient.invalidateQueries({ queryKey: ['my-reviews'] });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Rate your service">
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
            <Text style={{ fontSize: 34, color: n <= rating ? '#f5a623' : c.border }}>★</Text>
          </Pressable>
        ))}
      </View>
      {rating > 0 && (
        <>
          <TextInput value={text} onChangeText={setText} placeholder="Tell us how it went (optional)" placeholderTextColor={c.muted} multiline
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]} />
          {err && <Notice tone="error">{err}</Notice>}
          <PrimaryButton label="Send review" busy={busy} onPress={send} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 16, gap: 8 },
  cardTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  outline: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  flex1: { flex: 1 },
  addonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 92, height: 92, borderRadius: 10, backgroundColor: '#0001' },
  center: { alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingTop: 40 },
  viewerBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: 16 },
});
