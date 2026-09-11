import { createSeedDataSource, type DataSource } from '@agora/data';

/**
 * The single data source for the app.
 *
 * Phase 0 reads the seed files. When the real backend lands in phase 2, this
 * module is the only place that changes: every screen already depends on the
 * `DataSource` interface rather than on where the data comes from.
 */
export const dataSource: DataSource = createSeedDataSource();
