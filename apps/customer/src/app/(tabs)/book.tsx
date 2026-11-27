// New booking: Service (+ add-ons) → Date & time (+ cleaner) → Address →
// Confirm (price, points) → payment / done. Same rules and the same edge
// functions as the web booking flow; the server re-checks everything.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field, Notice, PrimaryButton } from '@/components/ui';
import { tenant } from '@/config/tenant';
import { ApiError } from '@/lib/api';
import {
  createBooking, durationLabel, getAddons, getBookingConfig, getCoins, getHolidays, getPeakRules, getServices, getSlots,
  memberOn, paymentStatus, priceAddons, redeemCap, serviceSlotKeys, serviceTimes, slotKey, slotMinutes, startPayment,
  windowDays, type AddonRow, type BookingSuccess, type CreateBookingPayload, type ServiceRow,
} from '@/lib/booking';
import { fmtDate, fmtTime, money, todayIso } from '@/lib/format';
import { queryClient, useProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { useDisplaySettings } from '@/lib/settings';
import { accent, bf } from '@/lib/theme';
import { applyPeak, peakLabel, peakServiceMember, resolvePeak } from '@/shared/peakPricing';
import { computeSpecialDiscount, specialDiscountFor } from '@/shared/specialDiscount';
import { computeTax } from '@/shared/tax';

type Step = 'service' | 'time' | 'address' | 'confirm' | 'paying' | 'done';
const STEPS: Step[] = ['service', 'time', 'address', 'confirm'];
const STEP_TITLE: Record<Step, [string, string]> = {
  service: ['What do you need?', 'Pick a service, then any extras.'],
  time: ['When would you like it?', 'Pick a date, then a time slot.'],
  address: ['Where should we come?', 'Choose a saved address or add a new one.'],
  confirm: ['Review & confirm', 'Check the details, then confirm.'],
  paying: ['Payment', 'Finish paying in the browser.'],
  done: ['You’re booked', 'We’ve sent the details to you.'],
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hourOf = (t: string) => parseInt(t.slice(0, 2), 10);

export default function Book() {
  const { session } = useSession();
  const token = session?.token;
  const profile = useProfile();
  const cust = profile.data?.customer;
  const timeFormat = useDisplaySettings().data?.timeFormat ?? '12h';

  const cfgQ = useQuery({ queryKey: ['booking-config'], queryFn: getBookingConfig, staleTime: 60_000 });
  const svcQ = useQuery({ queryKey: ['services'], queryFn: getServices, staleTime: 5 * 60_000 });
  const peakQ = useQuery({ queryKey: ['peak-rules'], queryFn: getPeakRules, staleTime: 5 * 60_000 });
  const coinsQ = useQuery({ queryKey: ['coins', session?.customer.id], queryFn: () => getCoins(token!), enabled: !!token });
  const cfg = cfgQ.data;
  const rules = useMemo(() => peakQ.data ?? [], [peakQ.data]);

  const [step, setStep] = useState<Step>('service');
  const [service, setService] = useState<ServiceRow | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]); // pick order matters
  const [date, setDate] = useState<string | null>(null);
  const [pickedTime, setTime] = useState<string | null>(null);
  const [pickedMaid, setMaidId] = useState<string | null>(null);
  const [pickedAddr, setAddrIdx] = useState<number | 'new'>(0);
  const [addr, setAddr] = useState({ unit: '', address: '', postcode: '', city: '', lobby: '' });
  const [notes, setNotes] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hold, setHold] = useState<string | null>(null);
  const [done, setDone] = useState<BookingSuccess | null>(null);

  const addonsQ = useQuery({ queryKey: ['addons', service?.id], queryFn: () => getAddons(service!.id), enabled: !!service });
  const addons = addonsQ.data ?? [];
  const pickedAddons = addonIds.map(id => addons.find(a => a.id === id)).filter(Boolean) as AddonRow[];

  // ── Dates ───────────────────────────────────────────────────────────────
  const today = todayIso();
  const dates = useMemo(() => {
    if (!cfg) return [];
    const win = windowDays(cfg, cust, today);
    const start = cfg.bookingFrom && cfg.bookingFrom > today ? cfg.bookingFrom : today;
    const end = addDays(today, win > 0 ? win : 90);
    const out: string[] = [];
    for (let d = start; d <= end && out.length < 120; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cfg, cust, today]);
  const holQ = useQuery({
    queryKey: ['holidays', dates[0], dates[dates.length - 1]],
    queryFn: () => getHolidays(dates[0], dates[dates.length - 1]),
    enabled: !!cfg && !cfg.allowHolidayBooking && dates.length > 0,
  });
  const holidays = useMemo(() => new Map((holQ.data ?? []).map(h => [h.holiday_date, h.name])), [holQ.data]);

  // ── Availability for the picked date ──────────────────────────────────────
  const slotsQ = useQuery({
    queryKey: ['slots', date, session?.customer.id],
    queryFn: () => getSlots(date!, token),
    enabled: !!date && step === 'time',
    refetchInterval: 10_000,
  });
  const keys = useMemo(() => (service ? serviceSlotKeys(service) : new Set<string>()), [service]);
  const byHour = useMemo(() => {
    const m: Record<number, { status: string; reason: string; maids: { id: string; label: string }[] }> = {};
    for (const s of slotsQ.data?.slots ?? []) {
      if (!keys.has(slotKey(s))) continue;
      m[s.start_hour] = {
        status: s.status,
        reason: s.reason ?? '',
        maids: (s.eligible_maids ?? []).map(x => ({ id: x.id, label: service?.pax === 2 ? `${x.name || 'Team member'} + 1` : x.name || 'Team member' })),
      };
    }
    return m;
  }, [slotsQ.data, keys, service]);

  // A picked time / cleaner that has since filled must not stay selected.
  const pickedStatus = pickedTime ? byHour[hourOf(pickedTime)]?.status : undefined;
  const time = pickedTime && !(slotsQ.data && (pickedStatus === 'full' || pickedStatus === 'hidden')) ? pickedTime : null;
  const maids = useMemo(() => (time ? byHour[hourOf(time)]?.maids ?? [] : []), [time, byHour]);
  const maidId = pickedMaid && maids.some(m => m.id === pickedMaid) ? pickedMaid : null;

  // ── Price (display only; payments-start charges the same way) ────────────
  const price = useMemo(() => {
    if (!service || !cfg) return null;
    const dk = date ?? '';
    const mem = memberOn(cust, dk || today);
    const em = peakServiceMember(dk, service.id, mem, rules);
    const slots = service.service_time_slots ?? [];
    const baseOf = (s: (typeof slots)[number]) => Number(em && Number(s.member_price) > 0 ? s.member_price : s.price ?? 0);
    const row = time ? slots.find(s => (s.available_time ?? '').slice(0, 5) === time.slice(0, 5)) ?? slots[0] : undefined;
    const fromList = slots.map(s => applyPeak(baseOf(s), dk, service.id, mem, rules)).filter(p => p > 0);
    const base = row ? baseOf(row) : 0;
    const peak = row ? resolvePeak(base, dk, service.id, mem, rules) : { add: 0, rule: null };
    const slotPrice = row ? applyPeak(base, dk, service.id, mem, rules) : null;
    const eff = priceAddons(pickedAddons, mem, cfg.memberSpecialAddonMode);
    const addonTotal = pickedAddons.reduce((s, a) => s + (eff.get(a.id) ?? 0), 0);
    const sd = computeSpecialDiscount(specialDiscountFor(cfg.specialDiscount, cust), !!cust?.has_special_discount, {
      servicePrice: slotPrice ?? 0, addonsTotal: addonTotal,
    });
    const preTax = Math.max(0, (slotPrice ?? 0) + addonTotal - sd);
    const tax = computeTax(preTax, cfg.taxRate, cfg.taxMode, cfg.taxRoundUp);
    const perHour: Record<number, number> = {};
    for (const s of slots) perHour[hourOf(s.available_time ?? '')] = applyPeak(baseOf(s), dk, service.id, mem, rules);
    return { mem, from: fromList.length ? Math.min(...fromList) : null, base, peak, slotPrice, eff, addonTotal, sd, tax, perHour };
  }, [service, cfg, date, time, cust, rules, pickedAddons, today]);

  const pointsOn = !!cfg?.paymentEnabled && !!cfg?.pointsRedemptionEnabled && !!coinsQ.data?.enabled;
  const balance = Math.max(0, Number(coinsQ.data?.balance ?? 0));
  const total = price?.tax.total ?? 0;
  const pointsApplied = pointsOn && usePoints && balance > 0 ? redeemCap(balance, total, !!cfg?.pointsRedeemWhole) : 0;
  const pointsCover = pointsApplied > 0 && total > 0 && pointsApplied >= total;
  const pointsName = coinsQ.data?.points_name || cfg?.pointsName || 'points';

  // ── Address ──────────────────────────────────────────────────────────────
  const saved = profile.data?.addresses ?? [];
  const addrIdx: number | 'new' = saved.length ? pickedAddr : 'new';
  const chosen = addrIdx === 'new' ? null : saved[addrIdx];
  const addressOk = chosen ? !!(chosen.unit_number || chosen.address) : !!addr.unit.trim() && !!addr.address.trim();

  // ── Navigation ───────────────────────────────────────────────────────────
  const reset = () => {
    setStep('service'); setService(null); setAddonIds([]); setDate(null); setTime(null); setMaidId(null);
    setNotes(''); setUsePoints(false); setErr(null); setHold(null); setDone(null);
  };
  const back = () => {
    setErr(null);
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  };
  const next = () => {
    setErr(null);
    const i = STEPS.indexOf(step);
    setStep(STEPS[i + 1]);
  };

  // ── Submit ───────────────────────────────────────────────────────────────
  const payload = (): CreateBookingPayload => ({
    service_id: service!.id,
    appointment_date: date!,
    appointment_time: time!,
    duration_minutes: slotMinutes(service!, time),
    selected_addon_ids: addonIds,
    notes: notes.trim() || undefined,
    house_unit: chosen ? chosen.unit_number : addr.unit.trim(),
    address: chosen ? chosen.address : addr.address.trim(),
    city: chosen ? chosen.city : addr.city.trim() || undefined,
    postcode: chosen ? chosen.postcode : addr.postcode.trim() || undefined,
    address_lat: chosen?.lat ?? null,
    address_lng: chosen?.lng ?? null,
    lobby_note: (chosen ? chosen.lobby_note : addr.lobby.trim()) || undefined,
    requested_maid_id: maidId,
  });

  const finish = (r: BookingSuccess) => {
    setDone(r);
    setStep('done');
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['coins'] });
  };

  const onError = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : '';
    if (code === 'slot_unavailable') { setTime(null); setStep('time'); slotsQ.refetch(); }
    if (code === 'maid_unavailable') { setMaidId(null); setStep('time'); slotsQ.refetch(); }
    setErr((e as Error).message);
  };

  const submit = async () => {
    if (!token) return;
    setBusy(true); setErr(null);
    try {
      if (!cfg?.paymentEnabled) {
        finish(await createBooking(token, payload()));
        return;
      }
      const r = await startPayment(token, { ...payload(), redeem_points: pointsApplied > 0, redeem_points_amount: pointsApplied || undefined });
      if (r.paid_in_full) { finish(r); return; }
      if (!r.checkout_url || !r.hold_token) throw new Error('Payment could not be started. Please try again.');
      setHold(r.hold_token);
      setStep('paying');
      await WebBrowser.openBrowserAsync(r.checkout_url);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  // While paying: poll until HitPay confirms, or the hold is released.
  useEffect(() => {
    if (step !== 'paying' || !hold || !token) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await paymentStatus(token, hold);
        if (stop) return;
        if (s.status === 'confirmed') finish(s);
        else if (s.status === 'released' || s.status === 'expired') { setErr('The payment was not completed, so the booking was not made.'); setStep('confirm'); setHold(null); }
      } catch { /* keep polling */ }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [step, hold, token]);

  const cancelPayment = async () => {
    if (!token || !hold) return;
    setBusy(true);
    try {
      const s = await paymentStatus(token, hold, true); // server re-checks with HitPay first
      if (s.status === 'confirmed') finish(s);
      else { setErr('Payment cancelled. Your booking was not made.'); setStep('confirm'); setHold(null); }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (cfgQ.isPending || svcQ.isPending) {
    return <Center><ActivityIndicator color={accent} /></Center>;
  }
  if (cfgQ.isError || svcQ.isError) {
    const which = cfgQ.isError ? 'booking settings' : 'services';
    return (
      <Center>
        <Notice tone="error">{`Couldn’t load ${which}: ${((cfgQ.error ?? svcQ.error) as Error).message}`}</Notice>
        <PrimaryButton label="Try again" color={bf.ink} onPress={() => { cfgQ.refetch(); svcQ.refetch(); }} />
      </Center>
    );
  }
  if (cfg?.bookingsPaused) {
    return <Center><Notice tone="warn">{`${tenant.name} isn’t taking new bookings right now. Please check back later.`}</Notice></Center>;
  }
  if (cust?.suspended) {
    return <Center><Notice tone="error">This account can’t make bookings. Please contact us.</Notice></Center>;
  }

  const stepIdx = STEPS.indexOf(step);
  const canNext =
    step === 'service' ? !!service :
    step === 'time' ? !!date && !!time :
    step === 'address' ? addressOk : false;
  const ready = !!service && !!date && !!time && addressOk;
  const payLabel = !cfg?.paymentEnabled || pointsCover ? 'Confirm booking' : `Pay ${money(Math.max(0, total - pointsApplied))}`;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      {/* Header: wordmark + BOOK ONLINE (web bf header) */}
      <View style={styles.topbar}>
        <Image source={require('@/assets/tenant/wordmark.png')} style={styles.wordmark} contentFit="contain" />
        <Text style={styles.kicker}>BOOK ONLINE</Text>
      </View>
      {/* Stepper: numbered dots, ink when done / current */}
      {stepIdx >= 0 && (
        <View style={styles.stepper}>
          {STEPS.map((st, i) => {
            const on = i <= stepIdx;
            return (
              <View key={st} style={styles.stepItem}>
                <View style={[styles.dot, on ? styles.dotOn : null]}>
                  {i < stepIdx ? <Check size={12} color="#fff" strokeWidth={3} /> : <Text style={[styles.dotText, on ? { color: '#fff' } : null]}>{i + 1}</Text>}
                </View>
                {i < STEPS.length - 1 && <View style={[styles.stepLine, i < stepIdx ? { backgroundColor: bf.ink } : null]} />}
              </View>
            );
          })}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.panel}>
          <Text style={styles.h1}>{STEP_TITLE[step][0]}</Text>
          <Text style={styles.sub}>{STEP_TITLE[step][1]}</Text>

          {step === 'service' && (
            <>
              {(svcQ.data ?? []).map(s => {
                const on = service?.id === s.id;
                const mem = memberOn(cust, today);
                const from = (s.service_time_slots ?? [])
                  .map(x => Number(mem && Number(x.member_price) > 0 ? x.member_price : x.price ?? 0))
                  .filter(p => p > 0);
                return (
                  <Pressable key={s.id} onPress={() => { if (!on) { setService(s); setAddonIds([]); setTime(null); setMaidId(null); } }}
                    style={[styles.svc, on ? styles.svcOn : null]}>
                    <View style={[styles.radio, on ? styles.radioOn : null]}>{on && <View style={styles.radioDot} />}</View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.svcName}>{s.name}</Text>
                      {s.description ? <Text style={styles.svcDesc} numberOfLines={3}>{s.description}</Text> : null}
                      <Text style={styles.svcMeta}>{durationLabel(s)}{s.pax === 2 ? ' · 2 cleaners' : ''}</Text>
                    </View>
                    {from.length ? <Text style={styles.svcPrice}>{`From\n${money(Math.min(...from))}`}</Text> : null}
                  </Pressable>
                );
              })}
              {service && addons.length > 0 && (
                <>
                  <Text style={styles.section}>ADD EXTRAS</Text>
                  {addons.map(a => {
                    const on = addonIds.includes(a.id);
                    const memberPrice = a.is_member_special && price?.mem;
                    return (
                      <Pressable key={a.id} onPress={() => setAddonIds(ids => (on ? ids.filter(x => x !== a.id) : [...ids, a.id]))}
                        style={[styles.svc, on ? styles.svcOn : null]}>
                        <View style={[styles.box, on ? styles.boxOn : null]}>{on && <Check size={12} color="#fff" strokeWidth={3} />}</View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.svcName}>{a.name}</Text>
                          {a.description ? <Text style={styles.svcDesc} numberOfLines={2}>{a.description}</Text> : null}
                        </View>
                        <Text style={styles.addonPrice}>
                          {on && price ? money(price.eff.get(a.id) ?? a.price) : memberPrice ? `${money(a.member_price ?? 0)}\nmember` : money(a.price)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              )}
            </>
          )}

          {step === 'time' && service && (
            <>
              {dates.length === 0 && (
                <Notice tone="warn">{cfg?.bookingFrom ? `Online booking opens for dates from ${fmtDate(cfg.bookingFrom)}.` : 'No dates are open for booking right now.'}</Notice>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {dates.map(d => {
                  const hol = holidays.get(d);
                  const on = d === date;
                  const dt = new Date(`${d}T00:00:00`);
                  return (
                    <Pressable key={d} disabled={!!hol} onPress={() => { setDate(d); setTime(null); setMaidId(null); }}
                      style={[styles.day, on ? styles.dayOn : null, d === today && !on ? { borderColor: accent } : null, hol ? { opacity: 0.4 } : null]}>
                      <Text style={[styles.dayWk, on ? { color: 'rgba(255,255,255,0.7)' } : null]}>{dt.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</Text>
                      <Text style={[styles.dayNum, on ? { color: '#fff' } : null]}>{dt.getDate()}</Text>
                      <Text style={[styles.dayWk, on ? { color: 'rgba(255,255,255,0.7)' } : null]}>{dt.toLocaleDateString('en-GB', { month: 'short' })}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {date && (
                <>
                  <Text style={styles.section}>{fmtDate(date).toUpperCase()}</Text>
                  {slotsQ.isPending ? <ActivityIndicator color={bf.ink} /> : (
                    <View style={styles.times}>
                      {serviceTimes(service).map(t => {
                        const h = hourOf(t);
                        const st = byHour[h];
                        if (st?.status === 'hidden' && (st.reason.startsWith('Outside working hours') || st.reason.startsWith('Closed on this day'))) return null;
                        const now = new Date();
                        const past = date === today && h <= now.getHours();
                        const blocked = past || !st || st.status === 'full' || st.status === 'hidden';
                        const on = time === t && !blocked;
                        const p = price?.perHour[h];
                        return (
                          <Pressable key={t} disabled={blocked} onPress={() => setTime(t)}
                            style={[styles.time, on ? styles.timeOn : null, blocked ? styles.timeOff : null]}>
                            <Text style={[styles.timeText, on ? { color: '#fff' } : null, blocked ? styles.strike : null]}>{fmtTime(t, timeFormat)}</Text>
                            {p ? <Text style={[styles.timePrice, on ? { color: 'rgba(255,255,255,0.72)' } : null, blocked ? styles.strike : null]}>RM {p}</Text> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  {slotsQ.data && Object.values(byHour).every(s => s.status !== 'available') && (
                    <Text style={styles.sub}>No free times on this day. Try another date.</Text>
                  )}
                </>
              )}

              {time && maids.length > 0 && (
                <>
                  <Text style={styles.section}>YOUR TEAM</Text>
                  <View style={styles.pills}>
                    {[{ id: null as string | null, label: 'Any available' }, ...maids].map(m => {
                      const on = maidId === m.id;
                      return (
                        <Pressable key={m.id ?? 'any'} onPress={() => setMaidId(on && m.id ? null : m.id)} style={[styles.pill, on ? styles.pillOn : null]}>
                          <Text style={[styles.pillText, on ? { color: '#fff' } : null]}>{m.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.note}>
                    Free to choose — we’ll hold them for this visit. Where a job takes two people, the one you pick is the one we promise.
                  </Text>
                </>
              )}
            </>
          )}

          {step === 'address' && (
            <>
              {saved.map((a, i) => {
                const on = addrIdx === i;
                return (
                  <Pressable key={a.id} onPress={() => setAddrIdx(i)} style={[styles.svc, on ? styles.svcOn : null]}>
                    <View style={[styles.radio, on ? styles.radioOn : null]}>{on && <View style={styles.radioDot} />}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.svcName}>{[a.unit_number, a.address].filter(Boolean).join(', ')}</Text>
                      {(a.postcode || a.city) ? <Text style={styles.svcDesc}>{[a.postcode, a.city].filter(Boolean).join(' ')}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
              {saved.length > 0 && (
                <Pressable onPress={() => setAddrIdx('new')} style={[styles.svc, addrIdx === 'new' ? styles.svcOn : null]}>
                  <View style={[styles.radio, addrIdx === 'new' ? styles.radioOn : null]}>{addrIdx === 'new' && <View style={styles.radioDot} />}</View>
                  <Text style={styles.svcName}>Use a new address</Text>
                </Pressable>
              )}
              {addrIdx === 'new' && (
                <>
                  <Field label="Unit / House No." required value={addr.unit} onChangeText={v => setAddr(a => ({ ...a, unit: v }))} placeholder="A-12-34 or 56" />
                  <Field label="Address" required value={addr.address} onChangeText={v => setAddr(a => ({ ...a, address: v }))} placeholder="Street, area" multiline />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><Field label="Postcode" value={addr.postcode} keyboardType="number-pad" maxLength={6} onChangeText={v => setAddr(a => ({ ...a, postcode: v.replace(/\D/g, '') }))} /></View>
                    <View style={{ flex: 1.4 }}><Field label="City" value={addr.city} onChangeText={v => setAddr(a => ({ ...a, city: v }))} /></View>
                  </View>
                  <Field label="Directions for our team (optional)" value={addr.lobby} onChangeText={v => setAddr(a => ({ ...a, lobby: v }))} />
                </>
              )}
              <Field label="Notes for this booking (optional)" value={notes} onChangeText={setNotes} multiline placeholder="Anything we should know?" />
            </>
          )}

          {step === 'confirm' && service && price && date && time && (
            <>
              <View style={styles.receipt}>
                <Line label={service.name + (price.mem ? ' (member)' : '')} value={money(price.base)} />
                {price.peak.add > 0 && <Line label={peakLabel(price.peak, 'RM', price.mem) || 'Peak surcharge'} value={`+ ${money(price.peak.add)}`} />}
                {pickedAddons.map(a => <Line key={a.id} label={a.name} value={money(price.eff.get(a.id) ?? a.price)} />)}
                {price.sd > 0 && <Line label="Special discount" value={`− ${money(price.sd)}`} />}
                {price.tax.tax > 0 && <Line label={`${cfg?.taxName ?? 'Tax'} (${cfg?.taxRate}%${cfg?.taxMode === 'inclusive' ? ', included' : ''})`} value={money(price.tax.tax)} />}
                {price.tax.rounding > 0 && <Line label="Rounding" value={money(price.tax.rounding)} />}
                <View style={styles.rule} />
                <Line label="Total" value={money(total)} bold />
                {pointsApplied > 0 && <Line label={`Paid with ${pointsName}`} value={`− ${money(pointsApplied)}`} />}
                {pointsApplied > 0 && <Line label="To pay" value={money(Math.max(0, Math.round((total - pointsApplied) * 100) / 100))} bold />}
              </View>
              {pointsOn && balance > 0 && (
                <View style={[styles.svc, { alignItems: 'center' }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.svcName}>Use {pointsName}</Text>
                    <Text style={styles.svcDesc}>Balance {balance.toLocaleString()}</Text>
                  </View>
                  <Switch value={usePoints} onValueChange={setUsePoints} trackColor={{ true: accent }} />
                </View>
              )}
              {err && <Notice tone="error">{err}</Notice>}
              {cfg?.paymentEnabled && !pointsCover && (
                <Text style={styles.note}>You’ll pay securely with HitPay. Your booking is confirmed once payment goes through.</Text>
              )}
            </>
          )}

          {step === 'paying' && (
            <View style={{ gap: 14, alignItems: 'center', marginTop: 10 }}>
              <ActivityIndicator size="large" color={accent} />
              <Text style={[styles.svcName, { textAlign: 'center' }]}>Waiting for your payment to go through…</Text>
              <Text style={[styles.sub, { textAlign: 'center' }]}>This screen updates by itself.</Text>
              {err && <Notice tone="error">{err}</Notice>}
              <Pressable onPress={cancelPayment} disabled={busy} style={{ padding: 10 }}>
                <Text style={{ color: bf.danger, fontWeight: '600' }}>{busy ? 'Checking…' : 'I cancelled the payment'}</Text>
              </Pressable>
            </View>
          )}

          {step === 'done' && done && (
            <View style={{ gap: 12 }}>
              <View style={styles.doneBadge}><Check size={22} color={bf.good} strokeWidth={3} /></View>
              <View style={styles.receipt}>
                <Text style={styles.svcName}>{done.service_name ?? service?.name}</Text>
                <Text style={styles.svcDesc}>{fmtDate(done.appointment_date ?? date ?? '')} · {fmtTime(done.appointment_time ?? time, timeFormat)}</Text>
                {(done.addons ?? []).map(a => <Text key={a.id} style={styles.svcDesc}>+ {a.name}</Text>)}
              </View>
              <PrimaryButton label="See my bookings" color={accent} onPress={() => { reset(); router.navigate('/'); }} />
              <Pressable onPress={reset} style={{ alignItems: 'center', padding: 10 }}>
                <Text style={{ color: bf.ink, fontWeight: '600' }}>Book another</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* "Your booking" summary card (web bf-summary) */}
        {stepIdx >= 0 && (
          <View style={styles.summary}>
            <View style={styles.sumHead}>
              <Text style={styles.sumTitle}>Your booking</Text>
              <Text style={[styles.sumState, ready ? { color: bf.good } : null]}>{ready ? 'READY' : 'PENDING'}</Text>
            </View>
            <SumRow k="SERVICE" v={service?.name} />
            <SumRow k="DATE" v={date ? fmtDate(date) : undefined} />
            <SumRow k="TIME" v={time ? `${fmtTime(time, timeFormat)}${service ? ` · ${durationLabel(service, time)}` : ''}` : undefined} />
            {maidId && <SumRow k="CLEANER" v={maids.find(m => m.id === maidId)?.label} />}
            {stepIdx >= 2 && <SumRow k="WHERE" v={chosen ? [chosen.unit_number, chosen.address].filter(Boolean).join(', ') : [addr.unit, addr.address].filter(Boolean).join(', ') || undefined} />}
            {price?.slotPrice != null && <SumRow k="TOTAL" v={money(total)} strong />}
          </View>
        )}
      </ScrollView>

      {/* Bottom bar: Back · Continue (ink) / Pay (accent) — web bf-foot */}
      {stepIdx >= 0 && (
        <View style={styles.foot}>
          <Pressable onPress={back} disabled={stepIdx === 0} style={[styles.back, stepIdx === 0 ? { opacity: 0.3 } : null]} hitSlop={8}>
            <ArrowLeft size={16} color={bf.muted} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          {step === 'confirm' ? (
            <Pressable onPress={submit} disabled={busy} style={[styles.cont, styles.contAccent, busy ? { opacity: 0.5 } : null]}>
              {busy ? <ActivityIndicator color="#fff" /> : <><Text style={styles.contText}>{payLabel}</Text><ArrowRight size={16} color="#fff" /></>}
            </Pressable>
          ) : (
            <Pressable onPress={next} disabled={!canNext} style={[styles.cont, !canNext ? { opacity: 0.4 } : null]}>
              <Text style={styles.contText}>Continue</Text>
              <ArrowRight size={16} color="#fff" />
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: bf.ground }}>{children}</View>;
}

function SumRow({ k, v, strong }: { k: string; v?: string; strong?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumKey}>{k}</Text>
      <Text style={[styles.sumVal, !v ? styles.sumEmpty : null, strong ? { fontWeight: '700', fontStyle: 'normal' } : null]} numberOfLines={2}>{v ?? 'Not picked yet'}</Text>
    </View>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const st = { color: bf.ink, fontSize: 15, fontWeight: bold ? ('700' as const) : ('400' as const) };
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[st, { flexShrink: 1 }]}>{label}</Text>
      <Text style={st}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bf.ground },
  topbar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: bf.line, backgroundColor: bf.paper },
  wordmark: { width: 110, height: 34 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2.4, color: bf.muted, marginBottom: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: bf.line, backgroundColor: bf.paper, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: bf.ink, borderColor: bf.ink },
  dotText: { fontSize: 11, fontWeight: '700', color: bf.muted },
  stepLine: { flex: 1, height: 1, backgroundColor: bf.line, marginHorizontal: 6 },
  content: { paddingHorizontal: 12, paddingBottom: 110, gap: 12 },
  panel: { backgroundColor: bf.paper, borderWidth: 1, borderColor: bf.line, borderRadius: 14, padding: 18, gap: 10 },
  h1: { fontSize: 22, fontWeight: '700', color: bf.ink, letterSpacing: -0.4 },
  sub: { fontSize: 14, color: bf.muted, marginTop: -4, marginBottom: 4 },
  section: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: bf.muted, marginTop: 10 },
  svc: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, backgroundColor: bf.paper, borderWidth: 1, borderColor: bf.line, borderRadius: 10 },
  svcOn: { borderColor: bf.ink, backgroundColor: bf.raised, shadowColor: bf.ink, shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  svcName: { fontSize: 15, fontWeight: '600', color: bf.ink },
  svcDesc: { fontSize: 13, color: bf.muted, lineHeight: 18 },
  svcMeta: { fontSize: 12, color: bf.muted, fontFamily: 'monospace', marginTop: 2 },
  svcPrice: { fontSize: 13, fontWeight: '700', color: bf.ink, textAlign: 'right' },
  addonPrice: { fontSize: 13, fontWeight: '600', color: bf.ink, textAlign: 'right' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: bf.line, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: bf.ink },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: bf.ink },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: bf.line, marginTop: 2, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: bf.ink, borderColor: bf.ink },
  day: { width: 58, borderRadius: 10, paddingVertical: 9, alignItems: 'center', gap: 1, backgroundColor: bf.paper, borderWidth: 1, borderColor: bf.line },
  dayOn: { backgroundColor: bf.ink, borderColor: bf.ink },
  dayWk: { fontSize: 10, fontWeight: '600', color: bf.muted, letterSpacing: 0.5 },
  dayNum: { fontSize: 19, fontWeight: '700', color: bf.ink },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  time: { width: '48%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: bf.line, borderRadius: 6, backgroundColor: bf.paper },
  timeOn: { backgroundColor: bf.ink, borderColor: bf.ink },
  timeOff: { backgroundColor: bf.raised },
  timeText: { fontSize: 14, fontWeight: '500', color: bf.ink },
  timePrice: { fontSize: 12, color: bf.muted },
  strike: { color: bf.muted2, textDecorationLine: 'line-through' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1, borderColor: bf.line, borderRadius: 999, backgroundColor: bf.paper },
  pillOn: { backgroundColor: bf.ink, borderColor: bf.ink },
  pillText: { fontSize: 13, fontWeight: '500', color: bf.ink },
  note: { fontSize: 12, color: bf.muted, lineHeight: 17 },
  receipt: { backgroundColor: bf.raised, borderWidth: 1, borderColor: bf.line, borderRadius: 10, padding: 14, gap: 7 },
  rule: { height: 1, backgroundColor: bf.line, marginVertical: 2 },
  doneBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: bf.goodSoft, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  summary: { backgroundColor: bf.raised, borderWidth: 1, borderColor: bf.line, borderRadius: 14, padding: 16, gap: 10 },
  sumHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sumTitle: { fontSize: 15, fontWeight: '700', color: bf.ink },
  sumState: { fontSize: 11, fontWeight: '700', letterSpacing: 2, color: bf.muted },
  sumRow: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: bf.line, paddingTop: 9 },
  sumKey: { width: 76, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: bf.muted, fontFamily: 'monospace', paddingTop: 1 },
  sumVal: { flex: 1, fontSize: 14, color: bf.ink },
  sumEmpty: { color: bf.muted2, fontStyle: 'italic' },
  foot: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: bf.ground, borderTopWidth: 1, borderTopColor: bf.line },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 14, fontWeight: '600', color: bf.muted },
  cont: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: bf.ink, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 },
  contAccent: { backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  contText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
