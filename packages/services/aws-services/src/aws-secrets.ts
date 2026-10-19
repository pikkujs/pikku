import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import { createSecretValue } from '@pikku/core/classification'
import type { SecretService, SecretValues } from '@pikku/core/services'
import type { SecretValue } from '@pikku/core/classification'

import type { AWSConfig } from './aws-config.js'

const parseSecretString = <T>(value: string): SecretValue<T> => {
  try {
    return createSecretValue(JSON.parse(value) as T)
  } catch {
    return createSecretValue(value as unknown as T)
  }
}

export class AWSSecrets implements SecretService {
  private readonly client: SecretsManagerClient

  constructor(readonly config: AWSConfig) {
    this.client = new SecretsManagerClient({ region: config.awsRegion })
  }

  /**
   * The secret's string value, or `undefined` when it does not exist or holds
   * no string. Anything else — throttling, an expired role, a network failure —
   * is thrown: reporting it as absent would let a caller treat an outage as
   * "not configured", which for `PIKKU_MESH_SECRET` means sending remote
   * calls unauthenticated.
   */
  private async fetchSecretString(
    SecretId: string
  ): Promise<string | undefined> {
    try {
      const result = await this.client.send(
        new GetSecretValueCommand({ SecretId })
      )
      return result.SecretString || undefined
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'ResourceNotFoundException') {
        return undefined
      }
      throw e
    }
  }

  public async getSecret<T = string>(
    SecretId: string
  ): Promise<SecretValue<T>> {
    let value: string | undefined
    try {
      value = await this.fetchSecretString(SecretId)
    } catch (e: unknown) {
      throw new Error(`FATAL: Error finding secret: ${SecretId}`, {
        cause: e,
      })
    }
    if (value === undefined) {
      throw new Error(`FATAL: Error finding secret: ${SecretId}`, {
        cause: new Error(`Secret '${SecretId}' has no string value`),
      })
    }
    return parseSecretString<T>(value)
  }

  public async hasSecret(SecretId: string): Promise<boolean> {
    return (await this.fetchSecretString(SecretId)) !== undefined
  }

  public async setSecret(_key: string, _value: unknown): Promise<void> {
    throw new Error('setSecret is not implemented for AWSSecrets')
  }

  public async deleteSecret(_key: string): Promise<void> {
    throw new Error('deleteSecret is not implemented for AWSSecrets')
  }

  public async getSecrets<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(keys: (keyof T & string)[]): Promise<Partial<SecretValues<T>>> {
    const values = await Promise.all(
      keys.map((key) => this.fetchSecretString(key))
    )
    const out: Record<string, unknown> = {}
    keys.forEach((key, i) => {
      const value = values[i]
      if (value !== undefined) out[key] = parseSecretString(value)
    })
    return out as Partial<SecretValues<T>>
  }
}
