import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppProvider } from '../providers/app-provider';

/**
 * Root layout.
 *
 * Screens are pushed on a plain stack; the tab bar lives inside the `(tabs)`
 * group so the municipality selector and the event detail can cover it.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="event/[id]" options={{ presentation: 'card' }} />
          <Stack.Screen name="live/[id]" options={{ presentation: 'card' }} />
        </Stack>
        <StatusBar style="auto" />
      </AppProvider>
    </SafeAreaProvider>
  );
}
