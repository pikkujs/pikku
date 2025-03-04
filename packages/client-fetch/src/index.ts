/**
 * This module provides a wrapper around the Fetch API that integrates with the Pikku framework.
 * It includes utilities for making HTTP requests, such as options for authorization, server URL management,
 * and transforming dates in responses, while ensuring requests are validated against Pikku routes.
 * The module exports the `CorePikkuFetch` class, as well as other supporting types and functions.
 *
 * @module @pikku/fetch
 */

export {
  CorePikkuFetch,
  CorePikkuFetchOptions,
  HTTPMethod,
} from './core-pikku-fetch.js'
export { corePikkuFetch } from './pikku-fetch.js'
