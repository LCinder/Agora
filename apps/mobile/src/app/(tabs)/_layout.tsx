import { readableOn } from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useApp } from '../../providers/app-provider';

export default function TabsLayout() {
  const { t, theme } = useApp();

  // The town's colour is where the branding lives in this design, but a dark
  // green on a dark bar is 2.4:1. Lift it until the label is legible.
  const active = readableOn(theme.colors.primary, theme.colors.surface);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('calendar.tab'),
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="my-events"
        options={{
          title: t('myEvents.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings.title'),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
