/**
 * Colour arithmetic.
 *
 * Two things force this to be computed rather than tabulated. Every
 * municipality brings its own brand colour and its own categories, so no list
 * of hand-picked pairs can cover them; and the product is sold to public
 * administrations, where RD 1112/2018 asks for WCAG 2.1 AA — a category colour
 * that reads beautifully on paper and vanishes on a dark screen is a defect,
 * not a taste.
 */

/** WCAG AA for body text. Large text may go to 3, but nothing here assumes it. */
export const AA_CONTRAST = 4.5;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function parse(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;

  return {
    r: Number.parseInt(full.slice(0, 2), 16) / 255,
    g: Number.parseInt(full.slice(2, 4), 16) / 255,
    b: Number.parseInt(full.slice(4, 6), 16) / 255,
  };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0');

  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** Relative luminance, per the WCAG definition. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = parse(hex);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);

  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Black or white, whichever reads better on `background`. */
export function readableTextOn(background: string): string {
  return contrastRatio('#1A1A17', background) >= contrastRatio('#FFFFFF', background)
    ? '#1A1A17'
    : '#FFFFFF';
}

function toHsl(hex: string): Hsl {
  const { r, g, b } = parse(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l };

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;

  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  return { h: (h * 60 + 360) % 360, s, l };
}

function fromHsl({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];

  return toHex({ r: r + m, g: g + m, b: b + m });
}

/**
 * The same colour, lighter or darker, with its hue and saturation kept.
 *
 * `delta` is in lightness, -1 to 1.
 */
export function shiftLightness(hex: string, delta: number): string {
  const { h, s, l } = toHsl(hex);
  return fromHsl({ h, s, l: Math.min(1, Math.max(0, l + delta)) });
}

/**
 * The nearest version of `color` that is legible on `background`.
 *
 * Walks the lightness away from the background until the contrast clears
 * `minimum`, so a category keeps its hue on both themes instead of being
 * replaced by a second, hand-picked colour that then has to be maintained.
 * Returns black or white only if the hue itself can never get there.
 */
export function readableOn(color: string, background: string, minimum = AA_CONTRAST): string {
  if (contrastRatio(color, background) >= minimum) return color;

  const towardsLight = relativeLuminance(background) < 0.5;
  const step = towardsLight ? 0.02 : -0.02;
  const { l } = toHsl(color);

  const steps = Math.ceil((towardsLight ? 1 - l : l) / Math.abs(step));

  for (let i = 1; i <= steps; i++) {
    const candidate = shiftLightness(color, step * i);
    if (contrastRatio(candidate, background) >= minimum) return candidate;
  }

  return readableTextOn(background);
}

/** The lightest this hue can get while white text still clears AA on it. */
function whiteCeiling(hex: string): number {
  const { h, s } = toHsl(hex);
  let ceiling = 0.08;

  for (let l = 0.08; l <= 0.92; l += 0.01) {
    if (contrastRatio('#FFFFFF', fromHsl({ h, s, l })) >= AA_CONTRAST) ceiling = l;
  }

  return ceiling;
}

/** How far the banded cover spreads its tones, in lightness. */
const TONE_SPREAD = 0.22;

/**
 * `count` tones of one colour, darkest first.
 *
 * For the banded cover: one hue, several steps, so a band of colour still
 * names its category. The ramp hangs from the lightest tone that white can
 * still be read on rather than from the colour's own lightness, so the title
 * sitting across the bands is legible whatever hue the municipality picked.
 */
export function tones(hex: string, count: number): string[] {
  if (count <= 1) return [hex];

  const { h, s } = toHsl(hex);
  const ceiling = whiteCeiling(hex);
  const floor = Math.max(0.06, ceiling - TONE_SPREAD);
  const stride = (ceiling - floor) / (count - 1);

  return Array.from({ length: count }, (_, i) => fromHsl({ h, s, l: floor + stride * i }));
}
