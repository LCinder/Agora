import { describe, expect, it } from 'vitest';

import { distanceInKm, findNearest } from './geo';

const LA_ZUBIA = { id: 'la-zubia', latitude: 37.12056, longitude: -3.585 };
const OGIJARES = { id: 'ogijares', latitude: 37.1272, longitude: -3.6167 };
const CAJAR = { id: 'cajar', latitude: 37.1289, longitude: -3.5872 };
const OTURA = { id: 'otura', latitude: 37.0869, longitude: -3.6403 };
const TOWNS = [LA_ZUBIA, OGIJARES, CAJAR, OTURA];

describe('distanceInKm', () => {
  it('is zero for the same point', () => {
    expect(distanceInKm(LA_ZUBIA, LA_ZUBIA)).toBeCloseTo(0, 6);
  });

  it('measures neighbouring towns in single kilometres', () => {
    const distance = distanceInKm(LA_ZUBIA, OGIJARES);

    expect(distance).toBeGreaterThan(2);
    expect(distance).toBeLessThan(5);
  });

  it('measures Madrid as hundreds of kilometres away', () => {
    const madrid = { latitude: 40.4168, longitude: -3.7038 };

    expect(distanceInKm(LA_ZUBIA, madrid)).toBeGreaterThan(350);
  });
});

describe('findNearest', () => {
  it('picks the town the device is standing in', () => {
    const inLaZubia = { latitude: 37.1198, longitude: -3.5861 };

    expect(findNearest(inLaZubia, TOWNS)?.id).toBe('la-zubia');
  });

  it('tells neighbouring towns apart', () => {
    const inOtura = { latitude: 37.0875, longitude: -3.6395 };

    expect(findNearest(inOtura, TOWNS)?.id).toBe('otura');
  });

  it('suggests nothing when the device is far from every town', () => {
    const madrid = { latitude: 40.4168, longitude: -3.7038 };

    expect(findNearest(madrid, TOWNS)).toBeNull();
  });

  it('suggests nothing for an empty platform', () => {
    expect(findNearest(LA_ZUBIA, [])).toBeNull();
  });

  it('honours a custom radius', () => {
    const sevenKmAway = { latitude: 37.184, longitude: -3.585 };

    expect(findNearest(sevenKmAway, TOWNS, 12)?.id).toBe('cajar');
    expect(findNearest(sevenKmAway, TOWNS, 3)).toBeNull();
  });
});
