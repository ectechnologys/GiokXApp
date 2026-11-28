// New booking — the web BookingFlowPage wizard on a phone:
//   date-first:    1 Date → 2 Service & time → 3 Your details → 4 Confirm → 5 Done
//   service-first: 1 Service → 2 Date & time → 3 Your details → 4 Confirm → 5 Done
// (⇆ on the stepper swaps the order). Same rules and the same edge functions
// as the web; the server re-checks everything. Presentation lives in
// src/components/bookflow/.
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, ArrowRight, Check, CreditCard, MessageCircle } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { AddonsPalette, AddonSkipConfirm, type PricedAddon } from '@/components/bookflow/AddonSheets';
import { formatBookingId, line2, redeemCap, redeemClamp, StepHead, Stepper } from '@/components/bookflow/atoms';
import { DetailsStep, type AddrDraft } from '@/components/bookflow/DetailsStep';
import { ClosedStep, ServiceStep, SuspendedNote, TimesPanel, type ServiceCard, type TimeRow } from '@/components/bookflow/pickers';
import { ConfirmStep, PayingStep, PaymentFailedStep, SuccessStep } from '@/components/bookflow/ResultSteps';
import { SummaryCard } from '@/components/bookflow/SummaryCard';
import { MonthCalendar } from '@/components/MonthCalendar';
import { Notice, PrimaryButton } from '@/components/ui';
import { tenant } from '@/config/tenant';
import { ApiError } from '@/lib/api';
import {
  createBooking, getAddons, getBookingConfig, getCoins, getHolidays, getPeakRules, getServices, getSlots,
  memberOn, paymentStatus, priceAddons, serviceSlotKeys, serviceTimes, slotKey, slotMinutes, startPayment,
  windowDays, type AddonRow, type BookingSuccess, type CreateBookingPayload, type ServiceRow,
} from '@/lib/booking';
import { fmtDate, todayIso } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { queryClient, useProfile } from '@/lib/queries';
import { useSession } from '@/lib/session';
import { judgeCoverage, useDisplaySettings } from '@/lib/settings';
import { accent, bf } from '@/lib/theme';
import { applyPeak, peakServiceMember, resolvePeak } from '@/shared/peakPricing';
import { computeSpecialDiscount, specialDiscountFor } from '@/shared/specialDiscount';
import { computeTax } from '@/shared/tax';

type Step = 1 | 2 | 3 | 4 | 5;
type OrderMode = 'date-first' | 'service-first';
type Failed = { tone: 'red' | 'amber' | 'gray'; headline: string; subtext: string };

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hourOf = (t: string) => parseInt(t.slice(0, 2), 10);
const EMPTY_ADDR: AddrDraft = { unit: '', address: '', postcode: '', city: '', lobby: '' };

