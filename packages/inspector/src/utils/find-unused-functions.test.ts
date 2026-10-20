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
const WF_IMPORT = "import { pikkuWorkflowFunc } from '@pikku/core/workflow'"

const workflowFunc = (name: string, body = '  return {}') => [
  `export const ${name} = pikkuWorkflowFunc(async (_s, _input, { workflow }) => {`,
  body,
  '})',
]

/** A workflow `onboard`, plus an exposed function whose body is `call`. */
const startedBy = (call: string) => ({
  'wf.ts': [WF_IMPORT, ...workflowFunc('onboard')],
  'funcs.ts': [
    IMPORT,
    'export const starter = pikkuSessionlessFunc({',
    '  expose: true,',
    `  func: async ({ workflowService }, _d, { rpc }) => { ${call} },`,
    '})',
  ],
})

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

  test('a workflow nothing starts is reported', async () => {
    const unused = await unusedIn({
      'wf.ts': [WF_IMPORT, ...workflowFunc('onboard')],
    })
    assert.deepEqual(unused, ['onboard'])
  })

  test('a workflow started by rpc.startWorkflow is used', async () => {
    const unused = await unusedIn(
      startedBy("await rpc.startWorkflow('onboard', {})")
    )
    assert.deepEqual(unused, [])
  })

  test('a workflow started by the workflow service is used', async () => {
    for (const call of [
      "await workflowService.startWorkflow('onboard', {}, rpc)",
      "await workflowService.runToCompletion('onboard', {}, rpc)",
    ]) {
      assert.deepEqual(await unusedIn(startedBy(call)), [], call)
    }
  })

  test('a workflow called by name through rpc.invoke is used', async () => {
    const unused = await unusedIn(startedBy("await rpc.invoke('onboard', {})"))
    assert.deepEqual(unused, [])
  })

  test("a workflow run as another workflow's step is used", async () => {
    const unused = await unusedIn({
      'wf.ts': [
        WF_IMPORT,
        ...workflowFunc('onboard'),
        ...workflowFunc(
          'signup',
          "  return await workflow.do('Onboard', 'onboard', {})"
        ),
      ],
      'funcs.ts': [
        IMPORT,
        'export const starter = pikkuSessionlessFunc({',
        '  expose: true,',
        "  func: async (_s, _d, { rpc }) => { await rpc.startWorkflow('signup', {}) },",
        '})',
      ],
    })
    assert.deepEqual(unused, [])
  })

  test('a workflow wired to a scheduler is used', async () => {
    const unused = await unusedIn({
      'wf.ts': [WF_IMPORT, ...workflowFunc('nightly')],
      'cron.ts': [
        "import { wireScheduler } from '@pikku/core/scheduler'",
        "import { nightly } from './wf.js'",
        "wireScheduler({ name: 'nightly', schedule: '0 0 * * *', func: nightly })",
      ],
    })
    assert.deepEqual(unused, [])
  })
})
