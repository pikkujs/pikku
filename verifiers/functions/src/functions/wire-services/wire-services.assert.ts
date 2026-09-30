import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import '../../../.pikku/pikku-bootstrap.gen.js'
import { fetch } from '@pikku/core/http'
import { pikkuState } from '@pikku/core/state'
import {
  createConfig,
  createSingletonServices,
  wireServicesBuilt,
} from '../../services.js'

const get = async (route: string): Promise<unknown> => {
  const response = await fetch(new Request(`http://localhost${route}`))
  assert.equal(response.status, 200)
  return response.json()
}

before(async () => {
  const config = await createConfig()
  await createSingletonServices(config)
})

describe('wire services verifier', () => {
  test('the generated runtime meta marks only the singleton-only function', () => {
    const meta = pikkuState(null, 'function', 'meta')
    assert.equal(meta.readsSingletonsOnly?.singletonServicesOnly, true)
    assert.equal(meta.readsWireService?.singletonServicesOnly, undefined)
  })

  test('a function reading only singletons never builds wire services', async () => {
    const before = wireServicesBuilt()
    assert.equal(await get('/wire-services/singletons-only'), 'singleton')
    assert.equal(wireServicesBuilt(), before)
  })

  test('a function reading a wire service builds them once per call', async () => {
    const before = wireServicesBuilt()
    assert.equal(typeof (await get('/wire-services/wire')), 'string')
    assert.equal(wireServicesBuilt(), before + 1)
  })
})
