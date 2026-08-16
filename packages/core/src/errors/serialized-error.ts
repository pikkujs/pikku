export interface SerializedError {
  message: string
  stack?: string
  code?: string
  // Set for a deliberate PikkuError; survives step-boundary rehydration so
  // the workflow runner logs the message alone rather than a stack trace.
  expected?: boolean
  [key: string]: any
}
