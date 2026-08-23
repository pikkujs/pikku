export interface SerializedError {
  /** What went wrong, carried across a boundary that cannot carry an Error. */
  message: string
  /** Present only where the failure was unexpected; a deliberate error is logged by its message alone. */
  stack?: string
  /** The error class's registered name, which is what a caller matches on rather than the message. */
  code?: string
  // Set for a deliberate PikkuError; survives step-boundary rehydration so
  // the workflow runner logs the message alone rather than a stack trace.
  expected?: boolean
  [key: string]: any
}
