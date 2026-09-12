import { describe, expect, it } from 'vitest';

import {
  AA_CONTRAST,
  contrastRatio,
  readableOn,
  readableTextOn,
  relativeLuminance,
  shiftLightness,
  tones,
} from './color';

/** The six shared categories, plus the two La Zubia defines for itself. */
const CATEGORY_COLOURS = [
  '#C2410C',
  '#6D28D9',
  '#047857',
  '#0369A1',
  '#A16207',
  '#7C2D12',
  '#581C87',
  '#B45309',
];

const DARK = '#121211';
const LIGHT = '#F5F3EE';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#6D28D9', '#6D28D9')).toBeCloseTo(1, 5);
  });

  it('does not care which way round the pair is given', () => {
    expect(contrastRatio('#121211', '#F5F3EE')).toBeCloseTo(contrastRatio('#F5F3EE', '#121211'), 5);
  });

  it('reads three-digit hex the same as six', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#FFFFFF'), 5);
  });
});

describe('readableTextOn', () => {
  it('picks white on a dark ground and ink on a light one', () => {
    expect(readableTextOn('#121211')).toBe('#FFFFFF');
    expect(readableTextOn('#F5F3EE')).toBe('#1A1A17');
  });
});

describe('shiftLightness', () => {
  it('keeps the hue while changing the lightness', () => {
    const lighter = shiftLightness('#6D28D9', 0.2);

    expect(relativeLuminance(lighter)).toBeGreaterThan(relativeLuminance('#6D28D9'));
    expect(lighter).not.toBe('#FFFFFF');
  });

  it('clamps instead of wrapping round', () => {
    expect(relativeLuminance(shiftLightness('#FFFFFF', 0.5))).toBeCloseTo(1, 3);
    expect(relativeLuminance(shiftLightness('#000000', -0.5))).toBeCloseTo(0, 3);
  });
});

describe('readableOn', () => {
  it('leaves a colour alone when it already clears the threshold', () => {
    expect(readableOn('#F4F3F0', DARK)).toBe('#F4F3F0');
  });

  it('lifts every category colour to AA on the dark theme', () => {
    for (const colour of CATEGORY_COLOURS) {
      expect(contrastRatio(readableOn(colour, DARK), DARK)).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });

  it('darkens every category colour to AA on the light theme', () => {
    for (const colour of CATEGORY_COLOURS) {
      expect(contrastRatio(readableOn(colour, LIGHT), LIGHT)).toBeGreaterThanOrEqual(AA_CONTRAST);
    }
  });

  it('moves the colour no further than it has to', () => {
    // Cultura on the dark theme: lifted, but still recognisably violet rather
    // than washed out to white.
    const lifted = readableOn('#6D28D9', DARK);

    expect(contrastRatio(lifted, DARK)).toBeGreaterThanOrEqual(AA_CONTRAST);
    expect(contrastRatio(lifted, DARK)).toBeLessThan(AA_CONTRAST + 3);
    expect(lifted).not.toBe('#FFFFFF');
  });

  it('honours a stricter threshold when asked', () => {
    expect(contrastRatio(readableOn('#047857', DARK, 7), DARK)).toBeGreaterThanOrEqual(7);
  });

  it('finds a legible tone even when the colour is the background', () => {
    // A grey darkened out of white does clear 4.5:1 against white, so this
    // returns one rather than giving up and going black.
    const fixed = readableOn('#FFFFFF', '#FFFFFF');

    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(AA_CONTRAST);
  });
});

describe('tones', () => {
  it('returns the colour itself when one tone is asked for', () => {
    expect(tones('#047857', 1)).toEqual(['#047857']);
  });

  it('returns as many tones as asked, darkest first', () => {
    const bands = tones('#047857', 4);

    expect(bands).toHaveLength(4);
    for (let i = 1; i < bands.length; i++) {
      expect(relativeLuminance(bands[i]!)).toBeGreaterThan(relativeLuminance(bands[i - 1]!));
    }
  });

  it('keeps every tone dark enough for white to sit on it', () => {
    for (const colour of CATEGORY_COLOURS) {
      for (const tone of tones(colour, 4)) {
        expect(contrastRatio('#FFFFFF', tone)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
