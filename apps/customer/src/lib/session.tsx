// Signed-in customer session, kept in the phone's encrypted storage
// (Android Keystore / iOS Keychain) so the customer stays signed in.
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { tenant } from '@/config/tenant';
import { ApiError, getProfile, type CustomerProfile } from '@/lib/api';

const KEY = `session_${tenant.slug}`;

interface Session {
  token: string;
  customer: CustomerProfile;
}

interface SessionState {
  session: Session | null;
  /** True until the saved session has been read from storage. */
  loading: boolean;
  signIn: (token: string, customer: CustomerProfile) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    setSession(null);
    await SecureStore.deleteItemAsync(KEY);
  }, []);

  const signIn = useCallback(async (token: string, customer: CustomerProfile) => {
    const s = { token, customer };
    setSession(s);
    await SecureStore.setItemAsync(KEY, JSON.stringify(s));
  }, []);

  useEffect(() => {
    (async () => {
      let saved: Session | null = null;
      try {
        const raw = await SecureStore.getItemAsync(KEY);
        saved = raw ? (JSON.parse(raw) as Session) : null;
      } catch {
        saved = null;
      }
      setSession(saved);
      setLoading(false);
      if (!saved) return;
      // Check the saved token is still accepted. 401 = expired or revoked:
      // sign out. Offline or a server hiccup keeps the customer signed in.
      try {
        const r = await getProfile(saved.token);
        const fresh = { ...saved, customer: { ...saved.customer, name: r.customer.name } };
        setSession(fresh);
        await SecureStore.setItemAsync(KEY, JSON.stringify(fresh));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await signOut();
      }
    })();
  }, [signOut]);

  return <Ctx.Provider value={{ session, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
