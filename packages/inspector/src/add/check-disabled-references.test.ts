import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

type Diagnostic = { code: string; message: string }

const makeLogger = (diagnostics: Diagnostic[]): InspectorLogger => ({
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  diagnostic: ({ code, message }) => {
    diagnostics.push({ code, message })
  },
  critical: (code, message) => {
    diagnostics.push({ code, message })
  },
  hasCriticalErrors: () => false,
})

const withProject = async (
  files: Record<string, string[]>,
  assertions: (
    state: Awaited<ReturnType<typeof inspect>>,
    diagnostics: Diagnostic[]
  ) => void
) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-disabled-'))
  const paths: string[] = []
  for (const [name, lines] of Object.entries(files)) {
    const path = join(rootDir, name)
    await writeFile(path, lines.join('\n'))
    paths.push(path)
  }
  const diagnostics: Diagnostic[] = []
  try {
    const state = await inspect(makeLogger(diagnostics), paths, { rootDir })
    assertions(state, diagnostics)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const referenced = (diagnostics: Diagnostic[]) =>
  diagnostics.filter((d) => d.code === ErrorCode.DISABLED_FUNCTION_REFERENCED)

const FUNCS = [
  "import { pikkuSessionlessFunc } from '@pikku/core'",
  'export const oldReport = pikkuSessionlessFunc({',
  "  disabled: 'replaced by newReport',",
  '  expose: true,',
  '  func: async () => ({ ok: true }),',
  '})',
  'export const newReport = pikkuSessionlessFunc({',
  '  disabled: false,',
  '  expose: true,',
  '  func: async () => ({ ok: true }),',
  '})',
]

describe('disabled functions', () => {
  test('a disabled function is left out of meta and the RPC maps', async () => {
    await withProject({ 'funcs.ts': FUNCS }, (state, diagnostics) => {
      assert.equal(state.functions.meta['oldReport'], undefined)
      assert.equal(state.rpc.internalMeta['oldReport'], undefined)
      assert.equal(state.rpc.exposedMeta['oldReport'], undefined)
      assert.deepEqual(
        {
          ...state.functions.disabled['oldReport'],
          sourceFile: undefined,
        },
        {
          name: 'oldReport',
          exportedName: 'oldReport',
          reason: 'replaced by newReport',
          sourceFile: undefined,
        }
      )
      assert.ok(state.functions.meta['newReport'], '`disabled: false` keeps it')
      assert.deepEqual(referenced(diagnostics), [])
    })
  })

  test('a wiring that references a disabled function names both sides', async () => {
    await withProject(
      {
        'funcs.ts': FUNCS,
        'http.ts': [
          "import { wireHTTP } from '@pikku/core/http'",
          "import { oldReport } from './funcs.js'",
          "wireHTTP({ method: 'get', route: '/report', func: oldReport })",
        ],
      },
      (_state, diagnostics) => {
        assert.deepEqual(
          referenced(diagnostics).map((d) => d.message),
          [
            "'oldReport' is disabled (replaced by newReport) in funcs.ts, but wireHTTP(...) references it at http.ts:3. Remove the reference, or remove `disabled`.",
          ]
        )
      }
    )
  })

  test('rpc.invoke by name of a disabled function is refused', async () => {
    await withProject(
      {
        'funcs.ts': FUNCS,
        'caller.ts': [
          "import { pikkuSessionlessFunc } from '@pikku/core'",
          'export const caller = pikkuSessionlessFunc({',
          "  func: async (_s, _d, { rpc }) => rpc.invoke('oldReport', {}),",
          '})',
        ],
      },
      (_state, diagnostics) => {
        const messages = referenced(diagnostics).map((d) => d.message)
        assert.ok(
          messages.includes(
            "'oldReport' is disabled (replaced by newReport) in funcs.ts, but rpc.invoke('oldReport') calls it at caller.ts:3. Remove the call, or remove `disabled`."
          ),
          messages.join('\n')
        )
      }
    )
  })

  test('a disabled function defined inline in a wiring is refused', async () => {
    await withProject(
      {
        'http.ts': [
          "import { pikkuSessionlessFunc } from '@pikku/core'",
          "import { wireHTTP } from '@pikku/core/http'",
          'wireHTTP({',
          "  method: 'get',",
          "  route: '/inline',",
          '  func: pikkuSessionlessFunc({ disabled: true, func: async () => ({}) }),',
          '})',
        ],
      },
      (_state, diagnostics) => {
        const messages = referenced(diagnostics).map((d) => d.message)
        assert.equal(messages.length, 1, messages.join('\n'))
        assert.match(
          messages[0]!,
          /defined inline at http\.ts:6 inside wireHTTP/
        )
      }
    )
  })

  test('a workflow step that calls a disabled function is refused', async () => {
    await withProject(
      {
        'funcs.ts': FUNCS,
        'w.workflow.ts': [
          "import { pikkuWorkflowFunc } from '@pikku/core/workflow'",
          'export const reportWorkflow = pikkuWorkflowFunc(async (_s, _d: any, { workflow }) => {',
          "  await workflow.do('report', 'oldReport', {})",
          '})',
        ],
      },
      (_state, diagnostics) => {
        const messages = referenced(diagnostics).map((d) => d.message)
        assert.ok(
          messages.includes(
            "'oldReport' is disabled (replaced by newReport) in funcs.ts, but workflow 'reportWorkflow' calls it as a step. Remove the step, or remove `disabled`."
          ),
          messages.join('\n')
        )
      }
    )
  })

  test('a reference inside the disabled function itself is not an error', async () => {
    await withProject(
      {
        'funcs.ts': [
          "import { pikkuSessionlessFunc } from '@pikku/core'",
          'export const loop = pikkuSessionlessFunc({',
          '  disabled: true,',
          "  func: async (_s, _d, { rpc }) => rpc.invoke('loop', {}),",
          '})',
        ],
      },
      (_state, diagnostics) => {
        assert.deepEqual(referenced(diagnostics), [])
      }
    )
  })

  test('a disabled the build cannot read is refused, not taken as enabled', async () => {
    await withProject(
      {
        'funcs.ts': [
          "import { pikkuSessionlessFunc } from '@pikku/core'",
          'const why = "later"',
          'export const later = pikkuSessionlessFunc({',
          '  disabled: why,',
          '  func: async () => ({}),',
          '})',
        ],
      },
      (state, diagnostics) => {
        assert.equal(state.functions.meta['later'], undefined)
        assert.ok(state.functions.disabled['later'])
        assert.ok(
          diagnostics.some((d) => d.code === ErrorCode.INVALID_VALUE),
          'an unreadable `disabled` is a critical'
        )
      }
    )
  })
})
