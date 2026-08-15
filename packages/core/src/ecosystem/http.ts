export { fetch, fetchData, wireHTTP } from '../wirings/http/http-runner.js'
export type {
  AssertHTTPWiringParams,
  CoreHTTPFunctionWiring,
  HTTPMethod,
  HTTPRouteBaseConfig,
  HTTPWiringsMeta,
  PikkuHTTP,
  PikkuHTTPResponse,
  PikkuQuery,
  RunHTTPWiringOptions,
} from '../wirings/http/http.types.js'
export { logRoutes } from '../wirings/http/log-http-routes.js'
export {
  DEFAULT_MAX_BODY_SIZE,
  PikkuFetchHTTPRequest,
} from '../wirings/http/pikku-fetch-http-request.js'
export { PikkuFetchHTTPResponse } from '../wirings/http/pikku-fetch-http-response.js'
export { toWebRequest } from '../wirings/http/web-request.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { Logger } from '../services/logger.js'
export type { PikkuHTTPRequest } from '../wirings/http/http.types.js'
