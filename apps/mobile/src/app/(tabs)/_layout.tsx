import { readableOn } from '@agora/core';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TAB_BAR_GAP_STEPS, TAB_BAR_HEIGHT } from '../../components/tab-bar';
import { useApp } from '../../providers/app-provider';
import { FONTS } from '../../theme/theme';

export default function TabsLayout() {
  const { t, theme } = useApp();
  const insets = useSafeAreaInsets();

  // The town's colour is where the branding lives in this design, but a dark
  // green on a dark bar is 2.4:1. Lift it until the label is legible.
  const active = readableOn(theme.colors.primary, theme.colors.surface);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: active,
        tabBarInactiveTintColor: theme.colors.textMuted,
        // Floating rather than welded to the bottom edge: the content runs
        // under it, which gives the screen room to breathe and makes the bar
        // read as a control instead of a wall. The shape is the app's own
        // `lg` radius, not a pill — this design speaks in posters, and a
        // poster is a rectangle.
        tabBarStyle: [
          theme.elevation,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
            borderTopColor: theme.colors.border,
            borderWidth: 1,
            bottom: insets.bottom + theme.spacing(TAB_BAR_GAP_STEPS),
            height: TAB_BAR_HEIGHT,
            left: theme.spacing(5),
            paddingBottom: 0,
            position: 'absolute',
            right: theme.spacing(5),
          },
        ],
        tabBarItemStyle: { height: TAB_BAR_HEIGHT - 2 },
        tabBarLabelStyle: { fontFamily: FONTS.semibold, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('calendar.tab'),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="my-events"
        options={{
          title: t('myEvents.title'),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? 'heart' : 'heart-outline'} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings.title'),
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
