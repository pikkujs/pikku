import { pikkuState } from '../pikku-state.js'

export class PikkuError extends Error {
  constructor(message: string = 'An error occurred') {
    super(message)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = declaredErrorNames.get(new.target) ?? new.target.name
  }
}

/**
 * Wire names, keyed by the class they belong to.
 *
 * Deliberately a module-level map rather than pikku state: an error class is
 * registered by module-import side effect, which never re-runs, so its name
 * has to outlive a state reset the same way the error registry itself is made
 * to.
 */
const declaredErrorNames = new WeakMap<Function, string>()

/**
 * Declare the wire name of one or more error classes, as string literals a
 * minifier cannot rewrite.
 *
 * `new.target.name` is the constructor *identifier*, and a deploy bundle
 * renames it: `PermissionDeniedError` ships as `cn`, `NotFoundError` as `Qc`.
 * But `error.name` is part of the wire contract — it is the field a client
 * switches on to tell *you may not* from *it is not there* — so it cannot
 * depend on whether the bundler happened to be told to keep names.
 *
 * Passing the classes in shorthand keeps each name in exactly one place: the
 * object key is a string literal and survives minification, while the value is
 * free to be renamed.
 *
 * @example declareErrorNames({ NotFoundError, ForbiddenError })
 */
export const declareErrorNames = (
  errors: Record<string, PikkuErrorConstructor>
): void => {
  for (const [name, error] of Object.entries(errors)) {
    declaredErrorNames.set(error, name)
  }
}

/** The declared wire name of an error class, if it has one. */
export const getDeclaredErrorName = (error: Function): string | undefined =>
  declaredErrorNames.get(error)

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
