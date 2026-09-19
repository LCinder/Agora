/**
 * Data access layer.
 *
 * The rest of the codebase never talks to a storage backend directly: it only
 * depends on the `DataSource` interface defined here. Phase 0 ships a single
 * implementation that reads the seed files under `content/municipalities/`;
 * swapping it for a real backend in phase 2 must not require UI changes.
 *
 * Phase 2 adds the second implementation, `createHttpDataSource`, which talks to
 * the API. The screens do not know the difference, which is what the interface was
 * for.
 *
 * See docs/decisiones.md, D-001.
 */

export * from './data-source';
export * from './http/client';
export * from './http/device-client';
export * from './http/http-data-source';
export * from './seed/seed-data-source';
export * from './seed/seed-schema';
export * from './seed/resolve';
