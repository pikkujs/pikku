/**
 * Reads and writes non-secret configuration, provided as the `variables`
 * singleton service ({@link LocalVariablesService} reads `process.env`). Use
 * {@link SecretService} for anything sensitive: variables are plain values and
 * are not redacted from logs.
 *
 * @example snippet: shopServices
 */
export interface VariablesService {
  get<T = string>(name: string): Promise<T | undefined> | T | undefined
  /** Same contract as `SecretService.getSecrets`: missing keys are omitted, hence `Partial<T>`. */
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
