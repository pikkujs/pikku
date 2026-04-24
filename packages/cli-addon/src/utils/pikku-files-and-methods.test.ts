import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { getPikkuFilesAndMethods } from './pikku-files-and-methods.js'

const makeEntry = (type: string, variable = 'value', typePath = './types') => [
  {
    type,
    variable,
    typePath,
  },
]

describe('getPikkuFilesAndMethods', () => {
  test('returns resolved metadata from inspector shared resolver', async () => {
    const state: any = {
      singletonServicesTypeImportMap: new Map([
        ['singleton.ts', makeEntry('MySingletonServices')],
      ]),
      wireServicesTypeImportMap: new Map([
        ['wire.ts', makeEntry('MyWireServices')],
      ]),
      userSessionTypeImportMap: new Map([
        ['session.ts', makeEntry('MySessionType')],
      ]),
      configTypeImportMap: new Map([['config-type.ts', makeEntry('Config')]]),
      wireServicesFactories: new Map([
        ['wire-factory.ts', makeEntry('CreateWireServices')],
      ]),
      singletonServicesFactories: new Map([
        ['singleton-factory.ts', makeEntry('CreateSingletonServices')],
      ]),
      configFactories: new Map([
        ['config-factory.ts', makeEntry('CoreConfig')],
      ]),
    }

    const result = await getPikkuFilesAndMethods(state)

    assert.equal(result.userSessionType.file, 'session.ts')
    assert.equal(result.singletonServicesType.file, 'singleton.ts')
    assert.equal(result.wireServicesType.file, 'wire.ts')
    assert.equal(result.pikkuConfigFactory.file, 'config-factory.ts')
    assert.equal(result.singletonServicesFactory.file, 'singleton-factory.ts')
    assert.equal(result.wireServicesFactory.file, 'wire-factory.ts')
  })

  test('throws when required metadata is missing', async () => {
    const emptyState: any = {
      singletonServicesTypeImportMap: new Map(),
      wireServicesTypeImportMap: new Map(),
      userSessionTypeImportMap: new Map(),
      configTypeImportMap: new Map(),
      wireServicesFactories: new Map(),
      singletonServicesFactories: new Map(),
      configFactories: new Map(),
    }

    await assert.rejects(() => getPikkuFilesAndMethods(emptyState), {
      message: /Found errors:/,
    })
  })
})
