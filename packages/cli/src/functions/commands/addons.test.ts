import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addonCamelName,
  addonPackageName,
  addonRequirements,
  addonSource,
  discoverSpec,
  requirementLines,
} from './addons.js'

const tempApp = () => mkdtempSync(join(tmpdir(), 'pikku-addons-'))

describe('addonSource', () => {
  test('a bare name is a published addon', () => {
    assert.deepEqual(addonSource('stripe', tempApp()), {
      kind: 'package',
      packageName: '@pikku/addon-stripe',
    })
  })

  test('a scoped name is used as it is', () => {
    assert.deepEqual(addonSource('@acme/addon-billing', tempApp()), {
      kind: 'package',
      packageName: '@acme/addon-billing',
    })
  })

  test('a URL, a spec extension or a local path is a spec', () => {
    const root = tempApp()
    mkdirSync(join(root, 'api'))
    writeFileSync(join(root, 'api', 'spec'), '')
    assert.equal(addonSource('https://example.com/openapi', root)?.kind, 'spec')
    assert.equal(addonSource('petstore.yaml', root)?.kind, 'spec')
    assert.equal(addonSource('./petstore', root)?.kind, 'spec')
    assert.equal(addonSource('api/spec', root)?.kind, 'spec')
  })

  test('no argument finds specs/api-spec.*', () => {
    const root = tempApp()
    assert.equal(addonSource(undefined, root), undefined)
    mkdirSync(join(root, 'specs'))
    writeFileSync(join(root, 'specs', 'api-spec.json'), '{}')
    assert.deepEqual(addonSource(undefined, root), {
      kind: 'spec',
      spec: join(root, 'specs', 'api-spec.json'),
    })
    assert.equal(discoverSpec(root), join(root, 'specs', 'api-spec.json'))
  })
})

describe('names', () => {
  test('package and wiring names', () => {
    assert.equal(addonPackageName('addon-google-sheets'), 'addon-google-sheets')
    assert.equal(addonPackageName('google-sheets'), '@pikku/addon-google-sheets')
    assert.equal(addonCamelName('@pikku/addon-google-sheets'), 'googleSheets')
    assert.equal(addonCamelName('pikku-addon-stripe'), 'stripe')
  })
})

describe('addonRequirements', () => {
  test('reads secrets, variables and credentials from the addon meta', () => {
    const dir = tempApp()
    const meta = join(dir, 'dist', '.pikku', 'addon')
    for (const kind of ['secrets', 'variables', 'credentials'])
      mkdirSync(join(meta, kind), { recursive: true })
    writeFileSync(
      join(meta, 'secrets', 'pikku-secrets-meta.gen.json'),
      JSON.stringify({ api_key: { secretId: 'ASSEMBLYAI_API_KEY' } })
    )
    writeFileSync(
      join(meta, 'variables', 'pikku-variables-meta.gen.json'),
      JSON.stringify({ region: { variableId: 'ASSEMBLYAI_REGION' } })
    )
    writeFileSync(
      join(meta, 'credentials', 'pikku-credentials-meta.gen.json'),
      JSON.stringify({ assemblyai: { name: 'assemblyai' } })
    )
    const requirements = addonRequirements(dir)
    assert.deepEqual(requirements, {
      secrets: ['ASSEMBLYAI_API_KEY'],
      variables: ['ASSEMBLYAI_REGION'],
      credentials: ['assemblyai'],
    })
    assert.equal(requirementLines(requirements)[0], 'Fill these in:')
  })

  test('nothing declared', () => {
    const dir = tempApp()
    mkdirSync(join(dir, 'dist', '.pikku', 'addon'), { recursive: true })
    assert.deepEqual(requirementLines(addonRequirements(dir)), ['Nothing to fill in.'])
  })

  test('not built yet', () => {
    assert.equal(addonRequirements(tempApp()), undefined)
    assert.match(requirementLines(undefined)[0]!, /Not built yet/)
  })
})
