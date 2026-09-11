import { readableTextOn } from '@agora/core';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '../providers/app-provider';
import { FONTS } from '../theme/theme';

/**
 * The small set of primitives every screen is built from.
 *
 * Kept blunt on purpose. The demo needs a handful of consistent pieces with
 * readable contrast and large touch targets, not a design system.
 */

export function Screen({
  children,
  edges = ['top', 'left', 'right'],
}: {
  children: ReactNode;
  edges?: readonly Edge[];
}) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.colors.background }]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

export function ScreenScroll({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={{ paddingBottom: theme.spacing(10) }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

type TextTone = 'default' | 'muted' | 'primary' | 'danger';

function toneColor(tone: TextTone, theme: ReturnType<typeof useTheme>): string {
  switch (tone) {
    case 'muted':
      return theme.colors.textMuted;
    case 'primary':
      return theme.colors.primary;
    case 'danger':
      return theme.colors.danger;
    default:
      return theme.colors.text;
  }
}

interface TypeProps {
  children: ReactNode;
  tone?: TextTone;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function Display({ children, tone = 'default', style }: TypeProps) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          color: toneColor(tone, theme),
          fontFamily: FONTS.black,
          fontSize: theme.fontSize.display,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Title({ children, tone = 'default', style, numberOfLines }: TypeProps) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { color: toneColor(tone, theme), fontFamily: FONTS.bold, fontSize: theme.fontSize.title },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Subtitle({ children, tone = 'default', style, numberOfLines }: TypeProps) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color: toneColor(tone, theme),
          fontFamily: FONTS.semibold,
          fontSize: theme.fontSize.subtitle,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, tone = 'default', style, numberOfLines }: TypeProps) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color: toneColor(tone, theme),
          fontFamily: FONTS.regular,
          fontSize: theme.fontSize.body,
          lineHeight: 24,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Caption({ children, tone = 'muted', style, numberOfLines }: TypeProps) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          color: toneColor(tone, theme),
          fontFamily: FONTS.regular,
          fontSize: theme.fontSize.caption,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const content = (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          padding: theme.spacing(4),
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}
    >
      {content}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        {
          alignItems: 'center',
          backgroundColor: isPrimary ? theme.colors.primary : theme.colors.surface,
          borderColor: isPrimary ? theme.colors.primary : theme.colors.border,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          justifyContent: 'center',
          minHeight: theme.touchTarget,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          paddingHorizontal: theme.spacing(5),
        },
        style,
      ]}
    >
      <Text
        style={{
          color: isPrimary ? theme.colors.onPrimary : theme.colors.text,
          fontSize: theme.fontSize.body,
          fontFamily: FONTS.semibold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) {
  const theme = useTheme();
  // A selected filter reverses out of the ground rather than taking the town's
  // colour: on this design the colour belongs to the event covers, and a row of
  // brand-coloured pills fights every poster under it.
  const accent = color ?? theme.colors.contrast;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        backgroundColor: selected ? accent : 'transparent',
        borderColor: selected ? accent : theme.colors.border,
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        justifyContent: 'center',
        minHeight: 40,
        opacity: pressed ? 0.85 : 1,
        paddingHorizontal: theme.spacing(4),
      })}
    >
      <Text
        style={{
          color: selected ? readableTextOn(accent) : theme.colors.textMuted,
          fontSize: theme.fontSize.caption,
          fontFamily: selected ? FONTS.bold : FONTS.semibold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  const theme = useTheme();

  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: color,
        borderRadius: theme.radius.sm,
        paddingHorizontal: theme.spacing(2),
        paddingVertical: theme.spacing(1),
      }}
    >
      <Text style={{ color: '#FFFFFF', fontFamily: FONTS.bold, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.flex, styles.centred, { gap: theme.spacing(3) }]}>
      <ActivityIndicator color={theme.colors.primary} />
      <Caption>{label}</Caption>
    </View>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.centred, { gap: theme.spacing(2), padding: theme.spacing(8) }]}>
      <Body tone="muted" style={styles.centredText}>
        {title}
      </Body>
      {hint ? (
        <Caption tone="muted" style={styles.centredText}>
          {hint}
        </Caption>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centred: { alignItems: 'center', justifyContent: 'center' },
  centredText: { textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
