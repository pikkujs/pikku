import { request } from 'node:http'
import { createSecretValue, type SecretValue } from '@pikku/core/classification'
import type { SecretService, SecretValues } from '@pikku/core/services'

const VAULT_TIMEOUT_MS = 5000

export interface VaultConnection {
  socketPath: string
  token: string
}

export const vaultConnectionFromEnv = (
  env: NodeJS.ProcessEnv = process.env
): VaultConnection | undefined => {
  const socketPath = env.PIKKU_VAULT_SOCKET
  const token = env.PIKKU_VAULT_TOKEN
  return socketPath && token ? { socketPath, token } : undefined
}

export class VaultSecretService implements SecretService {
  constructor(private connection: VaultConnection) {}

  private call(method: string, path: string): Promise<{ status: number; body: any }> {
    return new Promise((resolve, reject) => {
      const req = request(
        {
          socketPath: this.connection.socketPath,
          path,
          method,
          headers: { authorization: `Bearer ${this.connection.token}` },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(chunk))
          res.on('error', fail)
          res.on('aborted', () => fail(new Error('Vault closed the connection mid-response')))
          res.on('end', () => {
            if (!res.complete) return fail(new Error('Vault sent an incomplete response'))
            const text = Buffer.concat(chunks).toString('utf8')
            try {
              resolve({ status: res.statusCode ?? 0, body: text ? JSON.parse(text) : {} })
            } catch {
              fail(new Error(`Vault sent a non-JSON response (${res.statusCode})`))
            }
          })
        }
      )
      const deadline = setTimeout(
        () => fail(new Error(`Vault did not answer within ${VAULT_TIMEOUT_MS}ms`)),
        VAULT_TIMEOUT_MS
      )
      function fail(error: Error) {
        clearTimeout(deadline)
        req.destroy()
        reject(error)
      }
      req.on('error', fail)
      req.on('close', () => clearTimeout(deadline))
      req.end()
    })
  }

  private path(key: string, suffix = ''): string {
    return `/v1/secrets/${encodeURIComponent(key)}${suffix}`
  }

  async getSecret<T = string>(key: string): Promise<SecretValue<T>> {
    const response = await this.call('GET', this.path(key))
    if (response.status === 404) throw new Error(`Requested secret not found: ${key}`)
    if (response.status !== 200) {
      throw new Error(`Vault read of '${key}' failed (${response.status}): ${response.body?.error ?? 'unknown'}`)
    }
    return createSecretValue(JSON.parse(response.body.value) as T)
  }

  async hasSecret(key: string): Promise<boolean> {
    const response = await this.call('GET', this.path(key, '/exists'))
    return response.status === 200 && response.body.exists === true
  }

  async setSecret(): Promise<void> {
    throw new Error('Secrets are written through Pikku Studio, not from a running project')
  }

  async deleteSecret(): Promise<void> {
    throw new Error('Secrets are deleted through Pikku Studio, not from a running project')
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
