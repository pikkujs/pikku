import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { pikkuState, resetPikkuState } from '../pikku-state.js'
import { getSchema } from '../schema.js'
import { reloadGeneratedMeta } from './reload-meta.js'

const createMockLogger = () => {
  const logs: Array<{ level: string; message: string }> = []
  return {
    info: (msg: string) => logs.push({ level: 'info', message: String(msg) }),
    warn: (msg: string) => logs.push({ level: 'warn', message: String(msg) }),
    error: (msg: string | Error) =>
      logs.push({
        level: 'error',
        message: msg instanceof Error ? msg.message : String(msg),
      }),
    debug: (msg: string) => logs.push({ level: 'debug', message: String(msg) }),
    getLogs: () => logs,
    setLevel: () => {},
  }
}

const compiled: string[] = []
const mockSchemaService = {
  compileSchema: (name: string, _value: any) => {
    compiled.push(name)
  },
  validateSchema: () => {},
  getSchemaNames: () => new Set(compiled),
  getSchemaKeys: () => [],
} as any

describe('reloadGeneratedMeta', { concurrency: false }, () => {
  let tmpDir: string
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    resetPikkuState()
    compiled.length = 0
    tmpDir = await mkdtemp(join(tmpdir(), 'pikku-reload-meta-test-'))
    mockLogger = createMockLogger()
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('reads generated meta json into pikku state', async () => {
    await mkdir(join(tmpDir, 'function'), { recursive: true })
    await mkdir(join(tmpDir, 'rpc'), { recursive: true })
    await writeFile(
      join(tmpDir, 'function/pikku-functions-meta.gen.json'),
      JSON.stringify({
        newFunc: { pikkuFuncId: 'newFunc', inputSchemaName: 'NewFuncInput' },
      })
    )
    await writeFile(
      join(tmpDir, 'rpc/pikku-rpc-wirings-meta.internal.gen.json'),
      JSON.stringify({ newFunc: 'newFunc' })
    )

    await reloadGeneratedMeta({
      pikkuDir: tmpDir,
      logger: mockLogger,
      schemaService: mockSchemaService,
    })

    const functionsMeta = pikkuState(null, 'function', 'meta') as any
    assert.equal(functionsMeta.newFunc.pikkuFuncId, 'newFunc')
    const rpcMeta = pikkuState(null, 'rpc', 'meta') as any
    assert.equal(rpcMeta.newFunc, 'newFunc')
  })

  test('preserves runtime-registered internals (workflow orchestrator) across reload', async () => {
    // The workflow service registers these at init; they are never in the
    // generated JSON, so the reload must merge — not replace — the meta maps.
    pikkuState(null, 'function', 'meta', {
      pikkuWorkflowOrchestrator: { pikkuFuncId: 'pikkuWorkflowOrchestrator' },
    })
    pikkuState(null, 'queue', 'meta', {
      'pikku-workflow-orchestrator': {
        pikkuFuncId: 'pikkuWorkflowOrchestrator',
        name: 'pikku-workflow-orchestrator',
      },
    })

    await mkdir(join(tmpDir, 'function'), { recursive: true })
    await mkdir(join(tmpDir, 'queue'), { recursive: true })
    await writeFile(
      join(tmpDir, 'function/pikku-functions-meta.gen.json'),
      JSON.stringify({ userFunc: { pikkuFuncId: 'userFunc' } })
    )
    await writeFile(
      join(tmpDir, 'queue/pikku-queue-workers-wirings-meta.gen.json'),
      JSON.stringify({ userQueue: { pikkuFuncId: 'userFunc', name: 'userQueue' } })
    )

    await reloadGeneratedMeta({
      pikkuDir: tmpDir,
      logger: mockLogger,
      schemaService: mockSchemaService,
    })

    const functionsMeta = pikkuState(null, 'function', 'meta') as any
    assert.equal(
      functionsMeta.pikkuWorkflowOrchestrator?.pikkuFuncId,
      'pikkuWorkflowOrchestrator',
      'runtime-registered internal must survive the reload'
    )
    assert.equal(functionsMeta.userFunc?.pikkuFuncId, 'userFunc')
    const queueMeta = pikkuState(null, 'queue', 'meta') as any
    assert.equal(
      queueMeta['pikku-workflow-orchestrator']?.pikkuFuncId,
      'pikkuWorkflowOrchestrator'
    )
    assert.equal(queueMeta.userQueue?.name, 'userQueue')
  })

  test('re-adds generated json schemas and recompiles them', async () => {
    const schemasDir = join(tmpDir, 'schemas', 'schemas')
    await mkdir(schemasDir, { recursive: true })
    await writeFile(
      join(schemasDir, 'NewFuncInput.schema.json'),
      JSON.stringify({ type: 'object', properties: { id: { type: 'string' } } })
    )

    await reloadGeneratedMeta({
      pikkuDir: tmpDir,
      logger: mockLogger,
      schemaService: mockSchemaService,
    })

    const schema = getSchema('NewFuncInput') as any
    assert.equal(schema.type, 'object')
    assert.ok(
      compiled.includes('NewFuncInput'),
      'Schema should be recompiled after reload'
    )
  })

  test('missing meta files and schemas dir are not an error', async () => {
    await reloadGeneratedMeta({
      pikkuDir: tmpDir,
      logger: mockLogger,
      schemaService: mockSchemaService,
    })
    const errors = mockLogger.getLogs().filter((l) => l.level === 'error')
    assert.deepEqual(errors, [])
  })
})
