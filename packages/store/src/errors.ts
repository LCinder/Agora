/**
 * What a store refuses, and why.
 *
 * The codes exist so the HTTP layer can map them without reading messages:
 * `forbidden` is a 403, `not_found` a 404, `conflict` a 409. The messages are in
 * Spanish because some of them end up in front of a municipal officer.
 */
export type StoreErrorCode = 'forbidden' | 'not_found' | 'conflict' | 'invalid';

export class StoreError extends Error {
  readonly code: StoreErrorCode;

  constructor(code: StoreErrorCode, message: string) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

export function forbidden(message: string): StoreError {
  return new StoreError('forbidden', message);
}

export function notFound(message: string): StoreError {
  return new StoreError('not_found', message);
}
