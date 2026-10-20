import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'
import { findUnusedFunctions } from './find-unused-functions.js'

const logger: InspectorLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: () => {},
  critical: () => {},
  hasCriticalErrors: () => false,
}

const unusedIn = async (
  files: Record<string, string[]>,
  options: { addon?: boolean } = {}
) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-unused-'))
  const paths: string[] = []
  for (const [name, lines] of Object.entries(files)) {
    const path = join(rootDir, name)
    await writeFile(path, lines.join('\n'))
    paths.push(path)
  }
  try {
    const state = await inspect(logger, paths, { rootDir })
    return findUnusedFunctions(state, options).map((fn) => fn.name)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const func = (name: string, config = '') => [
  `export const ${name} = pikkuSessionlessFunc({`,
  config,
  '  func: async () => ({}),',
  '})',
]

const IMPORT = "import { pikkuSessionlessFunc } from '@pikku/core'"

describe('findUnusedFunctions', () => {
  test('a function wired to a transport is used', async () => {
    const unused = await unusedIn({
      'funcs.ts': [IMPORT, ...func('wired')],
      'http.ts': [
        "import { wireHTTP } from '@pikku/core/http'",
        "import { wired } from './funcs.js'",
        "wireHTTP({ method: 'get', route: '/wired', func: wired })",
      ],
    })
    assert.deepEqual(unused, [])
  })

  test('an exposed function is used', async () => {
    const unused = await unusedIn({
      'funcs.ts': [IMPORT, ...func('exposed', '  expose: true,')],
    })
    assert.deepEqual(unused, [])
  })

  test('a function called by name is used', async () => {
    const unused = await unusedIn({
      'funcs.ts': [
        IMPORT,
        ...func('callee'),
        'export const caller = pikkuSessionlessFunc({',
        '  expose: true,',
        "  func: async (_s, _d, { rpc }) => rpc.invoke('callee', {}),",
        '})',
      ],
    })
    assert.deepEqual(unused, [])
  })

  test('a function nothing uses is reported', async () => {
    const unused = await unusedIn({
      'funcs.ts': [IMPORT, ...func('forgotten')],
    })
    assert.deepEqual(unused, ['forgotten'])
  })

  test('a disabled function is not reported', async () => {
    const unused = await unusedIn({
      'funcs.ts': [IMPORT, ...func('retired', "  disabled: 'no callers',")],
    })
    assert.deepEqual(unused, [])
  })

  test('an unused addon function is not reported', async () => {
    const unused = await unusedIn(
      { 'funcs.ts': [IMPORT, ...func('addonOnly')] },
      { addon: true }
    )
    assert.deepEqual(unused, [])
  })
})
