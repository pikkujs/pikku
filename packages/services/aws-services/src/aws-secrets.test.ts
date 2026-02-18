import { test, describe, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as sinon from 'sinon'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'

import { AWSSecrets } from './aws-secrets.js'

let sendStub: sinon.SinonStub

afterEach(() => {
  if (sendStub) {
    sendStub.restore()
  }
})

describe('AWSSecrets', () => {
  test('getSecret returns secret string when present', async () => {
    sendStub = sinon.stub(SecretsManagerClient.prototype, 'send').resolves({
      SecretString: 'super-secret',
    })

    const service = new AWSSecrets({ awsRegion: 'us-east-1' } as any)
    const secret = await service.getSecret('MY_SECRET')

    assert.equal(secret, 'super-secret')
    const command = sendStub.getCall(0).args[0] as GetSecretValueCommand
    assert.equal(command.input.SecretId, 'MY_SECRET')
  })

  test('getSecret throws Error with cause when sdk throws', async () => {
    const sdkError = new Error('boom')
    sendStub = sinon
      .stub(SecretsManagerClient.prototype, 'send')
      .rejects(sdkError)

    const service = new AWSSecrets({ awsRegion: 'us-east-1' } as any)

    await assert.rejects(
      () => service.getSecret('MISSING_SECRET'),
      (error: any) => {
        assert.equal(error instanceof Error, true)
        assert.match(
          error.message,
          /FATAL: Error finding secret: MISSING_SECRET/
        )
        assert.equal(error.cause, sdkError)
        return true
      }
    )
  })

  test('getSecret throws Error when SecretString is missing', async () => {
    sendStub = sinon.stub(SecretsManagerClient.prototype, 'send').resolves({})

    const service = new AWSSecrets({ awsRegion: 'us-east-1' } as any)

    await assert.rejects(
      () => service.getSecret('EMPTY_SECRET'),
      /FATAL: Error finding secret: EMPTY_SECRET/
    )
  })
})
