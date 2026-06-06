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

  public async getSecret<Result = string>(SecretId: string): Promise<Result> {
    let raw: string
    try {
      const result = await this.client.send(
        new GetSecretValueCommand({ SecretId })
      )
      if (!result.SecretString) {
        throw new Error(`Secret '${SecretId}' has no string value`)
      }
      raw = result.SecretString
    } catch (e: any) {
      throw new Error(`FATAL: Error finding secret: ${SecretId}`, { cause: e })
    }
    try {
      return JSON.parse(raw) as Result
    } catch {
      return raw as unknown as Result
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
}
