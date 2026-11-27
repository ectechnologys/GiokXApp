import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/** Default country for numbers typed without a +code (web default: MY). */
export const DEFAULT_COUNTRY: CountryCode = 'MY';

/** E.164 (+60123456789) for a valid number, otherwise null. Accepts local
 *  forms like 012-345 6789 as well as +60 12 345 6789. */
export function toE164(input: string, country: CountryCode = DEFAULT_COUNTRY): string | null {
  const p = parsePhoneNumberFromString(input.trim(), country);
  return p?.isValid() ? p.number : null;
}

export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}
