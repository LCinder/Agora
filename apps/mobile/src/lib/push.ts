import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { deviceClient } from './devices';

/**
 * Notifications, from the phone's side.
 *
 * The product asks for two: a reminder the evening before, and a warning when
 * something a resident marked changes or is called off. Both are sent by the
 * notification job (D-046); what this file does is get the address it sends to,
 * and only after the neighbour has agreed to it.
 *
 * `unsupported` is a real answer and not a failure: the demo build has no API to
 * register with, a simulator cannot receive a push, and neither can a build with
 * no Expo project id — which is the state of this repository until the first
 * internal build is made.
 */
export type PushState = 'unsupported' | 'undetermined' | 'denied' | 'granted';

/** Android shows nothing at all without a channel, silently. */
const CHANNEL = 'default';

function projectId(): string | null {
  const fromEnvironment = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

  if (fromEnvironment !== undefined && fromEnvironment !== '') return fromEnvironment;

  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId;

  return typeof id === 'string' && id !== '' ? id : null;
}

/** Whether this build can register at all. */
export function pushAvailable(): boolean {
  return deviceClient !== null && projectId() !== null;
}

/**
 * Shows a notification that arrives while the app is open.
 *
 * Without this, a change of time sent at nine in the evening is invisible to
 * anybody who happens to be looking at the calendar when it lands.
 */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Avisos del municipio',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => undefined);
  }
}

export async function pushState(): Promise<PushState> {
  if (!pushAvailable()) return 'unsupported';

  try {
    const permission = await Notifications.getPermissionsAsync();

    if (permission.granted) return 'granted';

    return permission.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }
}

async function registerToken(): Promise<boolean> {
  const id = projectId();

  if (deviceClient === null || id === null) return false;

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId: id });

    await deviceClient.setPushToken(token.data);

    return true;
  } catch {
    // Expo's servers are a network call away, and this may be running on a
    // pavement. The next launch tries again.
    return false;
  }
}

/**
 * Asks for the permission if it has not been asked for, then registers.
 *
 * Called when a resident marks their first event — which is the moment the
 * permission makes sense to them — and from Settings.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushAvailable()) return 'unsupported';

  try {
    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();

    if (!permission.granted) return permission.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unsupported';
  }

  return (await registerToken()) ? 'granted' : 'unsupported';
}

/** Stops the reminders, by taking the address away from the API. */
export async function disablePush(): Promise<void> {
  if (deviceClient === null) return;

  try {
    await deviceClient.setPushToken(null);
  } catch {
    // Nothing useful to do; the job deletes a token Expo rejects anyway.
  }
}

/**
 * Sends the token again if the neighbour already said yes.
 *
 * On every launch, because a push token is not for ever: it changes when the app
 * is reinstalled or restored onto a new phone, and a stale one is a reminder
 * nobody gets.
 */
export async function refreshPushToken(): Promise<void> {
  if ((await pushState()) !== 'granted') return;

  await registerToken();
}
