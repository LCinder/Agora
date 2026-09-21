import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How much room the floating tab bar needs under a screen's content.
 *
 * The bar is `position: absolute`, which is what lets the calendar run under it
 * — the design wants it to read as a control and not as a wall. The price is
 * that it covers whatever is at the bottom of every tab, and a list whose last
 * item sits behind it looks like a list that will not scroll. That is exactly
 * how it was reported: "Mis eventos no es scrolleable". It scrolled; the last
 * event was under the bar with nowhere further to go.
 *
 * The numbers live here rather than in each screen because the bar's geometry is
 * set in `(tabs)/_layout.tsx` and a screen that guesses it drifts the first time
 * the bar changes height. Both read these.
 */

/** The bar itself. */
export const TAB_BAR_HEIGHT = 64;

/** Spacing steps between the bar and the bottom safe area. */
export const TAB_BAR_GAP_STEPS = 2;

/** Steps of air between the last item and the bar, so it is not read as cut off. */
const BREATHING_STEPS = 4;

/**
 * The bottom padding a scrolling tab screen should use.
 *
 * `spacing` is passed in rather than imported so this stays a plain function of
 * the theme in use, which is what the screens already hold.
 */
export function useTabBarClearance(spacing: (steps: number) => number): number {
  const insets = useSafeAreaInsets();

  return TAB_BAR_HEIGHT + spacing(TAB_BAR_GAP_STEPS + BREATHING_STEPS) + insets.bottom;
}
