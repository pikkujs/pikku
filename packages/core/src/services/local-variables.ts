import { VariablesService } from './variables-service.js'

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
}
