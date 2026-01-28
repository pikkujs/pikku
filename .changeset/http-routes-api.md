---
'@pikku/core': minor
'@pikku/cli': minor
'@pikku/inspector': minor
'@pikku/next': patch
---

Add wireHTTPRoutes API for grouping HTTP routes

**@pikku/core:**

- Added `wireHTTPRoutes` for defining groups of HTTP routes with shared configuration
- Routes can inherit `basePath`, `tags`, and `auth` settings from their group
- Supports nested route contracts via `defineHTTPRoutes` for reusable route definitions
- Added `groupBasePath` to route metadata for tracking inherited paths
- Added `getSchemaKeys()` to `SchemaService` interface for runtime schema property extraction

**@pikku/inspector:**

- Added `add-http-routes.ts` to process `wireHTTPRoutes` calls
- Extracts and merges group configuration (basePath, tags, auth) with individual routes
- Resolves route contracts from `defineHTTPRoutes` variables
- Refactored shared route registration logic into `registerHTTPRoute` function
- Renamed `zodLookup` to `schemaLookup` with vendor detection for Standard Schema support

**@pikku/cli:**

- Updated serialization to include `groupBasePath` in HTTP metadata

**@pikku/next:**

- Return `null` instead of throwing when reading headers/cookies in static context
- Allows auth middleware to gracefully skip during Next.js static page generation
