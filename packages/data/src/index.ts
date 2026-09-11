/**
 * Data access layer.
 *
 * The rest of the codebase never talks to a storage backend directly: it only
 * depends on the `DataSource` interface defined here. Phase 0 ships a single
 * implementation that reads the seed files under `content/municipalities/`;
 * swapping it for a real backend in phase 2 must not require UI changes.
 *
 * See docs/decisiones.md, D-001.
 */

export const DATA_PACKAGE_NAME = '@agora/data';
