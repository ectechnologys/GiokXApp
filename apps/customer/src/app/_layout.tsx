import { QueryClientProvider } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';

import { tenant } from '@/config/tenant';
import { queryClient } from '@/lib/queries';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

function Routes() {
  const { session, loading } = useSession();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // A link into the app (e.g. chiams://booking/<id>) that arrives before the
  // saved session has loaded, or while signed out, would hit a protected
  // screen that isn't there yet. Remember it and open it once signed in.
  const pending = useRef<string | null>(null);
  const link = Linking.useLinkingURL();
  useEffect(() => {
    if (!link) return;
    const { path } = Linking.parse(link);
    if (path && path.startsWith('booking/')) pending.current = `/${path}`;
  }, [link]);
  useEffect(() => {
    if (loading || !session || !pending.current) return;
    const to = pending.current;
    pending.current = null;
    setTimeout(() => router.push(to as never), 0);
  }, [loading, session]);

  // Signing out drops every cached screen's data.
  useEffect(() => {
    if (!session) queryClient.clear();
  }, [session]);

  if (loading) return null;

  return (
    <Stack screenOptions={{ headerShown: false, headerTintColor: tenant.primaryColor }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="booking/[id]/index" options={{ headerShown: true, title: 'Booking' }} />
        <Stack.Screen name="booking/[id]/chat" options={{ headerShown: true, title: 'Chat' }} />
        <Stack.Screen name="booking/[id]/invoice" options={{ headerShown: true, title: 'Invoice' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, primary: tenant.primaryColor } };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={theme}>
        <SessionProvider>
          <StatusBar style="auto" />
          <Routes />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