export default function Book() {
  const { session } = useSession();
  const token = session?.token;
  const profile = useProfile();
  const cust = profile.data?.customer;
  const display = useDisplaySettings().data;
  const timeFormat = display?.timeFormat ?? '12h';

  const cfgQ = useQuery({ queryKey: ['booking-config'], queryFn: getBookingConfig, staleTime: 60_000 });
  const svcQ = useQuery({ queryKey: ['services'], queryFn: getServices, staleTime: 5 * 60_000 });
  const peakQ = useQuery({ queryKey: ['peak-rules'], queryFn: getPeakRules, staleTime: 5 * 60_000 });
  const coinsQ = useQuery({ queryKey: ['coins', session?.customer.id], queryFn: () => getCoins(token!), enabled: !!token });
  const cfg = cfgQ.data;
  const rules = useMemo(() => peakQ.data ?? [], [peakQ.data]);

  const { t } = useT();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<OrderMode>('date-first');
  const [step, setStep] = useState<Step>(1);
  // Each step starts at the top, like the web.
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => { scroller.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  const [service, setService] = useState<ServiceRow | null>(null);
  const [addonIds, setAddonIds] = useState<string[]>([]); // pick order matters
  const [date, setDate] = useState<string | null>(null);
  const [pickedTime, setTime] = useState<string | null>(null);
  const [pickedMaid, setMaidId] = useState<string | null>(null);
  const [pickedAddr, setPickedAddr] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddrDraft>(EMPTY_ADDR);
  const [notes, setNotes] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [pointsAmount, setPointsAmount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hold, setHold] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [failed, setFailed] = useState<Failed | null>(null);
  const [done, setDone] = useState<(BookingSuccess & { booking_ref?: string }) | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);

  const addonsQ = useQuery({ queryKey: ['addons', service?.id], queryFn: () => getAddons(service!.id), enabled: !!service });
  const addons = useMemo(() => addonsQ.data ?? [], [addonsQ.data]);
  const pickedAddons = useMemo(
    () => addonIds.map(id => addons.find(a => a.id === id)).filter(Boolean) as AddonRow[],
    [addonIds, addons],
  );
  const toggleAddon = (id: string) => setAddonIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

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
    enabled: !!date && step === 2,
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

  // Date-first step 2: services with nothing free on the picked date are greyed.
  const disabledServiceIds = useMemo(() => {
    const s = new Set<string>();
    if (!slotsQ.data?.slots || !date) return s;
    const now = new Date();
    for (const svc of svcQ.data ?? []) {
      const k = serviceSlotKeys(svc);
      const any = slotsQ.data.slots.some(x => k.has(slotKey(x)) && x.status === 'available' && !(date === today && x.start_hour <= now.getHours()));
      if (!any) s.add(svc.id);
    }
    return s;
  }, [slotsQ.data, svcQ.data, date, today]);

  // ── Price (display only; payments-start charges the same way) ────────────
  const mem = memberOn(cust, date || today);
  const price = useMemo(() => {
    if (!service || !cfg) return null;
    const dk = date ?? '';
    const em = peakServiceMember(dk, service.id, mem, rules);
    const slots = service.service_time_slots ?? [];
    const baseOf = (s: (typeof slots)[number]) => Number(em && Number(s.member_price) > 0 ? s.member_price : s.price ?? 0);
    const row = time ? slots.find(s => (s.available_time ?? '').slice(0, 5) === time.slice(0, 5)) ?? slots[0] : undefined;
    const fromList = slots.map(s => applyPeak(baseOf(s), dk, service.id, mem, rules)).filter(p => p > 0);
    const from = fromList.length ? Math.min(...fromList) : null;
    const base = row ? baseOf(row) : 0;
    const peak = row ? resolvePeak(base, dk, service.id, mem, rules) : { add: 0, rule: null };
    const slotPrice = row ? applyPeak(base, dk, service.id, mem, rules) : null;
    const basePrice = slotPrice ?? from ?? 0;
    const eff = priceAddons(pickedAddons, mem, cfg.memberSpecialAddonMode);
    const addonTotal = pickedAddons.reduce((s, a) => s + (eff.get(a.id) ?? 0), 0);
    const sdCfg = specialDiscountFor(cfg.specialDiscount, cust);
    const sd = computeSpecialDiscount(sdCfg, !!cust?.has_special_discount, { servicePrice: basePrice, addonsTotal: addonTotal });
    const preTax = Math.max(0, Math.round((basePrice + addonTotal - sd) * 100) / 100);
    const tax = computeTax(preTax, cfg.taxRate, cfg.taxMode, cfg.taxRoundUp);
    const perHour: Record<number, number> = {};
    for (const s of slots) perHour[hourOf(s.available_time ?? '')] = applyPeak(baseOf(s), dk, service.id, mem, rules);
    return { from, base, peak, slotPrice, eff, addonTotal, sdCfg, sd, tax, perHour };
  }, [service, cfg, date, time, cust, rules, pickedAddons, mem]);

  // Add-ons as the sheets price them (web memberAddons: in 'single' mode only
  // the first-picked member special keeps the member price).
  const pricedAddons: PricedAddon[] = useMemo(() => {
    const claimed = mem && cfg?.memberSpecialAddonMode === 'single' ? pickedAddons.find(a => a.is_member_special)?.id ?? null : null;
    return addons.map(a => {
      let p = a.is_member_special && mem ? Number(a.member_price ?? 0) : Number(a.price ?? 0);
      if (claimed && a.is_member_special && a.id !== claimed) p = Number(a.price ?? 0);
      return { ...a, shownPrice: p };
    });
  }, [addons, pickedAddons, mem, cfg?.memberSpecialAddonMode]);

  // ── Points (web redeemCap / redeemClamp) ──────────────────────────────────
  const pointsOn = !!cfg?.paymentEnabled && !!cfg?.pointsRedemptionEnabled && !!coinsQ.data?.enabled;
  const balance = Math.max(0, Number(coinsQ.data?.balance ?? 0));
  const total = price?.tax.total ?? 0;
  const whole = !!cfg?.pointsRedeemWhole;
  const maxRedeem = redeemCap(balance, total, whole);
  const pointsApplied = pointsOn && usePoints && balance > 0 ? redeemClamp(pointsAmount ?? maxRedeem, maxRedeem, whole, total) : 0;
  const pointsCover = pointsApplied > 0 && total > 0 && pointsApplied >= total;
  const pointsName = coinsQ.data?.points_name || cfg?.pointsName || 'Points';

  // ── Address ──────────────────────────────────────────────────────────────
  const saved = useMemo(() => profile.data?.addresses ?? [], [profile.data?.addresses]);
  const addrId = saved.length
    ? pickedAddr === '__new' || (pickedAddr && saved.some(a => a.id === pickedAddr)) ? pickedAddr : saved[0].id
    : '__new';
  const chosen = saved.find(a => a.id === addrId) ?? null;
  const addr = chosen
    ? { unit: chosen.unit_number ?? '', address: chosen.address ?? '', postcode: chosen.postcode ?? '', city: chosen.city ?? '', lobby: chosen.lobby_note ?? '' }
    : draft;
  const coverageCfg = display?.coverage;
  const pinLat = chosen ? chosen.lat : draft.lat, pinLng = chosen ? chosen.lng : draft.lng;
  const coverage = coverageCfg?.enforce_booking === true && pinLat != null && pinLng != null
    ? judgeCoverage(coverageCfg, { lat: pinLat, lng: pinLng })
    : null;
  const coverageBlocked = coverage !== null && coverage.kind !== 'covered';
  const addressOk = !!addr.unit.trim() && !!addr.address.trim() && !coverageBlocked;

  // ── Navigation ───────────────────────────────────────────────────────────
  const reset = () => {
    setStep(1); setService(null); setAddonIds([]); setDate(null); setTime(null); setMaidId(null);
    setNotes(''); setUsePoints(false); setPointsAmount(null); setErr(null); setHold(null); setDone(null);
    setPaying(false); setFailed(null);
  };
  const back = () => {
    setErr(null);
    if (step === 1) { router.back(); return; }
    const nextStep = (step - 1) as Step;
    if (nextStep === 1 && order === 'service-first') { setDate(null); setTime(null); }
    setStep(nextStep);
  };
  const swapOrder = () => {
    setOrder(o => (o === 'date-first' ? 'service-first' : 'date-first'));
    setService(null); setAddonIds([]); setDate(null); setTime(null); setMaidId(null); setStep(1); setErr(null);
  };
  const advance = () => { setErr(null); setStep(s => Math.min(5, s + 1) as Step); };
  const onContinue = () => {
    const isServicePickStep = (order === 'service-first' && step === 1) || (order === 'date-first' && step === 2);
    if (isServicePickStep && addons.length > 0 && pickedAddons.length === 0) { setSkipOpen(true); return; }
    advance();
  };
  const end = dates.length ? dates[dates.length - 1] : today;
  const minDate = dates[0] ?? today;

  // ── Submit ───────────────────────────────────────────────────────────────
  const payload = (): CreateBookingPayload => ({
    service_id: service!.id,
    appointment_date: date!,
    appointment_time: time!,
    duration_minutes: slotMinutes(service!, time),
    selected_addon_ids: pickedAddons.map(a => a.id),
    notes: notes.trim() || undefined,
    house_unit: addr.unit.trim(),
    address: addr.address.trim(),
    city: addr.city.trim() || undefined,
    postcode: addr.postcode.trim() || undefined,
    address_lat: pinLat ?? null,
    address_lng: pinLng ?? null,
    lobby_note: addr.lobby.trim() || undefined,
    requested_maid_id: maidId,
  });

  const finish = (r: BookingSuccess) => {
    setDone(r);
    setPaying(false);
    setHold(null);
    setStep(5);
    queryClient.invalidateQueries({ queryKey: ['bookings'] });
    queryClient.invalidateQueries({ queryKey: ['coins'] });
  };

  const onError = (e: unknown) => {
    const code = e instanceof ApiError ? e.code : '';
    if (code === 'slot_unavailable') { setTime(null); setStep(2); slotsQ.refetch(); }
    if (code === 'maid_unavailable') { setMaidId(null); setStep(2); slotsQ.refetch(); }
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
      setPaying(true);
      await WebBrowser.openBrowserAsync(r.checkout_url);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  const paymentFailed = (f: Failed) => { setFailed(f); setPaying(false); setHold(null); };

  // While paying: poll until HitPay confirms, or the hold is released.
  useEffect(() => {
    if (!paying || !hold || !token) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await paymentStatus(token, hold);
        if (stop) return;
        if (s.status === 'confirmed') finish(s);
        else if (s.status === 'released') {
          paymentFailed({ tone: 'amber', headline: t("Payment didn't go through"), subtext: t('The payment window closed without completing. Try again — your booking details are still filled in.') });
        } else if (s.status === 'expired') {
          paymentFailed({ tone: 'amber', headline: t("Payment couldn't be verified"), subtext: t("We didn't hear back from the payment provider in time. Nothing was booked. Please try again — your booking details are still filled in.") });
        }
      } catch { /* keep polling */ }
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paying, hold, token]);

  const cancelPayment = async () => {
    if (!token || !hold) return;
    setBusy(true);
    try {
      const s = await paymentStatus(token, hold, true); // server re-checks with HitPay first
      if (s.status === 'confirmed') finish(s);
      else paymentFailed({ tone: 'gray', headline: t('Payment cancelled'), subtext: t("No worries — nothing was charged. Your booking details are still filled in if you'd like to try again.") });
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

  const paused = !!cfg?.bookingsPaused;
  const suspended = !!cust?.suspended;
  const canContinue = (() => {
    if (suspended) return false;
    if (paused && (step === 1 || step === 2)) return false;
    if (step === 1) return order === 'date-first' ? !!date : !!service;
    if (step === 2) return order === 'date-first' ? !!service && !!time : !!date && !!time;
    if (step === 3) return addressOk;
    return true;
  })();
  const needsPay = !!cfg?.paymentEnabled && !pointsCover;

  // Service cards — from-price follows the booking-date member gate + peak.
  const cards: ServiceCard[] = (svcQ.data ?? []).map(svc => {
    const dk = date ?? '';
    const em = peakServiceMember(dk, svc.id, mem, rules);
    const prices = (svc.service_time_slots ?? [])
      .map(s => Number(em && s.member_price != null && Number(s.member_price) > 0 ? s.member_price : s.price ?? 0))
      .filter(p => p > 0);
    return {
      svc,
      from: prices.length ? applyPeak(Math.min(...prices), dk, svc.id, mem, rules) : null,
      disabled: order === 'date-first' && step === 2 && disabledServiceIds.has(svc.id),
    };
  });
  const pickService = (s: ServiceRow) => {
    if (s.id === service?.id) return;
    setService(s); setAddonIds([]); setTime(null); setMaidId(null);
    if (order === 'service-first') setDate(null);
  };

  const timeRows: TimeRow[] = service ? serviceTimes(service).flatMap(tm => {
    const h = hourOf(tm);
    const st = byHour[h];
    if (st?.status === 'hidden' && (st.reason.startsWith('Outside working hours') || st.reason.startsWith('Closed on this day'))) return [];
    const past = date === today && h <= new Date().getHours();
    const blocked = !slotsQ.data || past || !st || st.status === 'full' || st.status === 'hidden';
    return [{ time: tm, price: price?.perHour[h] ?? null, blocked }];
  }) : [];
  const times = (
    <TimesPanel date={date} rows={service ? timeRows : []} timeFormat={timeFormat} time={time} onTime={setTime}
      maids={service ? maids : []} maidId={maidId} onMaid={setMaidId} emptyHint />
  );
  const calendar = (onPick: (d: string) => void, match: Parameters<typeof MonthCalendar>[0]['slotMatches']) => (
    <MonthCalendar value={date} today={today} minDate={minDate} maxDate={end} holidays={holidays}
      allowHoliday={!!cfg?.allowHolidayBooking} token={token} slotMatches={match} disabled={paused} onPick={onPick} />
  );
  const noDates = dates.length === 0 && (
    <Notice tone="warn">{cfg?.bookingFrom ? `Online booking opens for dates from ${fmtDate(cfg.bookingFrom)}.` : 'No dates are open for booking right now.'}</Notice>
  );

  const stepView = (() => {
    if (failed) {
      return <PaymentFailedStep tenantName={tenant.name} {...failed}
        onTryAgain={() => { setFailed(null); setErr(null); setStep(4); }}
        onBack={() => { reset(); router.navigate('/'); }} />;
    }
    if (paying) return <PayingStep busy={busy} onCancel={cancelPayment} />;
    if (step === 1 && paused) return <ClosedStep tenantName={tenant.name} />;
    if (step === 1 && order === 'date-first') {
      return (
        <View>
          <StepHead title={t('When would you like it?')} sub={t('Pick a date, then a time slot.')} />
          {calendar(d => {
            if (d !== date) { setTime(null); setMaidId(null); setService(null); setAddonIds([]); }
            setDate(d);
          }, () => true)}
          {noDates}
        </View>
      );
    }
    if (step === 1) {
      return <ServiceStep cards={cards} value={service?.id ?? null} onChange={pickService} isMember={mem}
        addonCount={addons.length} pickedCount={pickedAddons.length} onOpenAddons={() => setPaletteOpen(true)} />;
    }
    if (step === 2 && order === 'date-first') {
      return (
        <View style={{ gap: 20 }}>
          <ServiceStep cards={cards} value={service?.id ?? null} onChange={pickService} isMember={mem}
            addonCount={addons.length} pickedCount={pickedAddons.length} onOpenAddons={() => setPaletteOpen(true)} />
          {times}
        </View>
      );
    }
    if (step === 2) {
      return (
        <View>
          <StepHead title={t('When works for you?')} sub={t('Pick a date, then a time slot.')} />
          <View style={{ gap: 14 }}>
            {calendar(d => { if (d !== date) { setTime(null); setMaidId(null); } setDate(d); }, x => keys.has(slotKey(x)))}
            {noDates}
            {times}
          </View>
        </View>
      );
    }
    if (step === 3) {
      return <DetailsStep firstName={(cust?.name ?? '').split(' ')[0]} saved={saved} addrId={addrId}
        onPick={id => setPickedAddr(id)} onUseNew={() => { setPickedAddr('__new'); setDraft(EMPTY_ADDR); }}
        draft={draft} setDraft={setDraft} chosen={chosen} coverage={coverage} notes={notes} setNotes={setNotes} />;
    }
    if (step === 4 && service && date && time && price) {
      return <ConfirmStep tenantName={tenant.name} serviceName={service.name} slotPrice={price.slotPrice} isMember={mem}
        date={date} time={time} timeFormat={timeFormat} addons={pickedAddons} addonTotal={price.addonTotal}
        name={cust?.name ?? ''} phone={cust?.phone_e164 ?? ''}
        addressLine={[addr.unit.trim(), addr.address.trim()].filter(Boolean).join(', ')}
        addressSub={[addr.postcode.trim(), addr.city.trim()].filter(Boolean).join(' ')}
        lobby={addr.lobby.trim()} notes={notes.trim()} />;
    }
    if (step === 5 && done) {
      return <SuccessStep tenantName={tenant.name} bookingRef={formatBookingId(done.booking_id) || done.booking_ref || ''}
        serviceName={done.service_name ?? service?.name ?? '—'} date={done.appointment_date ?? date ?? ''}
        time={done.appointment_time ?? time ?? ''} timeFormat={timeFormat} addons={done.addons}
        onBookAgain={reset} onViewBookings={() => { reset(); router.navigate('/'); }} />;
    }
    return null;
  })();

  const showFoot = step !== 5 && !paying && !failed;

  return (
    <View style={styles.root}>
      <AppHeader kicker="Book online" points={coinsQ.data?.enabled ? balance : null} />
      <Stepper step={paying ? 4 : step} onSwap={swapOrder}
        swapLabel={order === 'date-first' ? t('Switch to Service first') : t('Switch to Date first')} />

      <ScrollView ref={scroller} contentContainerStyle={[styles.main, { paddingBottom: showFoot ? 110 : 32 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          {suspended && <SuspendedNote />}
          <View style={suspended ? { opacity: 0.45 } : null} pointerEvents={suspended ? 'none' : 'auto'}>
            {stepView}
          </View>
          {err && !failed && (
            <View style={styles.formErr}><Text style={styles.formErrText}>{err}</Text></View>
          )}
        </View>

        {!paying && !failed && (
          <SummaryCard
            service={service} isMember={mem} date={date} time={time} timeFormat={timeFormat}
            addons={pickedAddons.map(a => ({ id: a.id, name: a.name, price: price?.eff.get(a.id) ?? a.price }))}
            addonTotal={price?.addonTotal ?? 0} priceFrom={price?.from ?? null} slotPrice={price?.slotPrice ?? null}
            peakName={price?.peak.rule?.name ?? ''} sdAmount={price?.sd ?? 0} sdCfg={price?.sdCfg ?? null}
            taxRate={cfg?.taxRate ?? 0} taxMode={cfg?.taxMode ?? 'exclusive'} taxName={cfg?.taxName || 'Tax'}
            tax={price?.tax ?? { tax: 0, total: 0, rounding: 0 }} checkout={step === 4}
            points={{
              name: pointsName, enabled: pointsOn && balance > 0, balance, whole, use: usePoints, onToggle: setUsePoints,
              amount: pointsAmount, onAmount: setPointsAmount, applied: pointsApplied,
            }}
          />
        )}
      </ScrollView>

      <Pressable onPress={() => router.push('/support')} style={[styles.fab, { bottom: (showFoot ? 84 : 24) + insets.bottom }]} accessibilityLabel={t('Chat')}>
        <MessageCircle size={26} color="#fff" strokeWidth={2} />
      </Pressable>

      {/* Bottom bar (web .bf-nav): Back · Continue (ink) / Confirm (accent). */}
      {showFoot && (
        <View style={[styles.nav, { paddingBottom: Math.max(6, insets.bottom - 12) + 4 }]}>
          <Pressable onPress={back} style={styles.back} hitSlop={8}>
            <ArrowLeft size={16} color={bf.muted} strokeWidth={2.5} />
            <Text style={styles.backText}>{t('Back')}</Text>
          </Pressable>
          {step < 4 ? (
            <Pressable onPress={onContinue} disabled={!canContinue}
              style={({ pressed }) => [styles.cont, pressed && { backgroundColor: bf.ink2 }, !canContinue && { opacity: 0.4 }]}>
              <Text style={styles.contText}>{t('Continue')}</Text>
              <ArrowRight size={16} color="#fff" strokeWidth={2.5} />
            </Pressable>
          ) : (
            <Pressable onPress={submit} disabled={busy || !canContinue}
              style={({ pressed }) => [styles.cont, styles.contAccent, pressed && { opacity: 0.92 }, (busy || !canContinue) && { opacity: 0.4 }]}>
              <Text style={styles.contText}>
                {busy ? (needsPay ? t('Redirecting…') : t('Confirming…')) : (needsPay ? t('Proceed to payment') : t('Confirm booking'))}
              </Text>
              {needsPay ? <CreditCard size={16} color="#fff" strokeWidth={2.5} /> : <Check size={16} color="#fff" strokeWidth={2.5} />}
            </Pressable>
          )}
        </View>
      )}

      <AddonsPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} addons={pricedAddons} selected={pickedAddons.map(a => a.id)} onToggle={toggleAddon} />
      <AddonSkipConfirm open={skipOpen} onClose={() => setSkipOpen(false)}
        onConfirm={() => { setSkipOpen(false); advance(); }}
        addons={pricedAddons} selected={pickedAddons.map(a => a.id)} onToggle={toggleAddon} tenantName={tenant.name} />
    </View>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: bf.ground }}>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: bf.ground },
  main: { paddingTop: 16, paddingHorizontal: 12, gap: 16 },
  content: {
    backgroundColor: bf.paper, borderWidth: 1, borderColor: bf.line, borderRadius: 12, paddingVertical: 20, paddingHorizontal: 18, minHeight: 440,
    shadowColor: '#14140f', shadowOpacity: 0.03, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  formErr: { marginTop: 16, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fee2e2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  formErrText: { fontSize: 12, color: '#dc2626', lineHeight: 16 },
  fab: {
    position: 'absolute', right: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  nav: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingTop: 10, paddingHorizontal: 12, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: line2,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 8 },
  backText: { fontSize: 13, fontWeight: '500', color: bf.muted },
  cont: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: bf.ink, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  contAccent: { backgroundColor: accent, shadowColor: accent, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  contText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
