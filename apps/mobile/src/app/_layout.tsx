import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_900Black,
  useFonts,
} from '@expo-google-fonts/archivo';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '../providers/app-provider';

// The first frame must already be in the right face: a flash of the system
// font and then a reflow is the cheapest-looking thing an app can do.
void SplashScreen.preventAutoHideAsync();

/**
 * Root layout.
 *
 * Screens are pushed on a plain stack; the tab bar lives inside the `(tabs)`
 * group so the municipality selector and the event detail can cover it.
 */
export default function RootLayout() {
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
        </Stack>
        <StatusBar style="auto" />
      </AppProvider>
    </SafeAreaProvider>
  );
}
