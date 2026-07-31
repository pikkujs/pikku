import { pikkuState } from '../pikku-state.js'

export class PikkuError extends Error {
  constructor(message: string = 'An error occurred') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = new.target.name
  }
}

/**
 * A `PikkuError`, or any error carrying `expected: true` — the marker that
 * survives serialization across a workflow step boundary and rehydration as a
 * plain `Error`. Callers log the message alone for these, the full stack for
 * everything else.
 */
export const isExpectedError = (error: unknown): boolean =>
  error instanceof PikkuError || (error as any)?.expected === true

export interface ErrorDetails {
  status: number
  message: string
  mcpCode?: number
}

export type PikkuErrorConstructor = new (...args: any[]) => Error

export const addError = (
  error: any,
  { status, message, mcpCode }: ErrorDetails
) => {
  pikkuState(null, 'misc', 'errors').set(
    error,
    mcpCode === undefined ? { status, message } : { status, message, mcpCode }
  )
}

export const addErrors = (
  errors: Array<[error: any, details: ErrorDetails]>
) => {
  errors.forEach((error) => {
    addError(error[0], error[1])
  })
}

export const getErrorResponse = (
  error: Error
): { status: number; message: string; mcpCode?: number } | undefined => {
  const errors = pikkuState(null, 'misc', 'errors')

  let ctor: unknown = (error as any)?.constructor
  while (typeof ctor === 'function' && ctor !== Object) {
    const details = errors.get(ctor as PikkuErrorConstructor)
    if (details) {
      return details
    }
    ctor = Object.getPrototypeOf(ctor)
  }

  const name = (error as any)?.constructor?.name
  return name
    ? Array.from(errors.entries()).find(([e]) => e.name === name)?.[1]
    : undefined
}
