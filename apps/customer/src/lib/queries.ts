// Cached server data for the signed-in customer (React Query). Screens read
// these hooks; pull-to-refresh and focus refetch keep them fresh.
import { QueryClient, useQuery } from '@tanstack/react-query';

import { ApiError, getBookings, getProfile } from '@/lib/api';
import { getCoins } from '@/lib/booking';
import { useSession } from '@/lib/session';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    },
  },
});

/** Signs the customer out when the server says the saved token is no longer
 *  accepted (expired, or signed in on another device). */
function useAuthed<T>(key: string, fn: (token: string) => Promise<T>) {
  const { session, signOut } = useSession();
  const token = session?.token;
  return useQuery({
    queryKey: [key, session?.customer.id],
    enabled: !!token,
    queryFn: async () => {
      try {
        return await fn(token!);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await signOut();
        throw e;
      }
    },
  });
}

export const useBookings = () => useAuthed('bookings', t => getBookings(t).then(r => r.bookings ?? []));
export const useProfile = () => useAuthed('profile', getProfile);
export const useCoins = () => useAuthed('coins', getCoins);
