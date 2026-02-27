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

  public async getSecretJSON<Result = string>(
    SecretId: string
  ): Promise<Result> {
    const secretValue = await this.getSecret(SecretId)
    return JSON.parse(secretValue)
  }

  public async getSecret<Result = string>(SecretId: string): Promise<Result> {
    try {
      const result = await this.client.send(
        new GetSecretValueCommand({ SecretId })
      )
      if (result.SecretString) {
        return result.SecretString as any
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

  public async setSecretJSON(_key: string, _value: unknown): Promise<void> {
    throw new Error('setSecretJSON is not implemented for AWSSecrets')
  }

  public async deleteSecret(_key: string): Promise<void> {
    throw new Error('deleteSecret is not implemented for AWSSecrets')
  }
}
