// The company's PUBLIC settings (app_settings rows the anon key may read —
// the same whitelist the web portal relies on). Values are stored as
// { value: x }; this unwraps them.
import { useQuery } from '@tanstack/react-query';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config/backend';
import { tenant } from '@/config/tenant';

export async function getPublicSettings(keys: string[]): Promise<Record<string, unknown>> {
  const url =
    `${SUPABASE_URL}/rest/v1/app_settings?select=id,value` +
    `&tenant_id=eq.${tenant.tenantId}&id=in.(${keys.map(encodeURIComponent).join(',')})`;
  const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`Settings request failed (${res.status})`);
  const rows = (await res.json()) as { id: string; value: unknown }[];
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const v = r.value as { value?: unknown } | null;
    out[r.id] = v && typeof v === 'object' && 'value' in v ? v.value : v;
  }
  return out;
}

export interface DisplaySettings {
  timeFormat: '12h' | '24h';
  chatEnabled: boolean;
  reviews: { enabled: boolean; googleUrl: string; googleThreshold: number };
  cancelFee: { enabled: boolean; hours: number; amount: number; waiveMember: boolean; timezone: string };
}

export function useDisplaySettings() {
  return useQuery({
    queryKey: ['display-settings'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DisplaySettings> => {
      const s = await getPublicSettings([
        'time_format',
        'booking_cancel_fee_enabled',
        'booking_cancel_fee_hours',
        'booking_cancel_fee_amount',
        'booking_cancel_fee_waive_member',
        'booking_timezone',
        'chat_enabled',
        'review_settings',
      ]);
      const rv = (s.review_settings ?? {}) as { enabled?: boolean; google_review_url?: string; google_threshold?: number };
      return {
        timeFormat: s.time_format === '24h' ? '24h' : '12h',
        chatEnabled: s.chat_enabled !== false,
        reviews: { enabled: rv.enabled !== false, googleUrl: String(rv.google_review_url ?? ''), googleThreshold: Number(rv.google_threshold ?? 5) },
        cancelFee: {
          enabled: s.booking_cancel_fee_enabled === true,
          hours: Number(s.booking_cancel_fee_hours ?? 24),
          amount: Math.max(0, Number(s.booking_cancel_fee_amount ?? 0)),
          waiveMember: s.booking_cancel_fee_waive_member === true,
          timezone: String(s.booking_timezone || 'Asia/Kuala_Lumpur'),
        },
      };
    },
  });
}
