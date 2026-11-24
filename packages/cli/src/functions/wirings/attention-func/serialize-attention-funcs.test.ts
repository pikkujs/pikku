import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  attentionFuncsMeta,
  checkAttentionFuncs,
  readAttentionFuncs,
} from './serialize-attention-funcs.js'

const FILE = '/app/src/health/health.attention.ts'

const source = (widget = "'health.verdict'", every = "'1m'") => `
import { pikkuAttentionFunc } from '#pikku/attention'

export const healthAttention = pikkuAttentionFunc({
  func: async ({ metrics }, { projectKey }) => {
    const slot = { widget: 'inner.noise', every: '9h' }
    return slot ? undefined : { score: 1 }
  },
  widget: ${widget},
  every: ${every},
})
`

const screens = [
  { id: 'health', slots: ['verdict', 'trend'] },
  { id: 'logs', slots: ['verdict'] },
]

describe('readAttentionFuncs', () => {
  test('reads widget and every from the top level of the config, not from the func body', () => {
    const { found, problems } = readAttentionFuncs(FILE, source())
    assert.deepEqual(problems, [])
    assert.deepEqual(found, [
      {
        file: FILE,
        exportedName: 'healthAttention',
        widget: 'health.verdict',
        every: '1m',
      },
    ])
  })

  test('a widget that is not a string literal is a problem, not a guess', () => {
    const { found, problems } = readAttentionFuncs(
      FILE,
      source('WIDGET_ID', "'1m'")
    )
    assert.deepEqual(found, [])
    assert.match(problems[0]!.message, /string literal for widget/)
  })
})

describe('readAttentionFuncs and comments', () => {
  test('a declaration in a comment is not one', () => {
    const commented = `/*
export const a = pikkuAttentionFunc({ widget: 'x.y', every: '1m', func: async () => {} })
*/
// export const b = pikkuAttentionFunc({ widget: 'x.z', every: '1m', func: async () => {} })
`
    assert.deepEqual(readAttentionFuncs(FILE, commented), {
      found: [],
      problems: [],
    })
  })
})

describe('checkAttentionFuncs', () => {
  const found = (widget: string, every = '1m', file = FILE) => [
    { file, exportedName: 'x', widget, every },
  ]

  test("a widget on one of the plugin's own screens passes", () => {
    assert.deepEqual(
      checkAttentionFuncs('Studio', found('health.verdict'), screens),
      []
    )
  })

  test('an unknown screen is an error naming the plugin and its screens', () => {
    const [problem] = checkAttentionFuncs(
      'Studio',
      found('wellness.verdict'),
      screens
    )
    assert.match(
      problem!.message,
      /'wellness' is not one of Studio's arranged screens \(health, logs\)/
    )
  })

  test('an unknown slot names the slots the screen has', () => {
    const [problem] = checkAttentionFuncs(
      'Studio',
      found('logs.trend'),
      screens
    )
    assert.match(
      problem!.message,
      /screen 'logs' of Studio has no slot 'trend' \(slots: verdict\)/
    )
  })

  test('a plugin with no arranged screens refuses every widget', () => {
    const [problem] = checkAttentionFuncs('Studio', found('health.verdict'), [])
    assert.match(problem!.message, /none declared/)
  })

  test('an every the schedule cannot be built from is an error', () => {
    const [problem] = checkAttentionFuncs(
      'Studio',
      found('health.verdict', '30s'),
      screens
    )
    assert.match(problem!.message, /every: '30s'/)
  })

  test('two funcs for one widget are refused', () => {
    const problems = checkAttentionFuncs(
      'Studio',
      [...found('health.verdict'), ...found('health.verdict')],
      screens
    )
    assert.match(problems[0]!.message, /already covers/)
  })

  test('a declaration outside a *.attention.ts file is refused', () => {
    const [problem] = checkAttentionFuncs(
      'Studio',
      found('health.verdict', '1m', '/app/src/health.ts'),
      screens
    )
    assert.match(problem!.message, /must live in a \*\.attention\.ts file/)
  })
})

describe('attentionFuncsMeta', () => {
  test('carries the schedule so the app never parses a duration', () => {
    const meta = attentionFuncsMeta([
      { file: FILE, exportedName: 'a', widget: 'health.verdict', every: '5m' },
    ])
    assert.equal(meta['health.verdict']!.schedule, '*/5 * * * *')
  })
})
