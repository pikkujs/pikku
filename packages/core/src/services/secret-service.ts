import type { SecretValue } from '../classification/secret-value.js'

/** A record of secrets, each still wrapped. */
export type SecretValues<T> = { [K in keyof T]: SecretValue<T[K]> }

/**
 * Reads and writes secrets, provided as the `secrets` singleton service (for
 * example a cloud secret manager, or {@link LocalSecretService} in
 * development).
 *
 * Values come back wrapped in a `SecretValue`, which logs and serializes as
 * `[secret]` until `.reveal()` is called, and the logger, audit log and email
 * service refuse a `SecretValue` at compile time. Function bodies and
 * permissions cannot reach this service at all; read secrets in your service
 * factories and pass the values to the services that need them.
 *
 * @example snippet: shopServices
 */
export interface SecretService {
  /**
   * Throws if the secret is not found, unless `defineSecret` declared it
   * `optional` — then absence resolves `undefined`. Unwrap the result with
   * `.reveal()`.
   */
  getSecret<T = string>(key: string): Promise<SecretValue<T>>
  /**
   * Resolves `false` for a key that is absent or not allowed, rather than
   * throwing. A backend failure (the store is unreachable, access is denied)
   * must throw instead, so callers relying on the check fail closed rather
   * than treating an outage as "no such secret".
   */
  hasSecret(key: string): Promise<boolean>
  setSecret(key: string, value: unknown): Promise<void>
  /**
   * Stores a value sealed to this service's public key, so the plaintext never
   * reaches the caller's process. `sealed` is the serialized envelope, opaque
   * here. Optional: only stores that hold a sealing key implement it.
   */
  setEncryptedSecret?(key: string, sealed: string): Promise<void>
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
