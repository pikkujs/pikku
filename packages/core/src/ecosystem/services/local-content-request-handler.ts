export {
  createLocalContentRequestHandler,
  verifySignedContentRequest,
} from '../../services/local-content-request-handler.js'
export type { LocalContentRequestHandler } from '../../services/local-content-request-handler.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { JWTService } from '../../services/jwt-service.js'
export type {
  LocalContentRequestHandlerOptions,
  SignedContentVerification,
} from '../../services/local-content-request-handler.js'
