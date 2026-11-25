export type ProviderErrorKind =
  | 'duplicate-name'
  | 'duplicate-provider'
  | 'unsatisfied-need'
  | 'cycle'
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
