import { pikkuState } from '../pikku-state.js'

/**
 * Base class for custom errors.
 * @extends {Error}
 */
export class PikkuError extends Error {
  /**
   * Creates an instance of PikkuError.
   * @param message - The error message.
   */
  constructor(message: string = 'An error occurred') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = new.target.name
  }
}

/**
 * Whether an error is a deliberate, expected failure rather than an uncaught
 * bug. A `PikkuError` always counts; so does any error carrying `expected:
 * true` — used to keep the marker alive when an error is serialized across a
 * workflow step boundary and rehydrated as a plain `Error`. Callers log the
 * message alone for expected errors and the full stack for everything else.
 */
export const isExpectedError = (error: unknown): boolean =>
  error instanceof PikkuError || (error as any)?.expected === true

/**
 * Interface for error details.
 */
export interface ErrorDetails {
  status: number
  message: string
  mcpCode?: number
}

/**
 * Adds an error to the API errors map.
 * @param error - The error to add.
 * @param details - The details of the error.
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

/**
 * Adds multiple errors to the API errors map.
 * @param errors - An array of errors and their details.
 */
export const addErrors = (
  errors: Array<[error: any, details: ErrorDetails]>
) => {
  errors.forEach((error) => {
    addError(error[0], error[1])
  })
}

/**
 * Retrieves the error response for a given error.
 * @param error - The error to get the response for.
 * @returns An object containing the status and message, or undefined if the error is not found.
 */
export const getErrorResponse = (
  error: Error
): { status: number; message: string; mcpCode?: number } | undefined => {
  const errors = Array.from(pikkuState(null, 'misc', 'errors').entries())
  const foundError = errors.find(([e]) => e.name === error.constructor.name)
  if (foundError) {
    return foundError[1]
  }
  return pikkuState(null, 'misc', 'errors').get(error)
}
