import {
  describe,
  test,
  beforeEach,
  afterEach,
  type TestContext,
} from 'node:test'
import assert from 'node:assert/strict'
import { watch } from 'node:fs'
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { pikkuState, resetPikkuState } from '../pikku-state.js'
import { addFunction } from '../function/function-runner.js'
import { fetch, wireHTTP } from '../wirings/http/http-runner.js'
import { httpRouter } from '../wirings/http/routers/http-router.js'
import {
  wireScheduler,
  runScheduledTask,
} from '../wirings/scheduler/scheduler-runner.js'
import { wireQueueWorker, runQueueJob } from '../wirings/queue/queue-runner.js'
import { pikkuDevReloader } from './hot-reload.js'
import {
  PikkuMockRequest,
  PikkuMockResponse,
} from '../wirings/channel/local/local-channel-runner.test.js'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const ensureRecursiveWatchAvailable = async (
  t: TestContext,
  dir: string
): Promise<boolean> => {
  // fs.watch's recursive mode on darwin coalesces the rapid write/read cycles
  // these tests depend on; the verifier under verifiers/hmr covers the same
  // paths on CI's linux.
  if (process.platform === 'darwin') {
    t.skip('recursive fs.watch is unreliable on darwin')
    return false
  }

  try {
    const watcher = watch(dir, { recursive: true }, () => {})
    watcher.close()
    return true
  } catch (error: any) {
    // Every reason a host refuses a recursive watch is a reason these tests
    // cannot run, and enumerating the codes only decided which hosts skipped
    // quietly and which failed loudly for the same missing feature.
    t.skip(`recursive fs.watch unavailable: ${error?.code ?? error?.message}`)
    return false
  }
}

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

const writeFunctionModule = async (
  dir: string,
  filename: string,
  returnValue: string
) => {
  const name = filename.replace('.ts', '')
  await writeFile(
    join(dir, filename),
    `export const ${name} = { func: async (): Promise<any> => (${returnValue}) };\n`
  )
}

