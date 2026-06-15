import type { VariablesService } from './variables-service.js'

export class LocalVariablesService implements VariablesService {
  constructor(
    private variables: Record<string, string | undefined> = process.env
  ) {}

  public getAll(): Record<string, string | undefined> {
    return this.variables || {}
  }

  public getVariables<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(names: (keyof T & string)[]): T {
    const out: Record<string, unknown> = {}
    for (const name of names) {
      const value = this.get(name)
      if (value !== undefined) out[name] = value
    }
    return out as T
  }

  public get<T = string>(name: string): T | undefined {
    const raw = this.variables[name]
    if (raw === undefined) return undefined
    try {
      return JSON.parse(raw) as T
    } catch {
      return raw as unknown as T
    }
  }

  public set(name: string, value: unknown): void {
    this.variables[name] =
      typeof value === 'string' ? value : JSON.stringify(value)
  }

  public has(name: string): boolean {
    return name in this.variables && this.variables[name] !== undefined
  }

  public delete(name: string): void {
    delete this.variables[name]
  }
}
