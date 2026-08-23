import type { SecretValue } from '../classification/secret-value.js'

/** A record of secrets, each still wrapped. */
export type SecretValues<T> = { [K in keyof T]: SecretValue<T[K]> }

export interface SecretService {
  /** Throws if the secret is not found. Unwrap the result with `.reveal()`. */
  getSecret<T = string>(key: string): Promise<SecretValue<T>>
  /** Answers for any key, including a disallowed one — it must not throw. */
  hasSecret(key: string): Promise<boolean>
  setSecret(key: string, value: unknown): Promise<void>
  deleteSecret(key: string): Promise<void>
  /**
   * Missing keys are omitted rather than throwing, hence `Partial<T>`: callers
   * must handle keys absent at runtime. Pass a shape as `T` to avoid casting,
   * e.g. `getSecrets<{ FOO: string; BAR: { id: string } }>(['FOO', 'BAR'])`.
   */
  getSecrets<T extends Record<string, unknown> = Record<string, unknown>>(
    keys: (keyof T & string)[]
  ): Promise<Partial<SecretValues<T>>>
}
