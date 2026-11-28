// New booking — the web BookingFlowPage wizard on a phone:
//   date-first:    1 Date → 2 Service & time → 3 Your details → 4 Confirm → 5 Done
//   service-first: 1 Service → 2 Date & time → 3 Your details → 4 Confirm → 5 Done
// (⇆ on the stepper swaps the order). When the company allows multi-date
// booking, tapping a second date turns the calendar into a multi-select (up
// to 10; tap a date again to remove it, back to one date = a normal booking),
// then each date's
// visit is completed one by one and all of them go through one checkout
// (payments-start multi_bookings). Same rules and the same edge functions
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
import { applyVisitAddons, MULTI_MAX, MultiAddonPrompt, type MultiPick } from '@/components/bookflow/multi';
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
  windowDays, type AddonRow, type BookingSuccess, type CreateBookingPayload, type MultiBookingItem, type ServiceRow,
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
const r2 = (n: number) => Math.round(n * 100) / 100;
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
  // Single booking: the picked date. Multi-date checkout: unused — `date`
  // below then points at the visit being configured (web workingDateKey).
  const [singleDate, setDate] = useState<string | null>(null);
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

  // ── Multi-date checkout (web multiOn / multiDates / multiPicks) ───────────
  const [multiOn, setMultiOn] = useState(false);
  const [multiDates, setMultiDates] = useState<string[]>([]); // sorted
  const [multiPicks, setMultiPicks] = useState<MultiPick[]>([]);
  const [multiPromptOpen, setMultiPromptOpen] = useState(false);
  // Visits a HitPay checkout covers, and the hold token still being polled
  // after 'confirmed' while the finalizer writes the remaining visits.
  const [expected, setExpected] = useState(1);
  const [catchUp, setCatchUp] = useState<string | null>(null);
  // The earliest ticked date without a finished visit — the one the pickers
  // configure. When every date is done, the pickers park on the last one.
  const workingDateKey = multiOn ? multiDates.find(k => !multiPicks.some(p => p.dateKey === k)) ?? null : null;
  const date = multiOn ? workingDateKey ?? multiDates[multiDates.length - 1] ?? null : singleDate;
  // Date-first series on a phone: the service list sits above the times, so
  // each next visit starts back at the top (the web shows them side by side).
  useEffect(() => {
    if (multiOn && step === 2 && order === 'date-first' && workingDateKey) scroller.current?.scrollTo({ y: 0, animated: true });
  }, [multiOn, step, order, workingDateKey]);

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

  // ── Multi-date helpers (web toggleMultiDate / recordPickTime / …) ────────
  const addonMode = cfg?.memberSpecialAddonMode ?? 'all';
  // Calendar tap: toggle the date in/out of the set (max 10). Removing a date
  // drops its finished visit too. A held time belongs to the old visit.
  const toggleMultiDate = (k: string) => {
    if (multiDates.includes(k)) {
      setMultiDates(multiDates.filter(x => x !== k));
      setMultiPicks(ps => ps.filter(p => p.dateKey !== k));
    } else {
      if (multiDates.length >= MULTI_MAX) return;
      setMultiDates([...multiDates, k].sort());
    }
    setTime(null); setMaidId(null);
  };
  // Calendar tap with multi-date booking on (no tick, as asked): the same
  // date again clears it, another date while one is picked starts a series
  // with both, and a series shrunk back to one date is a normal booking again
  // — that date keeps its finished visit's time, team and extras.
  const tapDate = (k: string, single: (d: string) => void) => {
    if (!multiOn) {
      if (k === singleDate) { setDate(null); setTime(null); setMaidId(null); return; }
      if (!singleDate || !cfg?.multiBookingEnabled) { single(k); return; }
      setMultiOn(true); setMultiPicks([]);
      setMultiDates([singleDate, k].sort());
      setTime(null); setMaidId(null);
      return;
    }
    const left = multiDates.includes(k) ? multiDates.filter(x => x !== k) : null;
    if (!left || left.length > 1) { toggleMultiDate(k); return; }
    const keep = left[0] ? multiPicks.find(p => p.dateKey === left[0]) : undefined;
    setMultiOn(false); setMultiDates([]); setMultiPicks([]);
    setDate(left[0] ?? null);
    setTime(keep?.time ?? null); setMaidId(keep?.requestedMaidId ?? null);
    if (keep) {
      setAddonIds(keep.addonIds);
      if (order === 'date-first') setService((svcQ.data ?? []).find(x => x.id === keep.serviceId) ?? null);
    }
  };
  // Finish the working date's visit at time `tm` and move on to the next date.
  const recordPick = (tm: string) => {
    if (!service || !workingDateKey) return;
    const wk = workingDateKey;
    const member = memberOn(cust, wk);
    const em = peakServiceMember(wk, service.id, member, rules);
    const match = (service.service_time_slots ?? []).find(s => (s.available_time ?? '').slice(0, 5) === tm.slice(0, 5));
    const slotBase = match ? Number(em && match.member_price != null && Number(match.member_price) > 0 ? match.member_price : match.price ?? 0) : 0;
    const base = match ? applyPeak(slotBase, wk, service.id, member, rules) : 0;
    const peakName = resolvePeak(slotBase, wk, service.id, member, rules).rule?.name ?? '';
    const eff = priceAddons(pickedAddons, member, addonMode);
    const extras = pickedAddons.map(a => ({ id: a.id, name: a.name, price: eff.get(a.id) ?? Number(a.price ?? 0) }));
    const hourMaids = byHour[hourOf(tm)]?.maids ?? [];
    const maid = pickedTime === tm && maidId ? hourMaids.find(m => m.id === maidId) ?? null : null;
    const pick: MultiPick = {
      dateKey: wk, serviceId: service.id, serviceName: service.name, time: tm,
      price: r2(base + extras.reduce((sum, a) => sum + a.price, 0)), basePrice: base, peakName,
      addons: extras, addonIds: pickedAddons.map(a => a.id), serviceAddons: addons, member,
      requestedMaidId: maid?.id ?? null, requestedMaidLabel: maid?.label,
    };
    setMultiPicks(ps => [...ps.filter(p => p.dateKey !== wk), pick]);
    // Every visit answers for itself: the next one starts on "Any available",
    // with no extras, and (date-first) its own service.
    setTime(null); setMaidId(null); setAddonIds([]);
    if (order === 'date-first') setService(null);
  };
  // Time tap in multi mode: commits the visit outright, unless the hour offers
  // a team choice — then hold it so "Save this visit" can follow the pick.
  const onTimeMulti = (tm: string) => {
    if ((byHour[hourOf(tm)]?.maids.length ?? 0) > 0) setTime(tm);
    else recordPick(tm);
  };
  const removeMultiPick = (k: string) => {
    setMultiPicks(ps => ps.filter(p => p.dateKey !== k));
    setTime(null); setMaidId(null);
  };
  // Visits with no extras whose service offers some (web multiPicksMissingAddons).
  const missingAddons = multiPicks.filter(p => p.addonIds.length === 0 && p.serviceAddons.length > 0);
  // Totals over every visit: Special Discount per visit (as the server bills
  // it), tax on the sum — the figure points redeem against.
  const multiTotals = (() => {
    if (!multiOn || !cfg) return null;
    const sum = r2(multiPicks.reduce((acc, p) => acc + p.price, 0));
    const sdCfg = specialDiscountFor(cfg.specialDiscount, cust);
    const sd = r2(multiPicks.reduce((acc, p) => acc + computeSpecialDiscount(sdCfg, !!cust?.has_special_discount,
      { servicePrice: p.basePrice, addonsTotal: Math.max(0, p.price - p.basePrice) }), 0));
    const tax = computeTax(Math.max(0, r2(sum - sd)), cfg.taxRate, cfg.taxMode, cfg.taxRoundUp);
    return { sd, sdCfg, tax };
  })();

  // ── Points (web redeemCap / redeemClamp) ──────────────────────────────────
  const pointsOn = !!cfg?.paymentEnabled && !!cfg?.pointsRedemptionEnabled && !!coinsQ.data?.enabled;
  const balance = Math.max(0, Number(coinsQ.data?.balance ?? 0));
  const total = multiOn ? multiTotals?.tax.total ?? 0 : price?.tax.total ?? 0;
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
    setMultiOn(false); setMultiDates([]); setMultiPicks([]); setExpected(1); setCatchUp(null);
  };
  const back = () => {
    setErr(null);
    if (step === 1) { router.back(); return; }
    const nextStep = (step - 1) as Step;
    if (nextStep === 1 && order === 'service-first') { setDate(null); setTime(null); setMultiDates([]); setMultiPicks([]); }
    setStep(nextStep);
  };
  const swapOrder = () => {
    setOrder(o => (o === 'date-first' ? 'service-first' : 'date-first'));
    setService(null); setAddonIds([]); setDate(null); setTime(null); setMaidId(null); setStep(1); setErr(null);
    setMultiOn(false); setMultiDates([]); setMultiPicks([]);
  };
  const advance = () => { setErr(null); setStep(s => Math.min(5, s + 1) as Step); };
  const onContinue = () => {
    const isServicePickStep = (order === 'service-first' && step === 1) || (order === 'date-first' && step === 2);
    // Multi-date: extras are per visit, so ask per visit instead (web MultiAddonPrompt).
    if (multiOn && step === 2 && missingAddons.length > 0) { setMultiPromptOpen(true); return; }
    if (isServicePickStep && !multiOn && addons.length > 0 && pickedAddons.length === 0) { setSkipOpen(true); return; }
    advance();
  };
  const end = dates.length ? dates[dates.length - 1] : today;
  const minDate = dates[0] ?? today;

  // ── Submit ───────────────────────────────────────────────────────────────
  // Address, notes — the same for every visit of a multi-date checkout.
  const shared = () => ({
    notes: notes.trim() || undefined,
    house_unit: addr.unit.trim(),
    address: addr.address.trim(),
    city: addr.city.trim() || undefined,
    postcode: addr.postcode.trim() || undefined,
    address_lat: pinLat ?? null,
    address_lng: pinLng ?? null,
    lobby_note: addr.lobby.trim() || undefined,
  });
  const payload = (): CreateBookingPayload => ({
    service_id: service!.id,
    appointment_date: date!,
    appointment_time: time!,
    duration_minutes: slotMinutes(service!, time),
    selected_addon_ids: pickedAddons.map(a => a.id),
    ...shared(),
    requested_maid_id: maidId,
  });

  // Multi-date: one item per finished visit, each with its own service, date,
  // time, extras and (if chosen) team member — the address etc. is shared.
  const visitItems = (): MultiBookingItem[] => multiPicks.map(p => {
    const svc = (svcQ.data ?? []).find(x => x.id === p.serviceId);
    return {
      service_id: p.serviceId,
      appointment_date: p.dateKey,
      appointment_time: p.time,
      duration_minutes: svc ? slotMinutes(svc, p.time) : undefined,
      selected_addon_ids: p.addonIds,
      ...(p.requestedMaidId ? { requested_maid_id: p.requestedMaidId } : {}),
    };
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
    if (!token || (multiOn && multiPicks.length === 0)) return;
    setBusy(true); setErr(null);
    try {
      if (!cfg?.paymentEnabled) {
        if (multiOn) { await createVisits(); return; }
        finish(await createBooking(token, payload()));
        return;
      }
      const items = multiOn ? visitItems() : [];
      const body: CreateBookingPayload & { multi_bookings?: MultiBookingItem[] } = multiOn
        ? { ...shared(), ...items[0], ...(items.length > 1 ? { multi_bookings: items } : {}) }
        : payload();
      setExpected(multiOn ? items.length : 1);
      const r = await startPayment(token, { ...body, redeem_points: pointsApplied > 0, redeem_points_amount: pointsApplied || undefined });
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

  // No-payment tenants, multi-date (web): one create call per visit. Dates run
  // side by side; visits on the same date in order. On a failure the visits
  // already created are dropped from the list so a retry never repeats them.
  const createVisits = async () => {
    if (!token) return;
    const items = visitItems();
    const base = shared();
    const made: (BookingSuccess | null)[] = items.map(() => null);
    const byDate = new Map<string, number[]>();
    items.forEach((it, i) => byDate.set(it.appointment_date, [...(byDate.get(it.appointment_date) ?? []), i]));
    let firstFailure: unknown = null;
    await Promise.all([...byDate.values()].map(async idxs => {
      for (const i of idxs) {
        try { made[i] = await createBooking(token, { ...base, ...items[i] }); }
        catch (e) { firstFailure = firstFailure ?? e; return; }
      }
    }));
    const created = made.filter((x): x is BookingSuccess => !!x);
    if (firstFailure) {
      const doneKeys = new Set(items.filter((_, i) => made[i]).map(it => it.appointment_date));
      setMultiPicks(ps => ps.filter(p => !doneKeys.has(p.dateKey)));
      if (created.length) {
        queryClient.invalidateQueries({ queryKey: ['bookings'] });
        const refs = created.map(c => formatBookingId(c.booking_id)).join(', ');
        const f = firstFailure as Error;
        throw new ApiError(`${f.message} — ${created.length} of ${items.length} bookings were already created (${refs}); the rest were not.`,
          f instanceof ApiError ? f.code : 'unknown', f instanceof ApiError ? f.status : 0);
      }
      throw firstFailure;
    }
    finish({
      ...created[0],
      bookings: created.map(c => ({
        booking_id: c.booking_id ?? '', service_name: c.service_name ?? '', appointment_date: c.appointment_date ?? '',
        appointment_time: c.appointment_time ?? '', addons: c.addons,
      })),
    });
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
        if (s.status === 'confirmed') {
          // Multi-slot: the finalizer writes visits one by one — show the
          // confirmation now and keep filling the list in behind it.
          if (expected > 1 && (s.bookings?.length ?? 0) < expected) setCatchUp(hold);
          finish(s);
        }
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

  // After a multi-slot 'confirmed': poll until every visit is in (≈30 s max).
  useEffect(() => {
    if (!catchUp || !token) return;
    let stop = false;
    let n = 0;
    const iv = setInterval(async () => {
      n += 1;
      try {
        const s = await paymentStatus(token, catchUp);
        if (stop) return;
        if (s.status === 'confirmed') {
          setDone(s);
          if ((s.bookings?.length ?? 0) >= expected) setCatchUp(null);
        }
      } catch { /* keep polling */ }
      if (n >= 30 && !stop) setCatchUp(null);
    }, 1000);
    return () => { stop = true; clearInterval(iv); };
  }, [catchUp, token, expected]);

  const cancelPayment = async () => {
    if (!token || !hold) return;
    setBusy(true);
    try {
      const s = await paymentStatus(token, hold, true); // server re-checks with HitPay first
      if (s.status === 'confirmed') {
        if (expected > 1 && (s.bookings?.length ?? 0) < expected) setCatchUp(hold);
        finish(s);
      }
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
    if (step === 1) return order === 'date-first' ? (multiOn ? multiDates.length > 0 : !!date) : !!service;
    // Multi-date: every ticked date needs its finished visit.
    if (step === 2 && multiOn) return multiDates.length > 0 && !workingDateKey;
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
    <TimesPanel date={date} rows={service ? timeRows : []} timeFormat={timeFormat} time={time} onTime={multiOn ? onTimeMulti : setTime}
      maids={service ? maids : []} maidId={maidId} onMaid={setMaidId} emptyHint
      multi={multiOn ? {
        count: multiDates.length,
        working: workingDateKey,
        index: workingDateKey ? multiDates.indexOf(workingDateKey) + 1 : 0,
        onSave: time ? () => recordPick(time) : undefined,
      } : undefined} />
  );
  // Every tap goes through tapDate (single pick, add / remove in a series).
  const calendar = (onPick: (d: string) => void, match: Parameters<typeof MonthCalendar>[0]['slotMatches']) => (
    <MonthCalendar value={multiOn ? null : date} today={today} minDate={minDate} maxDate={end} holidays={holidays}
      allowHoliday={!!cfg?.allowHolidayBooking} token={token} slotMatches={match} disabled={paused}
      onPick={k => tapDate(k, onPick)}
      multi={multiOn ? { dates: multiDates, done: multiPicks.map(p => p.dateKey), working: workingDateKey } : undefined} />
  );
  // The step's sub line says how to pick several dates (web DateTimeStep head).
  const calSub = multiOn
    ? t('{n} dates picked (up to {max}). Tap a date again to remove it.', { n: multiDates.length, max: MULTI_MAX })
    : cfg?.multiBookingEnabled
      ? t('Pick a date, then a time slot. Tap more dates to book several visits in one payment.')
      : t('Pick a date, then a time slot.');
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
          <StepHead title={t('When would you like it?')} sub={calSub} />
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
          <StepHead title={t('When works for you?')} sub={calSub} />
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
    if (step === 4 && (multiOn ? multiPicks.length > 0 : !!(service && date && time && price))) {
      return <ConfirmStep tenantName={tenant.name} serviceName={service?.name ?? ''} slotPrice={price?.slotPrice ?? null} isMember={mem}
        date={date ?? ''} time={time ?? ''} timeFormat={timeFormat} addons={pickedAddons} addonTotal={price?.addonTotal ?? 0}
        visits={multiOn ? multiPicks : null}
        name={cust?.name ?? ''} phone={cust?.phone_e164 ?? ''}
        addressLine={[addr.unit.trim(), addr.address.trim()].filter(Boolean).join(', ')}
        addressSub={[addr.postcode.trim(), addr.city.trim()].filter(Boolean).join(' ')}
        lobby={addr.lobby.trim()} notes={notes.trim()} />;
    }
    if (step === 5 && done) {
      return <SuccessStep tenantName={tenant.name} bookingRef={formatBookingId(done.booking_id) || done.booking_ref || ''}
        serviceName={done.service_name ?? service?.name ?? '—'} date={done.appointment_date ?? date ?? ''}
        time={done.appointment_time ?? time ?? ''} timeFormat={timeFormat} addons={done.addons}
        more={(done.bookings?.length ?? 0) > 1 ? done.bookings!.slice(1).map(b => ({
          ref: formatBookingId(b.booking_id), serviceName: b.service_name, date: b.appointment_date, time: b.appointment_time,
        })) : undefined}
        onBookAgain={reset} onViewBookings={() => { reset(); router.navigate('/'); }} />;
    }
    return null;
  })();

  const showFoot = step !== 5 && !paying && !failed;
  // The summary shows the visits' totals once a date is ticked (steps 1–2) or at checkout.
  const multiLive = multiOn && (step === 4 ? multiPicks.length > 0 : multiDates.length > 0);

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

        {!paying && !failed && !(step === 5 && multiOn) && (
          <SummaryCard
            service={service} isMember={mem} date={date} time={time} timeFormat={timeFormat}
            addons={pickedAddons.map(a => ({ id: a.id, name: a.name, price: price?.eff.get(a.id) ?? a.price }))}
            addonTotal={price?.addonTotal ?? 0} priceFrom={price?.from ?? null} slotPrice={price?.slotPrice ?? null}
            peakName={price?.peak.rule?.name ?? ''}
            sdAmount={(multiTotals && multiLive ? multiTotals.sd : price?.sd) ?? 0}
            sdCfg={(multiTotals && multiLive ? multiTotals.sdCfg : price?.sdCfg) ?? null}
            taxRate={cfg?.taxRate ?? 0} taxMode={cfg?.taxMode ?? 'exclusive'} taxName={cfg?.taxName || 'Tax'}
            tax={(multiTotals && multiLive ? multiTotals.tax : price?.tax) ?? { tax: 0, total: 0, rounding: 0 }} checkout={step === 4}
            multi={multiOn && step < 4 ? { dates: multiDates, picks: multiPicks, working: workingDateKey, onRemove: removeMultiPick, hideTimes: order === 'date-first' } : null}
            visits={multiOn && step === 4 ? multiPicks : null}
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
      <MultiAddonPrompt open={multiPromptOpen} onClose={() => setMultiPromptOpen(false)} visits={missingAddons}
        tenantName={tenant.name} memberMode={addonMode} timeFormat={timeFormat}
        onConfirm={sel => { setMultiPromptOpen(false); setMultiPicks(ps => applyVisitAddons(ps, sel, addonMode)); advance(); }} />
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
