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
 *
 * @example snippet: isExpectedError
 */
export const isExpectedError = (error: unknown): boolean =>
  error instanceof PikkuError ||
  (error as { expected?: unknown } | null)?.expected === true

export interface ErrorDetails {
  /** The HTTP status this error answers with, instead of a 500. */
  status: number
  /** What the caller is told. It leaves the process, so it must not name anything internal. */
  message: string
  /** The JSON-RPC code an MCP client is given, where the HTTP status has no equivalent. */
  mcpCode?: number
}

export type PikkuErrorConstructor = new (...args: any[]) => Error

/**
 * Registers one of your own error classes with the HTTP status and message it
 * should produce, so throwing it maps to a real response instead of a 500.
 *
 * @example snippet: addError
 */
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

  let ctor: unknown = (error as { constructor?: unknown } | null)?.constructor
  while (typeof ctor === 'function' && ctor !== Object) {
    const details = errors.get(ctor as PikkuErrorConstructor)
    if (details) {
      return details
    }
    ctor = Object.getPrototypeOf(ctor)
  }

  const name = (error as { constructor?: { name?: string } } | null)
    ?.constructor?.name
  return name
    ? Array.from(errors.entries()).find(([e]) => e.name === name)?.[1]
    : undefined
}
