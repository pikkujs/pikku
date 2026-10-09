import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  assertResetAllowed,
  assertResetHonoured,
  resetPrompt,
  resetWarning,
} from './deploy-reset.js'
import { FabricDeployValidatedInput } from '../functions/deploy.function.js'

describe('assertResetAllowed', () => {
  test('refuses --production', () => {
    assert.throws(
      () => assertResetAllowed({ production: true }),
      /production \(main\) is never reset/
    )
  })

  test('refuses main however it was named or inferred', () => {
    assert.throws(() => assertResetAllowed({ branch: 'main' }), /never reset/)
  })

  test('refuses attaching to an existing deployment', () => {
    assert.throws(
      () => assertResetAllowed({ deploymentId: 'dep-1' }),
      /drop --deployment-id/
    )
  })

  test('allows a disposable branch', () => {
    assert.doesNotThrow(() => assertResetAllowed({ branch: 'develop' }))
  })
})

describe('FabricDeployValidatedInput with reset', () => {
  test('rejects --reset --production before anything runs', () => {
    const r = FabricDeployValidatedInput.safeParse({
      reset: true,
      production: true,
    })
    assert.strictEqual(r.success, false)
  })

  test('rejects --reset with a named main', () => {
    const r = FabricDeployValidatedInput.safeParse({
      reset: true,
      branch: 'main',
    })
    assert.strictEqual(r.success, false)
  })

  test('accepts --reset on a named stage, and on the inferred branch', () => {
    assert.ok(
      FabricDeployValidatedInput.safeParse({ reset: true, branch: 'develop' })
        .success
    )
    assert.ok(FabricDeployValidatedInput.safeParse({ reset: true }).success)
  })

  test('a plain deploy of main is untouched', () => {
    assert.ok(
      FabricDeployValidatedInput.safeParse({ production: true }).success
    )
  })
})

describe('the confirmation', () => {
  const target = { app: 'Salons', branch: 'develop', ref: 'abcd1234' }

  test('names the app, the stage and that all data is wiped', () => {
    const prompt = resetPrompt(target)
    assert.match(prompt, /"Salons"/)
    assert.match(prompt, /develop/)
    assert.match(prompt, /WIPE ALL DATA/)
  })

  test('the printed warning says the same, for -y runs that skip the prompt', () => {
    const text = resetWarning(target).join('\n')
    assert.match(text, /WIPE ALL DATA/)
    assert.match(text, /"develop"/)
    assert.match(text, /"Salons"/)
    assert.match(text, /dev seed/)
  })
})

describe('assertResetHonoured', () => {
  test('passes when the server echoes the reset', () => {
    assert.doesNotThrow(() =>
      assertResetHonoured(
        { deploymentId: 'dep-1', resetDatabase: true },
        'https://api.example'
      )
    )
  })

  test('fails loudly when the server ignored the field', () => {
    assert.throws(
      () =>
        assertResetHonoured({ deploymentId: 'dep-1' }, 'https://api.example'),
      /not supported by https:\/\/api.example.*WITHOUT a database reset/
    )
  })
})
