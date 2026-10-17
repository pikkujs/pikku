import { test, describe, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as sinon from 'sinon'
import type { GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager'

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

    assert.equal(secret.reveal(), 'super-secret')
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

  const notFound = () =>
    Object.assign(
      new Error("Secrets Manager can't find the specified secret."),
      {
        name: 'ResourceNotFoundException',
      }
    )

  test('hasSecret is true when the secret has a string value', async () => {
    sendStub = sinon.stub(SecretsManagerClient.prototype, 'send').resolves({
      SecretString: 'super-secret',
    })

    const service = new AWSSecrets({ awsRegion: 'us-east-1' } as any)
    assert.equal(await service.hasSecret('MY_SECRET'), true)
  })

  test('hasSecret is false only when the secret does not exist', async () => {
    sendStub = sinon
      .stub(SecretsManagerClient.prototype, 'send')
      .rejects(notFound())

    const service = new AWSSecrets({ awsRegion: 'us-east-1' } as any)
    assert.equal(await service.hasSecret('MISSING_SECRET'), false)
  })

  // An outage must not read as "not configured": core's remote call treats
  // an absent PIKKU_REMOTE_SECRET as "send unauthenticated".
  test('hasSecret rethrows a backend failure', async () => {
    const outage = Object.assign(new Error('Rate exceeded'), {
      name: 'ThrottlingException',
    })
    sendStub = sinon
      .stub(SecretsManagerClient.prototype, 'send')
      .rejects(outage)

    const service = new AWSSecrets({ awsRegion: 'us-east-1' } as any)
    await assert.rejects(() => service.hasSecret('PIKKU_REMOTE_SECRET'), outage)
  })

  test('getSecrets omits missing secrets and rethrows a backend failure', async () => {
    sendStub = sinon.stub(SecretsManagerClient.prototype, 'send')
    sendStub.onFirstCall().resolves({ SecretString: '{"id":"x"}' })
    sendStub.onSecondCall().rejects(notFound())

    const service = new AWSSecrets({ awsRegion: 'us-east-1' } as any)
    const secrets = await service.getSecrets(['PRESENT', 'MISSING'])
    assert.deepEqual(Object.keys(secrets), ['PRESENT'])
    assert.deepEqual(secrets.PRESENT!.reveal(), { id: 'x' })

    sendStub.restore()
    const outage = new Error('connect ETIMEDOUT')
    sendStub = sinon
      .stub(SecretsManagerClient.prototype, 'send')
      .rejects(outage)
    await assert.rejects(() => service.getSecrets(['PRESENT']), outage)
  })
})
