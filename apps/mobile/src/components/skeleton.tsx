import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useApp } from '../providers/app-provider';

/**
 * The shape of what is coming, while it comes.
 *
 * A spinner tells a neighbour that something is happening; a skeleton tells
 * them what is about to appear, and the screen does not jump when it does.
 * The blocks deliberately match the calendar's real rhythm — one large cover,
 * then stamps and lines — so the arrival is a fill, not a redraw.
 */

const PULSE_MS = 900;

function Pulse({ children }: { children: React.ReactNode }) {
  const progress = useSharedValue(0.45);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: PULSE_MS }), -1, true);
  }, [progress]);

  const style = useAnimatedStyle(() => ({ opacity: progress.value }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function Block({
  width,
  height,
  radius,
}: {
  width: DimensionValue;
  height: number;
  radius?: number;
}) {
  const { theme } = useApp();

  return (
    <View
      style={{
        backgroundColor: theme.colors.surfaceMuted,
        borderRadius: radius ?? theme.radius.sm,
        height,
        width,
      }}
    />
  );
}

function Row() {
  const { theme } = useApp();

  return (
    <View style={[styles.row, { gap: theme.spacing(4) }]}>
      <Block width={92} height={92} radius={theme.radius.md} />
      <View style={{ flex: 1, gap: theme.spacing(2) }}>
        <Block width="34%" height={11} />
        <Block width="88%" height={17} />
        <Block width="62%" height={14} />
      </View>
    </View>
  );
}

export function CalendarSkeleton() {
  const { theme } = useApp();

  return (
    <Pulse>
      <View
        accessibilityRole="progressbar"
        style={{ gap: theme.spacing(5), paddingHorizontal: theme.spacing(5) }}
      >
        <Block width="18%" height={11} />
        <Block width="100%" height={264} radius={theme.radius.lg} />
        <Row />
        <Row />
        <Row />
      </View>
    </Pulse>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row' },
});
