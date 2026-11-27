// Colours copied from the web portal so the app looks the same.
//  - Account pages (web /account, Tailwind gray scale + tenant accent)
//  - Booking flow (web BookingFlowPage.css --bf-* tokens)
// The website is light-only, so the app is too (app.config userInterfaceStyle).
import { tenant } from '@/config/tenant';

/** Tenant's website accent (gold for Chiam's); falls back to the brand colour. */
export const accent = tenant.accent ?? tenant.primaryColor;

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
}
export const rgba = (hex: string, a: number) => `rgba(${rgb(hex).join(',')},${a})`;
const darken = (hex: string, k: number) => `rgb(${rgb(hex).map(v => Math.round(v * k)).join(',')})`;

/** Web --acct-accent-soft / -deep / -tint. */
export const accentSoft = rgba(accent, 0.14);
export const accentDeep = darken(accent, 0.6);
export const accentTint = rgba(accent, 0.05);

/** Tailwind gray scale as used across the web account pages. */
export const gray = {
  50: '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db', 400: '#9ca3af',
  500: '#6b7280', 600: '#4b5563', 700: '#374151', 800: '#1f2937', 900: '#111827',
};

/** Booking flow palette (web --bf-*). */
export const bf = {
  ground: '#f7f5f0', paper: '#ffffff', raised: '#fbfaf5', ink: '#14140f', muted: '#75726a', muted2: '#a29e93', ink2: '#262620', ink3: '#4a4842',
  line: '#e6e2d6', hover: '#f2efe4', good: '#086048', goodSoft: 'rgba(8,96,72,0.08)', danger: '#a4381f', dangerSoft: 'rgba(164,56,31,0.08)',
};

/** Account hero background (web: linear-gradient(135deg, #0b1220, #131b2c, #0b1220)). */
export const heroColors = ['#0b1220', '#131b2c', '#0b1220'] as const;

/** Status / payment badge colours (web bookingStatusBadge / bookingPayBadge). */
export function badgeColors(v: string): { bg: string; ring: string; text: string } {
  const s = v.toLowerCase();
  if (s === 'confirmed' || s === 'completed' || s === 'paid' || s === 'cash') return { bg: '#ecfdf5', ring: '#d1fae5', text: '#047857' };
  if (s === 'cancelled') return { bg: '#fef2f2', ring: '#fee2e2', text: '#dc2626' };
  if (s === 'unpaid') return { bg: '#fff7ed', ring: '#ffedd5', text: '#c2410c' };
  if (s === 'partial') return { bg: '#fefce8', ring: '#fef9c3', text: '#a16207' };
  if (s === 'redemption') return { bg: '#eff6ff', ring: '#dbeafe', text: '#1d4ed8' };
  if (s === 'package') return { bg: '#faf5ff', ring: '#f3e8ff', text: '#7e22ce' };
  return { bg: gray[50], ring: gray[200], text: gray[600] };
}

const light = { bg: '#ffffff', page: gray[50], text: gray[900], muted: gray[500], border: gray[200], field: gray[100], danger: '#dc2626' };

/** Kept for existing screens; always the light palette now. */
export function useColors() {
  return light;
}
