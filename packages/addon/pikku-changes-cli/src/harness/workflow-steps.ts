import { HarnessInfraError, type InfraKind } from './finding.js'
import type { HarnessSteps } from './steps.js'

/**
 * The part of a workflow wire the harness needs: `workflow.do(name, fn, options)` with an inline
 * function. A recorded step returns its stored result instead of running `fn` again.
 */
export type WorkflowDo = {
  do: <T>(
    name: string,
    fn: () => Promise<T>,
    options: { retries: number }
  ) => Promise<T>
}

/** What a thrown error is stored as. */
export type RecordedError = {
  name: string
  message: string
  kind?: InfraKind
  output?: string
  exitCode?: number
}

/** A step's stored outcome: its value, or the error it threw. */
export type RecordedStep =
  { ok: true; value?: unknown } | { ok: false; error: RecordedError }

const isPlainObject = (value: object) => {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** Throws unless `value` comes back from JSON exactly as it is (no Map, class, undefined in arrays…). */
export const assertJson = (value: unknown, path = 'result'): void => {
  if (value === null) return
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return
    case 'number':
      if (Number.isFinite(value)) return
      break
    case 'object':
      if (Array.isArray(value)) {
        value.forEach((item, i) => {
          if (item === undefined)
            throw new TypeError(`${path}[${i}] is undefined`)
          assertJson(item, `${path}[${i}]`)
        })
        return
      }
      if (isPlainObject(value)) {
        for (const [key, item] of Object.entries(value))
          if (item !== undefined) assertJson(item, `${path}.${key}`)
        return
      }
      break
  }
  throw new TypeError(
    `${path} is not plain JSON (${typeof value === 'object' ? (value as object).constructor?.name : typeof value})`
  )
}

const recordError = (error: unknown): RecordedError => {
  if (error instanceof HarnessInfraError)
    return {
      name: error.name,
      message: error.message,
      kind: error.kind,
      ...(error.output === undefined ? {} : { output: error.output }),
      ...(error.exitCode === undefined ? {} : { exitCode: error.exitCode }),
    }
  if (error instanceof Error)
    return { name: error.name, message: error.message }
  return { name: 'Error', message: String(error) }
}

const restoreError = (recorded: RecordedError): Error => {
  if (recorded.kind !== undefined)
    return new HarnessInfraError(recorded.kind, recorded.message, {
      output: recorded.output,
      exitCode: recorded.exitCode,
    })
  const error = new Error(recorded.message)
  error.name = recorded.name
  return error
}

/**
 * Runs each harness step as one workflow step. The engine does its own retrying, so every step is
 * given `retries: 0`. What the step throws is stored as its result and thrown again on replay, so
 * a step that failed is never run a second time; a HarnessInfraError comes back with its kind.
 */
export const workflowSteps = (workflow: WorkflowDo): HarnessSteps => ({
  step: async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    const recorded = await workflow.do<RecordedStep>(
      name,
      async () => {
        try {
          const value = await fn()
          if (value !== undefined) assertJson(value)
          return value === undefined ? { ok: true } : { ok: true, value }
        } catch (error) {
          return { ok: false, error: recordError(error) }
        }
      },
      { retries: 0 }
    )
    if (!recorded.ok) throw restoreError(recorded.error)
    return recorded.value as T
  },
})
