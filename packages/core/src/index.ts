/**
 * Shared domain model, validation schemas and pure business logic.
 *
 * Everything in this package stays framework-free: no React, no Expo, no
 * Next.js. Both the mobile app and the web panel depend on it, and so will the
 * backend when it arrives in phase 2.
 */

export * from './category';
export * from './event';
export * from './filters';
export * from './grouping';
export * from './live-session';
export * from './municipality';
export * from './organization';
export * from './time';
