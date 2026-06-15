export interface VariablesService {
  get<T = string>(name: string): Promise<T | undefined> | T | undefined
  /**
   * Retrieves multiple variables in a single batch operation, mirroring
   * `SecretService.getSecrets`. Missing variables are omitted rather than
   * throwing, so the result is typed as `Partial<T>` and callers must handle
   * keys that may be absent at runtime. Pass a shape as `T` to get a typed
   * result without casting, e.g.
   * `await variables.getVariables<{ FOO: string; BAR: string }>(['FOO', 'BAR'])`.
   */
  getVariables<T extends Record<string, unknown> = Record<string, unknown>>(
    names: (keyof T & string)[]
  ): Promise<Partial<T>> | Partial<T>
  getAll: () =>
    | Promise<Record<string, string | undefined>>
    | Record<string, string | undefined>
  set: (name: string, value: unknown) => Promise<void> | void
  has: (name: string) => Promise<boolean> | boolean
  delete: (name: string) => Promise<void> | void
}
