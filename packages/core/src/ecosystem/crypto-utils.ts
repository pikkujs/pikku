export {
  deriveKEK,
  envelopeDecrypt,
  envelopeEncrypt,
  envelopeRewrap,
  generateKEKSalt,
} from '../crypto-utils.js'
export type { EnvelopeEncryptResult } from '../crypto-utils.js'

/**
 * Types the exports above mention but do not themselves export. Without
 * them a consumer's declaration emit has no name for the type it infers,
 * and fails with TS2883 rather than reaching for the original entry point.
 */
export type { WrappedValue } from '../data-classification.js'
