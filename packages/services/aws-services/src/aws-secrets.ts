import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import type { SecretService } from '@pikku/core/services'

import type { AWSConfig } from './aws-config.js'

export class AWSSecrets implements SecretService {
  private readonly client: SecretsManagerClient

  constructor(readonly config: AWSConfig) {
    this.client = new SecretsManagerClient({ region: config.awsRegion })
  }

  public async getSecret<T = string>(SecretId: string): Promise<T> {
    try {
      const result = await this.client.send(
        new GetSecretValueCommand({ SecretId })
      )
      if (result.SecretString) {
        try {
          return JSON.parse(result.SecretString) as T
        } catch {
          return result.SecretString as unknown as T
        }
      }
      throw new Error(`Secret '${SecretId}' has no string value`)
    } catch (e: any) {
      throw new Error(`FATAL: Error finding secret: ${SecretId}`, {
        cause: e,
      })
    }
  }

  public async hasSecret(SecretId: string): Promise<boolean> {
    try {
      const result = await this.client.send(
        new GetSecretValueCommand({ SecretId })
      )
      return !!result.SecretString
    } catch {
      return false
    }
  }

  public async setSecret(_key: string, _value: unknown): Promise<void> {
    throw new Error('setSecret is not implemented for AWSSecrets')
  }

  public async deleteSecret(_key: string): Promise<void> {
    throw new Error('deleteSecret is not implemented for AWSSecrets')
  }

  public async getSecrets(keys: string[]): Promise<Record<string, unknown>> {
    const results = await Promise.allSettled(keys.map((k) => this.getSecret(k)))
    const out: Record<string, unknown> = {}
    keys.forEach((key, i) => {
      if (results[i].status === 'fulfilled')
        out[key] = (results[i] as PromiseFulfilledResult<unknown>).value
    })
    return out
  }
}
