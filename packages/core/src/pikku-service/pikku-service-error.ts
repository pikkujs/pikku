export type PikkuServiceErrorKind =
  | 'duplicate-name'
  | 'duplicate-provider'
  | 'unsatisfied-need'
  | 'cycle'
  | 'factory-failed'
  | 'start-failed'

export class PikkuServiceError extends Error {
  constructor(
    public readonly kind: PikkuServiceErrorKind,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'PikkuServiceError'
  }
}
