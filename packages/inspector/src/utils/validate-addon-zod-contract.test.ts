import { strict as assert } from 'node:assert'
import { after, describe, test } from 'node:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TypesMap } from '../types-map.js'
import { namedSourceTypes } from './validate-addon-zod-contract.js'

const root = mkdtempSync(join(tmpdir(), 'pikku-addon-zod-core-'))
after(() => rmSync(root, { recursive: true, force: true }))

const declareIn = (dir: string, packageName: string): string => {
  mkdirSync(join(root, dir, 'src'), { recursive: true })
  writeFileSync(
    join(root, dir, 'package.json'),
    JSON.stringify({ name: packageName })
  )
  return join(root, dir, 'src', 'types.ts')
}

describe('namedSourceTypes', () => {
  test('a type in the addon’s own packages/core is still a source type', () => {
    const typesMap = new TypesMap()
    typesMap.addType('Note', declareIn('packages/core', '@acme/core'))

    assert.deepEqual(namedSourceTypes(typesMap, ['Note']), ['Note'])
  })

  test('a type declared in @pikku/core is not, wherever it is checked out', () => {
    const typesMap = new TypesMap()
    typesMap.addType('MCPToolResponse', declareIn('pikku/core', '@pikku/core'))
    typesMap.addType(
      'PikkuError',
      '/app/node_modules/@pikku/core/dist/errors.d.ts'
    )

    assert.deepEqual(
      namedSourceTypes(typesMap, ['MCPToolResponse', 'PikkuError']),
      []
    )
  })
})
