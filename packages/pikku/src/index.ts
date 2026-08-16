/**
 * The service set this package bundles. `@pikku/core` is a dependency rather
 * than a re-export: it publishes one entry point per area, and flattening them
 * back into a single barrel here is what the split exists to prevent. Reach for
 * the area you need — `@pikku/core/types`, `@pikku/core/http`, `@pikku/core/services`.
 */
export * from '@pikku/schema-ajv'
export * from '@pikku/jose'
