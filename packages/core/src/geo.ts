/**
 * Geographic helpers.
 *
 * Used to answer one question: which municipality is this neighbour standing
 * in? The answer is computed on the device and thrown away. The location of a
 * resident is never stored or transmitted; see docs/decisiones.md, D-008.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

/**
 * How far a device may be from a town centre and still be offered it.
 *
 * Generous enough to cover a municipality and its outskirts, tight enough that
 * someone in Madrid is never asked whether they are in La Zubia. Suggesting
 * the wrong town is worse than suggesting none: the neighbour then has to
 * notice and undo it.
 */
export const NEAREST_MUNICIPALITY_RADIUS_KM = 12;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance in kilometres. */
export function distanceInKm(from: Coordinates, to: Coordinates): number {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) *
      Math.cos(toRadians(to.latitude)) *
      Math.sin(deltaLon / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * The closest candidate within the radius, or null when the device is nowhere
 * near a municipality the platform serves.
 */
export function findNearest<T extends Coordinates>(
  point: Coordinates,
  candidates: readonly T[],
  radiusKm: number = NEAREST_MUNICIPALITY_RADIUS_KM,
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = distanceInKm(point, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return bestDistance <= radiusKm ? best : null;
}
