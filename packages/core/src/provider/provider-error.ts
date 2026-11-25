export type ProviderErrorKind =
  | 'duplicate-name'
  | 'duplicate-provider'
  | 'unsatisfied-need'
  | 'cycle'
  | 'optional-key-needed'
  | 'entry-owned'
  | 'undeclared-read'
  | 'undeclared-return'
  | 'missing-return'
  | 'env-denied'
  | 'factory-failed'
  | 'start-failed'

export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'ProviderError'
  }
}
