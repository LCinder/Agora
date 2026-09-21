import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_900Black,
  useFonts,
} from '@expo-google-fonts/archivo';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { configureNotifications } from '../lib/push';
import { AppProvider } from '../providers/app-provider';

// The first frame must already be in the right face: a flash of the system
// font and then a reflow is the cheapest-looking thing an app can do.
void SplashScreen.preventAutoHideAsync();

// Before the first render, so a notification arriving while somebody is looking
// at the calendar is still shown.
configureNotifications();

/**
 * Root layout.
 *
 * Screens are pushed on a plain stack; the tab bar lives inside the `(tabs)`
 * group so the municipality selector and the event detail can cover it.
 */
export default function RootLayout() {
  const router = useRouter();
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  /**
   * Tapping a notification opens what it was about.
   *
   * A reminder or a change of time opens the event; the start of a live session
   * opens the map, which is the whole reason somebody taps that one.
   */
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const eventId = data['eventId'];

      if (typeof eventId !== 'string' || eventId === '') return;

      router.push(data['live'] === 'true' ? `/live/${eventId}` : `/event/${eventId}`);
    });

    return () => subscription.remove();
  }, [router]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="event/[id]" options={{ presentation: 'card' }} />
          {/* The live map is something you drop into and out of, not a page
              you navigate to: it comes up from the bottom. */}
          <Stack.Screen
            name="live/[id]"
            options={{ presentation: 'card', animation: 'slide_from_bottom' }}
          />
          {/* Volunteer mode is not part of the resident's journey: it is reached
              from Settings, by somebody who was handed a code. */}
          <Stack.Screen name="volunteer" options={{ presentation: 'card' }} />
        </Stack>
        <StatusBar style="auto" />
      </AppProvider>
    </SafeAreaProvider>
  );
}
