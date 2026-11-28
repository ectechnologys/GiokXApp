// Where HitPay sends the browser tab after a payment.
//
// HitPay can only return to a web address, so it goes to the company's site at
// /app-return/<this app's link, base64url>/…; that page (web repo,
// src/lib/appReturn.ts) jumps straight back into the app. The app ignores the
// incoming link (see app/+native-intent.tsx): the screen that started the
// payment is still polling payments-status and shows the result itself.
import * as Linking from 'expo-linking';

import { tenant } from '@/config/tenant';

/** chiamstest://pay-return in the real app; exp://…/--/pay-return in Expo Go. */
export const appReturnLink = Linking.createURL('pay-return');

const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const paymentReturnOrigin = `https://${tenant.host}/app-return/${b64url(appReturnLink)}`;
