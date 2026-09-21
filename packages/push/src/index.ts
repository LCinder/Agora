/**
 * Push notifications, with no framework attached.
 *
 * Its own package for the same reason as the poster's: the notification job in
 * the cloud and any local script that has to send a test message use the same
 * code, and neither of them reads the environment to get it.
 */

export * from './expo-push';
