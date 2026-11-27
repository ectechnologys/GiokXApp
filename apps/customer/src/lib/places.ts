// Google address search (Places API New) and geocoding, with the company's
// Android-restricted key. The X-Android-* headers let that restriction
// accept the calls (same rule the Google SDKs use).
import { tenant } from '@/config/tenant';

export const GMAPS_KEY = tenant.googleMapsKey ?? '';

const headers = (): Record<string, string> => ({
  'X-Goog-Api-Key': GMAPS_KEY,
  'X-Android-Package': tenant.androidPackage,
  ...(tenant.androidCertSha1 ? { 'X-Android-Cert': tenant.androidCertSha1 } : {}),
});

export interface PlaceSuggestion { placeId: string; main: string; secondary: string }

/** One search "session" (typing + the pick) is billed once by Google. */
export const newSessionToken = () =>
  'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export async function autocomplete(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  if (!GMAPS_KEY || input.trim().length < 3) return [];
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers() },
    body: JSON.stringify({ input, includedRegionCodes: ['my'], sessionToken }),
  });
  const d = await res.json().catch(() => ({}));
  return (d.suggestions ?? [])
    .map((s: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }) => s.placePrediction)
    .filter(Boolean)
    .map((p: NonNullable<{ placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } }>) => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
      secondary: p.structuredFormat?.secondaryText?.text ?? '',
    }));
}

export interface PickedPlace { address: string; postcode: string; city: string; lat: number; lng: number }

type Comp = { longText?: string; types?: string[] };

/** The picked suggestion as the web fills it: street part of the formatted
 *  address (place name first when it isn't in it), postcode, city, pin. */
export async function placeDetails(placeId: string, sessionToken: string): Promise<PickedPlace | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${sessionToken}&languageCode=en`, {
    headers: { ...headers(), 'X-Goog-FieldMask': 'addressComponents,formattedAddress,location,displayName' },
  });
  const p = await res.json().catch(() => null);
  if (!p?.location) return null;
  const comps: Comp[] = p.addressComponents ?? [];
  const get = (k: string) => comps.find(c => c.types?.includes(k))?.longText ?? '';
  const postcode = get('postal_code');
  const city = get('locality') || get('administrative_area_level_2') || get('administrative_area_level_1');
  const parts = String(p.formattedAddress ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const pcIdx = postcode ? parts.findIndex(s => s.startsWith(postcode)) : -1;
  const addrParts = pcIdx > 0 ? parts.slice(0, pcIdx) : parts.slice(0, Math.max(1, parts.length - 2));
  const name = p.displayName?.text ?? '';
  if (name && !addrParts.some(s => s.toLowerCase().includes(name.toLowerCase()))) addrParts.unshift(name);
  return { address: addrParts.join(', '), postcode, city, lat: p.location.latitude, lng: p.location.longitude };
}

/** Pin for a typed address (web: geocode on unit + address change). */
export async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
  if (!GMAPS_KEY) return null;
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=my&key=${GMAPS_KEY}`, { headers: headers() });
  const d = await res.json().catch(() => null);
  const loc = d?.status === 'OK' ? d.results?.[0]?.geometry?.location : null;
  return loc ? { lat: loc.lat, lng: loc.lng } : null;
}
