import type { VariablesService } from './variables-service.js'

export class LocalVariablesService implements VariablesService {
  constructor(
    private variables: Record<string, string | undefined> = process.env
  ) {}

  public getAll():
    | Promise<Record<string, string | undefined>>
    | Record<string, string | undefined> {
    return this.variables || {}
  }

  public get(name: string): Promise<string | undefined> | string | undefined {
    return this.variables[name]
  }

  public getJSON<T = unknown>(name: string): T | undefined {
    const value = this.variables[name]
    if (value === undefined) return undefined
    return JSON.parse(value)
  }

  public set(name: string, value: string): void {
    this.variables[name] = value
  }

  public setJSON(name: string, value: unknown): void {
    this.variables[name] = JSON.stringify(value)
  }

  public has(name: string): boolean {
    return name in this.variables && this.variables[name] !== undefined
  }

  public delete(name: string): void {
    delete this.variables[name]
  }
}
