import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { liftAddonConstruction } from './addon-construction-lift.js'

// The shape the runnable-project conversion emits for a secrets-backed addon.
const DEEPL_SERVICES = `import { pikkuConfig, pikkuServices } from '#pikku'
import {
  ConsoleLogger,
  LocalVariablesService,
  LocalSecretService,
} from '@pikku/core/services'
import { DeeplService } from './deepl-api.service.js'
import type { DeeplSecrets } from './deepl.secret.js'

import '../.pikku/pikku-bootstrap.gen.js'

export const createConfig = pikkuConfig(async () => ({}))

export const createSingletonServices = pikkuServices(
  async (_config, existingServices) => {
    const variables =
      existingServices?.variables ?? new LocalVariablesService(process.env)
    const secrets =
      existingServices?.secrets ?? new LocalSecretService(variables)
    const logger = existingServices?.logger ?? new ConsoleLogger()

    const creds = await secrets.getSecret<DeeplSecrets>('DEEPL_CREDENTIALS')
    const deepl = new DeeplService(creds)

    return { logger, variables, secrets, deepl }
  }
)
`

describe('liftAddonConstruction', () => {
  test('lifts a secrets-backed owned service into pikkuAddonServices form', () => {
    const r = liftAddonConstruction(DEEPL_SERVICES)
    assert.equal(r.error, undefined)
    assert.deepEqual(r.ownedServices, ['deepl'])
    assert.deepEqual(r.injectedBase, ['secrets'])
    assert.deepEqual(r.secretReads, ['DEEPL_CREDENTIALS'])
    assert.deepEqual(r.variableReads, [])
  })

  test('emits pikkuAddonServices with secrets injected and base bindings dropped', () => {
    const { servicesText } = liftAddonConstruction(DEEPL_SERVICES)
    assert.match(servicesText, /pikkuAddonServices\(/)
    assert.match(servicesText, /async \(_config, \{ secrets \}\)/)
    // owned construction kept
    assert.match(servicesText, /getSecret<DeeplSecrets>\('DEEPL_CREDENTIALS'\)/)
    assert.match(servicesText, /new DeeplService\(creds\)/)
    assert.match(servicesText, /return \{ deepl \}/)
    // base service construction dropped
    assert.doesNotMatch(servicesText, /new LocalVariablesService/)
    assert.doesNotMatch(servicesText, /new ConsoleLogger/)
    assert.doesNotMatch(servicesText, /existingServices/)
    // impl import kept, base-service import + bootstrap dropped
    assert.match(servicesText, /import \{ DeeplService \} from '\.\/deepl-api\.service\.js'/)
    assert.match(servicesText, /import type \{ DeeplSecrets \} from '\.\/deepl\.secret\.js'/)
    assert.doesNotMatch(servicesText, /pikku-bootstrap/)
    assert.doesNotMatch(servicesText, /@pikku\/core\/services/)
  })

  test('reports an error when there is no owned service (pure addon)', () => {
    const pure = `import { pikkuServices } from '#pikku'
export const createSingletonServices = pikkuServices(
  async (_config, existingServices) => {
    const logger = existingServices?.logger ?? new ConsoleLogger()
    return { logger }
  }
)
`
    const r = liftAddonConstruction(pure)
    assert.ok(r.error)
  })

  test('captures variable reads when the construction uses variables.get', () => {
    const withVar = `import { pikkuServices } from '#pikku'
import { RedisService } from './redis.service.js'
export const createSingletonServices = pikkuServices(
  async (_config, existingServices) => {
    const variables = existingServices?.variables ?? new LocalVariablesService(process.env)
    const url = await variables.get('REDIS_URL')
    const redis = new RedisService(url)
    return { variables, redis }
  }
)
`
    const r = liftAddonConstruction(withVar)
    assert.equal(r.error, undefined)
    assert.deepEqual(r.ownedServices, ['redis'])
    assert.deepEqual(r.injectedBase, ['variables'])
    assert.deepEqual(r.variableReads, ['REDIS_URL'])
  })
})
