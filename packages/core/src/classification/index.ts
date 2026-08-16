/**
 * What a value is, and how it must be handled: the classification brands a
 * column carries, the stored forms those brands map to, and the wrapper that
 * keeps a secret out of a log.
 *
 * These arrived as three entry points — one for the types, one for the
 * runtime helpers, one for `SecretValue` — which is the same subject behind
 * three doors, split by whether a name happens to be a type or a value.
 */
export type {
  Private,
  Pii,
  Secret,
  Classification,
  AnonymizeStrategy,
  ColumnForm,
  WrappedValue,
  SealedValue,
  HashedValue,
  ColumnClassification,
  ClassificationManifest,
} from './data-classification.js'

export {
  hashToken,
  unsafeAsWrapped,
  unsafeAsSealed,
  unsafeAsHashed,
} from './column-form.js'

export {
  REDACTED,
  SecretCoercionError,
  SecretValue,
  createSecretValue,
  isSecretValue,
} from './secret-value.js'
export type { Safe } from './secret-value.js'
