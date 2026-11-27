// Shared bits of the web booking flow (BookingFlowPage.tsx / .css) for the
// app: --bf-* sizes, the Stepper, step heading, field atoms, the bottom sheet
// the web shows its modals as on a phone, and the web's formatting helpers.
import { ArrowLeftRight, Check, Lock } from 'lucide-react-native';
import type { ComponentProps, ReactNode } from 'react';
import { Fragment } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getLang, useT } from '@/lib/i18n';
import { accent, bf } from '@/lib/theme';

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
/** --bf-line-2 (not in the app theme). */
export const line2 = '#ecead9';
/** Hover / pressed border on cards (#d5cfba in the web CSS). */
export const pressedLine = '#d5cfba';

// ── Formatting (web formatDate / fmtDate / RM {n}) ──────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
/** The web prints plain numbers: "RM 135", "RM 214.5". */
export const rm = (n: number) => `RM ${round2(Number(n) || 0)}`;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ZH_WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const ZH_WD_LONG = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const parse = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);

/** 'EEE, d MMM' → "Tue, 15 Dec" / "12月15日 周二". */
export function fmtDayShort(iso: string): string {
  const d = parse(iso);
  if (isNaN(d.getTime())) return iso;
  if (getLang() === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日 ${ZH_WD[d.getDay()]}`;
  return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`;
}
/** 'EEE, d MMM yyyy' → "Tue, 15 Dec 2026". */
export function fmtDayMid(iso: string): string {
  const d = parse(iso);
  if (isNaN(d.getTime())) return iso;
  if (getLang() === 'zh') return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${ZH_WD[d.getDay()]}`;
  return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}
/** 'EEEE, d MMMM yyyy' → "Tuesday, 15 December 2026". */
export function fmtDayLong(iso: string): string {
  const d = parse(iso);
  if (isNaN(d.getTime())) return iso;
  if (getLang() === 'zh') return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${ZH_WD_LONG[d.getDay()]}`;
  return `${WD_LONG[d.getDay()]}, ${d.getDate()} ${MON_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Web formatBookingId: "BK-XXXXXXXX". */
export function formatBookingId(id?: string | null): string {
  if (!id) return '';
  const hex = id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return hex ? `BK-${hex}` : '';
}

// ── Points redemption (web redeemCap / redeemClamp / minChargeRedeem) ───────

const HITPAY_MIN = 0.3;
export function minChargeRedeem(r: number, total: number): number {
  const left = (x: number) => Math.round((total - x) * 100) / 100;
  if (r <= 0 || left(r) <= 0 || left(r) >= HITPAY_MIN) return r;
  let x = Math.floor(r);
  while (x > 0 && left(x) > 0 && left(x) < HITPAY_MIN) x -= 1;
  return Math.max(0, x);
}
export function redeemCap(balance: number, total: number, whole: boolean): number {
  const cap = Math.round(Math.min(Math.max(0, balance), total) * 100) / 100;
  return minChargeRedeem(whole && balance < total ? Math.floor(cap) : cap, total);
}
export function redeemClamp(n: number, cap: number, whole: boolean, total: number): number {
  const r = Math.round(Math.max(0, Math.min(n, cap)) * 100) / 100;
  return minChargeRedeem(whole && r < cap ? Math.floor(r) : r, total);
}

// ── Stepper (web Stepper, .bf-stepper / .bf-step; labels hidden ≤900px) ──────

export function Stepper({ step, onSwap, swapLabel }: { step: number; onSwap?: () => void; swapLabel: string }) {
  return (
    <View style={s.stepper}>
      {[1, 2, 3, 4, 5].map(n => {
        const done = step > n;
        const active = step === n;
        const showSwap = n === 1 && !!onSwap && step <= 2;
        return (
          <Fragment key={n}>
            <View style={[s.stepIdx, done && s.stepDone, active && s.stepActive]}>
              {done ? <Check size={12} color="#fff" strokeWidth={3} /> : <Text style={[s.stepNum, (done || active) && { color: '#fff' }]}>{n}</Text>}
            </View>
            {n < 5 && (showSwap ? (
              <View style={s.connector}>
                <View style={[s.rail, { flex: 1, minWidth: 12 }]} />
                <Pressable onPress={onSwap} hitSlop={8} style={s.swap} accessibilityLabel={swapLabel}>
                  <ArrowLeftRight size={12} color={bf.muted} strokeWidth={2.5} />
                </Pressable>
                <View style={[s.rail, { flex: 1, minWidth: 12 }]} />
              </View>
            ) : <View style={[s.rail, s.railSolo]} />)}
          </Fragment>
        );
      })}
    </View>
  );
}

// ── Step heading ────────────────────────────────────────────────────────────

export function StepHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <>
      <Text style={s.h2}>{title}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : <View style={{ height: 16 }} />}
    </>
  );
}

/** Uppercase kicker (10.5px, 700, 0.22em). */
export function Kicker({ children, color = bf.muted, style }: { children: ReactNode; color?: string; style?: object }) {
  return <Text style={[s.kicker, { color }, style]}>{children}</Text>;
}

// ── Field atoms (web Field / .bf-field) ─────────────────────────────────────

export function BfField({ label, required, locked, textarea, icon, ...input }: {
  label: string; required?: boolean; locked?: boolean; textarea?: boolean; icon?: ReactNode;
} & ComponentProps<typeof TextInput>) {
  return (
    <View style={s.field}>
      <View style={s.fieldLabelRow}>
        <Text style={s.fieldLabel}>
          {label}
          {required && <Text style={s.req}>*</Text>}
        </Text>
        {locked && <Lock size={12} color={bf.muted2} strokeWidth={2.5} style={{ marginLeft: 'auto' }} />}
      </View>
      <View>
        {icon && <View style={s.fieldIcon} pointerEvents="none">{icon}</View>}
        <TextInput
          placeholderTextColor={bf.muted2}
          editable={!locked}
          multiline={textarea}
          textAlignVertical={textarea ? 'top' : 'center'}
          {...input}
          style={[s.input, textarea && s.textarea, locked && s.inputLocked, icon ? { paddingLeft: 34 } : null, input.style]}
        />
      </View>
    </View>
  );
}

/** Fieldset heading: "ADDRESS ───────" (.bf-fset-h). */
export function FsetHead({ label }: { label: string }) {
  return (
    <View style={s.fsetH}>
      <Text style={s.kicker}>{label}</Text>
      <View style={s.fsetRule} />
    </View>
  );
}

/** Square tick (web .bf-palette-tick / checkbox). */
export function Tick({ on, color = bf.ink, size = 18, radius = 5 }: { on: boolean; color?: string; size?: number; radius?: number }) {
  return (
    <View style={[s.tick, { width: size, height: size, borderRadius: radius }, on ? { backgroundColor: color, borderColor: color } : null]}>
      {on && <Check size={size - 6} color="#fff" strokeWidth={3} />}
    </View>
  );
}

// ── Bottom sheet (web .bf-modal at ≤900px: full-width, rounded top) ─────────

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: Math.max(60, insets.bottom + 40) }]}>{children}</View>
      </View>
    </Modal>
  );
}

/** Footer used by both add-on sheets: "n added · RM x" + ink button. */
export function SheetFoot({ count, total, button, onPress }: { count: number; total: number; button: string; onPress: () => void }) {
  const { t } = useT();
  return (
    <View style={s.foot}>
      <Text style={s.footText}>
        {t('{n} added', { n: count })}
        {count > 0 && <Text> · <Text style={s.footTotal}>{`RM ${total.toFixed(2).replace(/\.00$/, '')}`}</Text></Text>}
      </Text>
      <Pressable onPress={onPress} style={({ pressed }) => [s.footBtn, pressed && { backgroundColor: bf.ink2 }]}>
        <Text style={s.footBtnText}>{button}</Text>
      </Pressable>
    </View>
  );
}

export const s = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 10 },
  stepIdx: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: bf.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  stepDone: { borderColor: bf.good, backgroundColor: bf.good },
  stepActive: { borderColor: bf.ink, backgroundColor: bf.ink },
  stepNum: { fontFamily: mono, fontSize: 11, fontWeight: '600', color: bf.muted },
  rail: { height: 1, backgroundColor: bf.line },
  railSolo: { flex: 1, minWidth: 20 },
  connector: { flex: 1, minWidth: 40, flexDirection: 'row', alignItems: 'center', gap: 6 },
  swap: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, alignItems: 'center', justifyContent: 'center' },

  h2: { fontSize: 18, fontWeight: '600', letterSpacing: -0.36, color: bf.ink, marginBottom: 6 },
  sub: { fontSize: 13.5, color: bf.ink3, lineHeight: 21, marginBottom: 22 },
  kicker: { fontSize: 10.5, fontWeight: '700', letterSpacing: 2.3, textTransform: 'uppercase', color: bf.muted },

  field: { gap: 5 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  fieldLabel: { fontSize: 11.5, fontWeight: '600', color: bf.ink2 },
  req: { color: accent, fontWeight: '700' },
  fieldIcon: { position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  input: { paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: bf.line, borderRadius: 8, fontSize: 13, color: bf.ink },
  textarea: { minHeight: 68 },
  inputLocked: { backgroundColor: bf.raised, color: bf.ink3 },
  fsetH: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  fsetRule: { flex: 1, height: 1, backgroundColor: bf.line },
  tick: { borderWidth: 1.5, borderColor: bf.muted2, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  scrim: { flex: 1, backgroundColor: 'rgba(20,20,15,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: bf.paper, borderWidth: 1, borderBottomWidth: 0, borderColor: bf.line, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    maxHeight: '84%', overflow: 'hidden',
    shadowColor: '#14140f', shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: -8 }, elevation: 12,
  },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: line2 },
  footText: { fontSize: 12, color: bf.muted, flexShrink: 1 },
  footTotal: { color: bf.ink, fontWeight: '600', fontSize: 13.5 },
  footBtn: { backgroundColor: bf.ink, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  footBtnText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
});
