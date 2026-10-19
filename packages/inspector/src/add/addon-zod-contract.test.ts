import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const recordingLogger = () => {
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  const logger: InspectorLogger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    critical: (code, message) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }
  return { logger, criticals }
}

/**
 * The vendor check keys off the declaration file's path, so a stub under
 * `node_modules/zod` is indistinguishable from the real thing.
 */
const writeZodStub = async (rootDir: string) => {
  const dir = join(rootDir, 'node_modules', 'zod')
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'zod', version: '3.0.0', types: 'index.d.ts' })
  )
  await writeFile(
    join(dir, 'index.d.ts'),
    [
      'export interface ZodType<Output = unknown> {',
      '  _output: Output',
      '}',
      'export declare const z: {',
      '  object(shape: Record<string, ZodType>): ZodType<Record<string, unknown>>',
      '  string(): ZodType<string>',
      '}',
      '',
    ].join('\n')
  )
}

const PRELUDE = [
  "import { z } from 'zod'",
  'declare function pikkuSessionlessFunc<In = unknown, Out = unknown>(config: any): any',
]

const inspectApp = async (lines: string[], isAddon: boolean) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-addon-zod-'))
  try {
    await writeZodStub(rootDir)
    await writeFile(
      join(rootDir, 'package.json'),
      JSON.stringify({ name: 'test-addon', type: 'module' })
    )
    const file = join(rootDir, 'notes.functions.ts')
    await writeFile(file, [...PRELUDE, ...lines, ''].join('\n'))
    const { logger, criticals } = recordingLogger()
    await inspect(logger, [file], { rootDir, isAddon })
    return criticals.filter(
      (c) => c.code === ErrorCode.ADDON_REMOTE_CONTRACT_NOT_ZOD
    )
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const genericRemote = [
  'export const getNote = pikkuSessionlessFunc<{ id: string }, { body: string }>({',
  '  func: async (_s: any, data: { id: string }) => ({ body: data.id }),',
  '  remote: true,',
  '})',
]

describe('PKU922: a remote addon contract must be zod', () => {
  test('a remote addon function typed with generics is refused', async () => {
    const refused = await inspectApp(genericRemote, true)
    assert.equal(refused.length, 1, JSON.stringify(refused))
    assert.match(refused[0]!.message, /'getNote' is remote: true/)
    assert.match(refused[0]!.message, /TypeScript generics/)
    assert.match(refused[0]!.message, /must be zod schemas/)
  })

  test('a remote addon function returning a named source type is refused', async () => {
    const refused = await inspectApp(
      [
        'export interface Note { id: string; body: string }',
        'export const listNotes = pikkuSessionlessFunc({',
        '  func: async (): Promise<Note[]> => [],',
        '  remote: true,',
        '})',
      ],
      true
    )
    assert.equal(refused.length, 1, JSON.stringify(refused))
    assert.match(refused[0]!.message, /named source types \(Note\)/)
  })

  test('a remote addon function with zod input and output passes', async () => {
    const refused = await inspectApp(
      [
        'export const GetNoteInput = z.object({ id: z.string() })',
        'export const GetNoteOutput = z.object({ body: z.string() })',
        'export const getNote = pikkuSessionlessFunc({',
        '  input: GetNoteInput,',
        '  output: GetNoteOutput,',
        '  func: async () => ({ body: "" }),',
        '  remote: true,',
        '})',
      ],
      true
    )
    assert.deepEqual(refused, [])
  })

  test('a non-remote addon function may keep its generics', async () => {
    const refused = await inspectApp(
      [
        'export const getNote = pikkuSessionlessFunc<{ id: string }, { body: string }>({',
        '  func: async (_s: any, data: { id: string }) => ({ body: data.id }),',
        '})',
      ],
      true
    )
    assert.deepEqual(refused, [])
  })

  test('outside an addon, a remote function may keep its generics', async () => {
    const refused = await inspectApp(genericRemote, false)
    assert.deepEqual(refused, [])
  })
})
