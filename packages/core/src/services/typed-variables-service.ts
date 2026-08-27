import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { VariablesService } from './variables-service.js'

export interface VariableStatus {
  variableId: string
  name: string
  displayName: string
  isConfigured: boolean
  /** Whether the declaration answers for itself when the host sets nothing. */
  hasDefault: boolean
}

export type VariableMeta = {
  name: string
  displayName: string
  /**
   * The shape the variable was declared with. It is the schema itself rather
   * than a description of it, because a default is only knowable by running it:
   * `undefined` goes in and, if the declaration carries one, the default comes
   * back out.
   *
   * A thunk is accepted, and is what code generation emits. The generated file
   * and the file declaring the schema import each other, so reading the schema
   * while the modules are still initializing throws — deferring the read until
   * a variable is actually asked for is what keeps the cycle harmless.
   */
  schema?: StandardSchemaV1 | (() => StandardSchemaV1)
}

const isPromise = (value: unknown): value is Promise<unknown> =>
  typeof (value as Promise<unknown> | undefined)?.then === 'function'

/**
 * A declared default is the answer to a variable nobody set, so it is resolved
 * here rather than in `VariablesService`: the store knows what a host has put
 * in it, and only this layer knows what was declared.
 */
export class TypedVariablesService<
  TMap = Record<string, unknown>,
> implements VariablesService {
  constructor(
    private variables: VariablesService,
    private variablesMeta: Record<string, VariableMeta>
  ) {}

  get<K extends keyof TMap & string>(
    name: K
  ): Promise<TMap[K] | undefined> | TMap[K] | undefined
  get<T = string>(name: string): Promise<T | undefined> | T | undefined
  get(name: string): Promise<unknown> | unknown {
    const stored = this.variables.get(name)
    if (isPromise(stored)) {
      return stored.then((value) =>
        value === undefined ? this.resolveDefault(name) : value
      )
    }
    return stored === undefined ? this.resolveDefault(name) : stored
  }

  getVariables<T extends Record<string, unknown> = Record<string, unknown>>(
    names: (keyof T & string)[]
  ): Promise<Partial<T>> | Partial<T> {
    const stored = this.variables.getVariables<T>(names)
    if (isPromise(stored)) {
      return stored.then((values) => this.withDefaults(names, values))
    }
    return this.withDefaults(names, stored)
  }

  getAll():
    | Promise<Record<string, string | undefined>>
    | Record<string, string | undefined> {
    return this.variables.getAll()
  }

  set(name: string, value: unknown): Promise<void> | void {
    return this.variables.set(name, value)
  }

  has(name: string): Promise<boolean> | boolean {
    return this.variables.has(name)
  }

  delete(name: string): Promise<void> | void {
    return this.variables.delete(name)
  }

  async getAllStatus(): Promise<VariableStatus[]> {
    const results: VariableStatus[] = []
    const all = await this.variables.getAll()

    for (const [variableId, meta] of Object.entries(this.variablesMeta)) {
      results.push({
        variableId,
        name: meta.name,
        displayName: meta.displayName,
        isConfigured: all[variableId] !== undefined,
        hasDefault: (await this.resolveDefault(variableId)) !== undefined,
      })
    }

    return results
  }

  /**
   * What a deployment still has to be told. A variable that defaults is not on
   * this list — it has a value, just not one anybody has to supply.
   */
  async getMissing(): Promise<VariableStatus[]> {
    const all = await this.getAllStatus()
    return all.filter((v) => !v.isConfigured && !v.hasDefault)
  }

  /**
   * The value the declaration answers with when the host set nothing, or
   * `undefined` when it does not answer for itself.
   */
  private resolveDefault(name: string): Promise<unknown> | unknown {
    const declared = this.variablesMeta[name]?.schema
    if (!declared) {
      return undefined
    }
    const schema = typeof declared === 'function' ? declared() : declared
    const result = schema['~standard'].validate(undefined)
    if (isPromise(result)) {
      return result.then(unwrapDefault)
    }
    return unwrapDefault(result)
  }

  /**
   * Kept synchronous when the defaults resolve synchronously, so a caller that
   * did not await `getVariables` before does not have to start.
   */
  private withDefaults<T extends Record<string, unknown>>(
    names: (keyof T & string)[],
    values: Partial<T>
  ): Promise<Partial<T>> | Partial<T> {
    const out: Record<string, unknown> = { ...values }
    const pending: Promise<void>[] = []
    for (const name of names) {
      if (out[name] !== undefined) continue
      const fallback = this.resolveDefault(name)
      if (isPromise(fallback)) {
        pending.push(
          fallback.then((value) => {
            if (value !== undefined) out[name] = value
          })
        )
      } else if (fallback !== undefined) {
        out[name] = fallback
      }
    }
    if (pending.length > 0) {
      return Promise.all(pending).then(() => out as Partial<T>)
    }
    return out as Partial<T>
  }
}

/**
 * A schema with no default rejects `undefined`, which is not a failure here —
 * it is the answer that there is nothing to fall back to.
 */
const unwrapDefault = (result: StandardSchemaV1.Result<unknown>) =>
  result.issues ? undefined : result.value
