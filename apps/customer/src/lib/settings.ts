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

export interface LatLng { lat: number; lng: number }
export interface CoverageZone { id: string; name: string; stage: 'active' | 'coming_soon'; path: LatLng[]; service_ids?: string[] | null }
export interface CoverageConfig { zones: CoverageZone[]; enforce_booking?: boolean }

function inside(pt: LatLng, path: LatLng[]): boolean {
  let hit = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].lng, yi = path[i].lat, xj = path[j].lng, yj = path[j].lat;
    if (((yi > pt.lat) !== (yj > pt.lat)) && (pt.lng < ((xj - xi) * (pt.lat - yi)) / (yj - yi) + xi)) hit = !hit;
  }
  return hit;
}

export type CoverageVerdict = { kind: 'covered' | 'coming_soon'; zoneName: string } | { kind: 'outside' };

/** Web judgeCoverage (no service filter): which zone a pin falls in. */
export function judgeCoverage(cfg: CoverageConfig | null | undefined, pt: LatLng | null | undefined): CoverageVerdict | null {
  const zones = (cfg?.zones ?? []).filter(z => (z.path?.length ?? 0) >= 3);
  if (!zones.length || !pt || !isFinite(pt.lat) || !isFinite(pt.lng)) return null;
  const a = zones.find(z => z.stage === 'active' && inside(pt, z.path));
  if (a) return { kind: 'covered', zoneName: a.name };
  const s = zones.find(z => z.stage === 'coming_soon' && inside(pt, z.path));
  if (s) return { kind: 'coming_soon', zoneName: s.name };
  return { kind: 'outside' };
}

export interface DisplaySettings {
  timeFormat: '12h' | '24h';
  chatEnabled: boolean;
  reviews: { enabled: boolean; nudge: boolean; googleUrl: string; googleThreshold: number };
  coverage: CoverageConfig | null;
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
        'coverage_map',
      ]);
      const cov = s.coverage_map as { value?: CoverageConfig } & CoverageConfig | undefined;
      const rv = (s.review_settings ?? {}) as { enabled?: boolean; nudge_enabled?: boolean; google_review_url?: string; google_threshold?: number };
      return {
        timeFormat: s.time_format === '24h' ? '24h' : '12h',
        coverage: (cov?.value ?? cov ?? null) as CoverageConfig | null,
        chatEnabled: s.chat_enabled !== false,
        reviews: { enabled: rv.enabled !== false, nudge: rv.nudge_enabled !== false, googleUrl: String(rv.google_review_url ?? ''), googleThreshold: Number(rv.google_threshold ?? 5) },
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
