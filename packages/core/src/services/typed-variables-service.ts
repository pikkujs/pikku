import type { VariablesService } from './variables-service.js'

export interface VariableStatus {
  variableId: string
  name: string
  displayName: string
  isConfigured: boolean
}

export type VariableMeta = {
  name: string
  displayName: string
}

export class TypedVariablesService<TMap = Record<string, unknown>>
  implements VariablesService
{
  constructor(
    private variables: VariablesService,
    private variablesMeta: Record<string, VariableMeta>
  ) {}

  get(
    name: keyof TMap & string
  ): Promise<string | undefined> | string | undefined
  get(name: string): Promise<string | undefined> | string | undefined
  get(name: string): Promise<string | undefined> | string | undefined {
    return this.variables.get(name)
  }

  getJSON<K extends keyof TMap & string>(
    name: K
  ): Promise<TMap[K] | undefined> | TMap[K] | undefined
  getJSON<T = unknown>(name: string): Promise<T | undefined> | T | undefined
  getJSON(name: string): Promise<unknown> | unknown {
    return this.variables.getJSON(name)
  }

  getAll():
    | Promise<Record<string, string | undefined>>
    | Record<string, string | undefined> {
    return this.variables.getAll()
  }

  set(name: string, value: string): Promise<void> | void {
    return this.variables.set(name, value)
  }

  setJSON(name: string, value: unknown): Promise<void> | void {
    return this.variables.setJSON(name, value)
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
      })
    }

    return results
  }

  async getMissing(): Promise<VariableStatus[]> {
    const all = await this.getAllStatus()
    return all.filter((v) => !v.isConfigured)
  }
}
