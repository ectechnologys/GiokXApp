// EN | 中文 for the app — the web portal's custI18n with the same dictionaries
// (src/i18n/zh-*.ts are copied unchanged from the web), so every screen reads
// exactly like its web page in both languages.
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { tenant } from '@/config/tenant';
import { callFunction } from '@/lib/api';
import { ZH_ACCOUNT } from '@/i18n/zh-account';
import { ZH_BOOKING } from '@/i18n/zh-booking';
import { ZH_COMMON } from '@/i18n/zh-common';
import { ZH_LOGIN } from '@/i18n/zh-login';
import { ZH_SITE } from '@/i18n/zh-site';

export type Lang = 'en' | 'zh';
const ALL: Record<string, string> = { ...ZH_SITE, ...ZH_LOGIN, ...ZH_BOOKING, ...ZH_ACCOUNT, ...ZH_COMMON };

const KEY = `lang_${tenant.slug}`;
let chosen: Lang = 'en';
let allowed = false; // until the company says 中文 is on (no flash of the switch)
let current: Lang = 'en';
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

SecureStore.getItemAsync(KEY).then(v => {
  if (v === 'en' || v === 'zh') { chosen = v; current = allowed ? v : 'en'; emit(); }
}).catch(() => {});

let asked = false;
/** Whether the company offers 中文 (Settings → General), from the public booking config. */
export function loadLangConfig() {
  if (asked) return;
  asked = true;
  callFunction<{ chineseEnabled?: boolean }>('public-booking-config', {})
    .then(cfg => {
      if (cfg?.chineseEnabled !== true || allowed) return;
      allowed = true;
      current = allowed ? chosen : 'en';
      emit();
    })
    .catch(() => {});
}

export const getLang = () => current;
export function setLang(l: Lang) {
  if (l === current || !allowed) return;
  chosen = l;
  current = l;
  SecureStore.setItemAsync(KEY, l).catch(() => {});
  emit();
}

/** Translate English UI text (the web's keys), filling {placeholders}. */
export function t(en: string, vars?: Record<string, string | number>): string {
  const raw = current === 'zh' ? (ALL[en] ?? en) : en;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : raw;
}

/** Re-render on a language change; returns t plus the switch. */
export function useT() {
  const lang = useSyncExternalStore(subscribe, () => current);
  const ok = useSyncExternalStore(subscribe, () => allowed);
  return { t, lang, setLang, allowed: ok };
}

/** "Mon, Oct 05, 2026" / "2026年10月5日 周一" (web fmtBookingDate). */
export function fmtBookingDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  if (current === 'zh') return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${'周日 周一 周二 周三 周四 周五 周六'.split(' ')[d.getDay()]}`;
  return d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/** "Nov 27, 2026" / "2026年11月27日". */
export function fmtShortDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  if (current === 'zh') return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "November 2026" / "2026年11月". */
export function fmtMonth(y: number, m0: number): string {
  if (current === 'zh') return `${y}年${m0 + 1}月`;
  return new Date(y, m0, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "9:00 AM" / "上午9点" / "09:00" (web fmtBookingTime). */
export function fmtBookingTime(time: string | null | undefined, format: '12h' | '24h' = '12h'): string {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  if (format === '24h') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (current === 'zh') {
    const part = h < 12 ? '上午' : h === 12 ? '中午' : h < 18 ? '下午' : '晚上';
    const hh = h % 12 || 12;
    return m ? `${part}${hh}:${String(m).padStart(2, '0')}` : `${part}${hh}点`;
  }
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
