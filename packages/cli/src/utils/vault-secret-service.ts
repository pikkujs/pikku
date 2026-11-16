import { readFileSync } from 'node:fs'
import { CorePikkuFetch, PikkuFetchError } from '@pikku/fetch'
import { createSecretValue, type SecretValue } from '@pikku/core/classification'
import type { SecretService, SecretValues } from '@pikku/core/services'

const VAULT_TIMEOUT_MS = 5000
const REMOTE_CONTRACT_HEADER = 'x-pikku-remote-contract'

/** Path of the 0600 JSON file `{ "url", "token" }` that Pikku Studio rewrites atomically. */
export const VAULT_CONNECTION_FILE_ENV = 'PIKKU_VAULT_CONNECTION_FILE'

export interface VaultConnection {
  file: string
}

export interface VaultSecretServiceOptions {
  timeoutMs?: number
  /** A fetch implementation; defaults to the global one (Node and Bun). */
  fetch?: typeof globalThis.fetch
}

export const vaultConnectionFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): VaultConnection | undefined => {
  const file = env[VAULT_CONNECTION_FILE_ENV]
  return file ? { file } : undefined
}

type Endpoint = { url: string; token: string }

/** Raised for a failed attempt that re-reading the connection file might fix. */
class Retryable extends Error {}

/**
 * Reads this project's own secrets from the vault host over HTTP. The host
 * address and bearer live in a connection file that Studio rewrites, so a
 * renewed token and a new host port reach a running project: on a 401 or a
 * connection error the file is read again and the call retried once.
 *
 * Read-only by design (never `durable`). Error messages carry the key name and
 * a status, never the token, the connection file's contents or a secret value.
 */
export class VaultSecretService implements SecretService {
  private endpoint: Endpoint | undefined

  constructor(
    private connection: VaultConnection,
    private options: VaultSecretServiceOptions = {}
  ) {}

  private loadEndpoint(): Endpoint {
    const { file } = this.connection
    const bad = (why: string): never => {
      throw new Error(
        `Vault connection file ${file} (${VAULT_CONNECTION_FILE_ENV}) ${why}`
      )
    }
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      return bad('cannot be read; is Pikku Studio running for this project?')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return bad('is not valid JSON')
    }
    const { url, token } = (parsed ?? {}) as Record<string, unknown>
    if (typeof url !== 'string' || typeof token !== 'string' || !token) {
      return bad('must hold a string "url" and a string "token"')
    }
    if (!/^https?:\/\//i.test(url))
      return bad('has a "url" that is not http(s)')
    return { url: url.replace(/\/+$/, ''), token }
  }

  private async attempt<T>(
    endpoint: Endpoint,
    rpcName: string,
    key: string
  ): Promise<T> {
    const client = new CorePikkuFetch({
      serverUrl: endpoint.url,
      fetch: this.options.fetch,
    })
    client.setAuthorizationJWT(endpoint.token)
    client.setHeader(REMOTE_CONTRACT_HEADER, '1')
    const timeoutMs = this.options.timeoutMs ?? VAULT_TIMEOUT_MS
    try {
      return (await client.post(
        `/rpc/${encodeURIComponent(rpcName)}`,
        { rpcName, data: { name: key } },
        { signal: AbortSignal.timeout(timeoutMs) }
      )) as T
    } catch (error) {
      if (error instanceof PikkuFetchError) {
        if (error.status === 401) {
          throw new Retryable(
            `Vault rejected the token for '${key}' (401); is the connection file current?`
          )
        }
        throw Object.assign(
          new Error(`Vault read of '${key}' failed (${error.status})`),
          { status: error.status }
        )
      }
      throw new Retryable(
        `Vault unreachable at ${endpoint.url} (reading '${key}')`
      )
    }
  }

  private async call<T>(rpcName: string, key: string): Promise<T> {
    this.endpoint ??= this.loadEndpoint()
    try {
      return await this.attempt<T>(this.endpoint, rpcName, key)
    } catch (error) {
      if (!(error instanceof Retryable)) throw error
      // Studio may have renewed the token or moved the host: read the file once more.
      const fresh = this.loadEndpoint()
      this.endpoint = fresh
      try {
        return await this.attempt<T>(fresh, rpcName, key)
      } catch (retry) {
        throw retry instanceof Retryable ? new Error(retry.message) : retry
      }
    }
  }

  async getSecret<T = string>(key: string): Promise<SecretValue<T>> {
    let result: { value?: unknown }
    try {
      result = await this.call('vault:secretGetOwn@v1', key)
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        throw new Error(`Requested secret not found: ${key}`)
      }
      throw error
    }
    if (typeof result?.value !== 'string') {
      throw new Error(`Vault sent an invalid response for '${key}'`)
    }
    try {
      return createSecretValue(JSON.parse(result.value) as T)
    } catch {
      throw new Error(`Vault sent an invalid response for '${key}'`)
    }
  }

  async hasSecret(key: string): Promise<boolean> {
    const result = await this.call<{ exists?: unknown }>(
      'vault:secretHasOwn@v1',
      key
    )
    if (typeof result?.exists !== 'boolean') {
      throw new Error(`Vault sent an invalid response for '${key}'`)
    }
    return result.exists
  }

  async setSecret(): Promise<void> {
    throw new Error(
      'Secrets are written through Pikku Studio, not from a running project'
    )
  }

  async deleteSecret(): Promise<void> {
    throw new Error(
      'Secrets are deleted through Pikku Studio, not from a running project'
    )
  }

  async getSecrets<T extends Record<string, unknown> = Record<string, unknown>>(
    keys: (keyof T & string)[]
  ): Promise<Partial<SecretValues<T>>> {
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      if (await this.hasSecret(key)) result[key] = await this.getSecret(key)
    }
    return result as Partial<SecretValues<T>>
  }
}
