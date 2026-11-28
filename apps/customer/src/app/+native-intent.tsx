// The link back from a payment (see lib/payReturn.ts) only brings the app to
// the front: the booking / credits screen underneath shows the result. If the
// app had been closed meanwhile, open Appointments, where the booking shows.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (path.includes('pay-return')) return initial ? '/' : null;
  } catch { /* fall through */ }
  return path;
}