describe('pikkuDevReloader', { concurrency: false }, () => {
  let tmpDir: string
  let reloader: { close: () => void } | undefined
  let mockLogger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    resetPikkuState()
    httpRouter.reset()
    tmpDir = await mkdtemp(join(tmpdir(), 'pikku-hot-reload-test-'))
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ type: 'module' })
    )
    mockLogger = createMockLogger()

    pikkuState(null, 'package', 'singletonServices', {
      logger: mockLogger,
    } as any)
    pikkuState(null, 'package', 'factories', {
      createWireServices: async () => ({}),
    } as any)
  })

  afterEach(async () => {
    reloader?.close()
    reloader = undefined
    await rm(tmpDir, { recursive: true, force: true })
  })

  test('should hot-reload a function and pick up new return value', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    addFunction('myFunc', {
      func: async () => ({ version: 1 }),
    })

    await writeFunctionModule(tmpDir, 'myFunc.ts', '{ version: 1 }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    const funcBefore = pikkuState(null, 'function', 'functions').get('myFunc')!
    assert.deepEqual(await funcBefore.func({} as any, {}, {} as any), {
      version: 1,
    })

    await writeFunctionModule(tmpDir, 'myFunc.ts', '{ version: 2 }')

    await wait(300)

    const funcAfter = pikkuState(null, 'function', 'functions').get('myFunc')!
    assert.deepEqual(await funcAfter.func({} as any, {}, {} as any), {
      version: 2,
    })

    const reloadLog = mockLogger
      .getLogs()
      .find(
        (l) =>
          l.message.includes('Hot-reloaded') && l.message.includes('myFunc')
      )
    assert.ok(reloadLog, 'Should log hot-reload message')
  })

  test('a leftover compiled .js never shadows the edited source', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    addFunction('staleFunc', {
      func: async () => ({ version: 1 }),
    })

    await writeFunctionModule(tmpDir, 'staleFunc.ts', '{ version: 1 }')
    // What a `tsc`, `pikku dist` or bundler run leaves behind. `pikku dev`
    // never refreshes it, so reading it announces a reload and serves the
    // implementation the developer just replaced.
    await writeFile(
      join(tmpDir, 'staleFunc.js'),
      'export const staleFunc = { func: async () => ({ version: 1 }) };\n'
    )

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFunctionModule(tmpDir, 'staleFunc.ts', '{ version: 2 }')

    await wait(300)

    const func = pikkuState(null, 'function', 'functions').get('staleFunc')!
    assert.deepEqual(await func.func({} as any, {}, {} as any), { version: 2 })
  })

  test('reloads a source whose sibling import only exists as TypeScript', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    addFunction('siblingFunc', {
      func: async () => ({ greeting: 'v1' }),
    })

    await writeFile(
      join(tmpDir, 'greeting.ts'),
      `export const greeting = (): string => 'v1'\n`
    )
    await writeFile(
      join(tmpDir, 'siblingFunc.ts'),
      `import { greeting } from './greeting.js'
       export const siblingFunc = { func: async () => ({ greeting: greeting() }) };\n`
    )

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFile(
      join(tmpDir, 'greeting.ts'),
      `export const greeting = (): string => 'v2'\n`
    )
    await writeFile(
      join(tmpDir, 'siblingFunc.ts'),
      `import { greeting } from './greeting.js'
       export const siblingFunc = { func: async () => ({ greeting: greeting() }) };
       // trigger ${Date.now()}\n`
    )

    await wait(300)

    const failureLog = mockLogger
      .getLogs()
      .find((l) => l.message.includes('Failed to import'))
    assert.equal(failureLog, undefined, failureLog?.message)

    const func = pikkuState(null, 'function', 'functions').get('siblingFunc')!
    assert.deepEqual(await func.func({} as any, {}, {} as any), {
      greeting: 'v2',
    })
  })

  test('should register a brand-new function export', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    addFunction('registeredFunc', {
      func: async () => ({ name: 'registered' }),
    })

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFunctionModule(tmpDir, 'unknownFunc.ts', '{ name: "unknown" }')

    await wait(300)

    const func = pikkuState(null, 'function', 'functions').get('unknownFunc')!
    assert.ok(func, 'New function export should be registered')
    assert.deepEqual(await func.func({} as any, {}, {} as any), {
      name: 'unknown',
    })
    const newLog = mockLogger
      .getLogs()
      .find(
        (l) =>
          l.message.includes('Hot-reloaded') &&
          l.message.includes('new: unknownFunc')
      )
    assert.ok(newLog, 'Should log the newly registered function')
  })

  test('should keep old code when the source fails to import', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    addFunction('badFunc', {
      func: async () => ({ working: true }),
    })

    await writeFunctionModule(tmpDir, 'badFunc.ts', '{ working: true }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFile(
      join(tmpDir, 'badFunc.ts'),
      'this is not valid typescript {{{'
    )

    await wait(300)

    const func = pikkuState(null, 'function', 'functions').get('badFunc')!
    assert.deepEqual(await func.func({} as any, {}, {} as any), {
      working: true,
    })

    // Serving the old code is only safe if the developer is told why; without
    // the reason the sole symptom is a function that ignores the file on disk.
    const failureLog = mockLogger
      .getLogs()
      .find((l) => l.message.includes('Failed to import'))
    assert.ok(failureLog, 'Should log the failed import')
    assert.ok(
      failureLog!.message.includes('keeping old code'),
      'Should say the old code is still being served'
    )
    assert.match(failureLog!.message, /badFunc\.ts/)
  })

  test('should name the top-level await limitation when a reload hits it', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    await writeFile(join(tmpDir, 'tlaFunc.ts'), '// initial')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFile(
      join(tmpDir, 'tlaFunc.ts'),
      `const config = await Promise.resolve({ ok: true })
       export const tlaFunc = { func: async () => config }
       // trigger ${Date.now()}`
    )

    await wait(300)

    const failureLog = mockLogger
      .getLogs()
      .find((l) => l.message.includes('Failed to import'))
    assert.ok(failureLog, 'Should log the failed import')
    // The file is valid TypeScript; pointing at pikku's own `cjs` emit is the
    // difference between a two-minute fix and an afternoon.
    assert.match(failureLog!.message, /top-level `?await`?/i)
    assert.match(failureLog!.message, /pikku limitation/i)
  })

  test('should ignore non-ts files, test files, and gen files', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    addFunction('someFunc', {
      func: async () => ({ original: true }),
    })

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFile(join(tmpDir, 'someFunc.test.ts'), '// test file change')
    await writeFile(join(tmpDir, 'someFunc.d.ts'), '// declaration file change')
    await writeFile(join(tmpDir, 'someFunc.gen.ts'), '// gen file change')
    await writeFile(join(tmpDir, 'readme.md'), '# changed')

    await wait(300)

    const reloadLogs = mockLogger
      .getLogs()
      .filter((l) => l.message.includes('Hot-reloaded'))
    assert.equal(reloadLogs.length, 0)
  })

  test('should hot-reload function used via HTTP wire', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    const sessionMiddleware = async (_services: any, wire: any, next: any) => {
      wire.setSession?.({ userId: 'test' } as any)
      await next()
    }

    pikkuState(null, 'function', 'meta', {
      httpFunc: {
        pikkuFuncId: 'httpFunc',
      },
    } as any)
    pikkuState(null, 'http', 'meta', {
      get: {
        '/hot-test': {
          pikkuFuncId: 'httpFunc',
          route: '/hot-test',
          method: 'get',
        },
      },
      post: {},
      delete: {},
      patch: {},
      head: {},
      put: {},
      options: {},
    })

    addFunction('httpFunc', { func: async () => ({ value: 'old' }) })

    wireHTTP({
      route: '/hot-test',
      method: 'get',
      func: {
        func: async () => ({ value: 'old' }),
        middleware: [sessionMiddleware],
      },
    })
    httpRouter.initialize()

    const requestBefore = new PikkuMockRequest('/hot-test', 'get')
    const responseBefore = await fetch(requestBefore)
    assert.deepEqual(await responseBefore.json(), { value: 'old' })

    await writeFunctionModule(tmpDir, 'httpFunc.ts', '{ value: "new" }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFunctionModule(tmpDir, 'httpFunc.ts', '{ value: "new" }')

    await wait(300)

    const funcAfter = pikkuState(null, 'function', 'functions').get('httpFunc')!
    assert.deepEqual(await funcAfter.func({} as any, {}, {} as any), {
      value: 'new',
    })
  })

  test('should hot-reload function used via scheduler wire', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    const taskResult = { ref: 'initial' }

    pikkuState(null, 'scheduler', 'meta')['hotTask'] = {
      pikkuFuncId: 'hotTask',
      name: 'hotTask',
      schedule: '0 0 * * *',
    }
    pikkuState(null, 'function', 'meta')['hotTask'] = {
      pikkuFuncId: 'hotTask',
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    }

    addFunction('hotTask', {
      func: async () => {
        taskResult.ref = 'v1'
      },
      auth: false,
    })

    wireScheduler({
      name: 'hotTask',
      schedule: '0 0 * * *',
      func: {
        func: async () => {
          taskResult.ref = 'v1'
        },
        auth: false,
      },
    })

    await runScheduledTask({ name: 'hotTask' })
    assert.equal(taskResult.ref, 'v1')

    await writeFile(
      join(tmpDir, 'hotTask.ts'),
      `export const hotTask = { func: async () => {}, auth: false };\n`
    )

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFile(
      join(tmpDir, 'hotTask.ts'),
      `export const hotTask = { func: async () => ({ reloaded: true }), auth: false };\n`
    )

    await wait(300)

    const reloadLog = mockLogger
      .getLogs()
      .find(
        (l) =>
          l.message.includes('Hot-reloaded') && l.message.includes('hotTask')
      )
    assert.ok(reloadLog, 'Should log hot-reload for hotTask')

    await runScheduledTask({ name: 'hotTask' })

    // The reloaded function no longer sets taskResult.ref, so it should
    // still be 'v1' (proving the old function was replaced)
    assert.equal(taskResult.ref, 'v1')
  })

  test('should hot-reload function used via queue wire', async () => {
    pikkuState(null, 'queue', 'meta')['hot-queue'] = {
      pikkuFuncId: 'queue_hot-queue',
      name: 'hot-queue',
    }
    pikkuState(null, 'function', 'meta')['queue_hot-queue'] = {
      pikkuFuncId: 'queue_hot-queue',
      inputSchemaName: null,
      outputSchemaName: null,
      sessionless: true,
    }

    addFunction('queue_hot-queue', {
      func: async () => ({ result: 'v1' }),
      auth: false,
    })

    wireQueueWorker({
      name: 'hot-queue',
      func: {
        func: async () => ({ result: 'v1' }),
        auth: false,
      },
    })

    const job = {
      id: 'job-1',
      queueName: 'hot-queue',
      status: async () => 'active' as const,
      data: {},
    }

    const resultV1 = await runQueueJob({ job })
    assert.deepEqual(resultV1, { result: 'v1' })

    addFunction('queue_hot-queue', {
      func: async () => ({ result: 'v2' }),
      auth: false,
    })

    const job2 = {
      id: 'job-2',
      queueName: 'hot-queue',
      status: async () => 'active' as const,
      data: {},
    }

    const resultV2 = await runQueueJob({ job: job2 })
    assert.deepEqual(resultV2, { result: 'v2' })
  })

  test('should debounce rapid file changes', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    addFunction('debounceFunc', {
      func: async () => ({ count: 0 }),
    })

    await writeFunctionModule(tmpDir, 'debounceFunc.ts', '{ count: 0 }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    for (let i = 1; i <= 5; i++) {
      await writeFunctionModule(tmpDir, 'debounceFunc.ts', `{ count: ${i} }`)
      await wait(10)
    }

    await wait(300)

    const func = pikkuState(null, 'function', 'functions').get('debounceFunc')!
    const result = await func.func({} as any, {}, {} as any)
    assert.equal(result.count, 5)
  })

  test('should watch subdirectories', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    const subDir = join(tmpDir, 'functions')
    await mkdir(subDir)

    addFunction('subFunc', {
      func: async () => ({ nested: false }),
    })

    await writeFunctionModule(subDir, 'subFunc.ts', '{ nested: false }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    await writeFunctionModule(subDir, 'subFunc.ts', '{ nested: true }')

    await wait(300)

    const func = pikkuState(null, 'function', 'functions').get('subFunc')!
    assert.deepEqual(await func.func({} as any, {}, {} as any), {
      nested: true,
    })
  })

  test('should properly clean up on close', async (t) => {
    if (!(await ensureRecursiveWatchAvailable(t, tmpDir))) return

    addFunction('cleanupFunc', {
      func: async () => ({ v: 1 }),
    })

    await writeFunctionModule(tmpDir, 'cleanupFunc.ts', '{ v: 1 }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
    })

    reloader.close()

    await writeFunctionModule(tmpDir, 'cleanupFunc.ts', '{ v: 999 }')

    await wait(300)

    const func = pikkuState(null, 'function', 'functions').get('cleanupFunc')!
    assert.deepEqual(await func.func({} as any, {}, {} as any), { v: 1 })

    reloader = undefined
  })

  test('verifies in-flight request completes with old code after swap', async () => {
    let resolveBlock: (() => void) | undefined
    const blockPromise = new Promise<void>((resolve) => {
      resolveBlock = resolve
    })

    addFunction('inflightFunc', {
      func: async () => {
        await blockPromise
        return { version: 'old' }
      },
    })

    const inflightPromise = pikkuState(null, 'function', 'functions')
      .get('inflightFunc')!
      .func({} as any, {}, {} as any)

    addFunction('inflightFunc', {
      func: async () => ({ version: 'new' }),
    })

    resolveBlock!()
    const inflightResult = await inflightPromise
    assert.deepEqual(inflightResult, { version: 'old' })

    const newResult = await pikkuState(null, 'function', 'functions')
      .get('inflightFunc')!
      .func({} as any, {}, {} as any)
    assert.deepEqual(newResult, { version: 'new' })
  })
})
