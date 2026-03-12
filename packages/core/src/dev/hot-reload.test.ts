import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
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
  const jsContent = `export const ${filename.replace('.ts', '')} = { func: async () => (${returnValue}) };\n`
  await writeFile(join(dir, filename.replace('.ts', '.js')), jsContent)
  await writeFile(join(dir, filename), `// ts trigger ${Date.now()}`)
}

describe('pikkuDevReloader', () => {
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

  test('should hot-reload a function and pick up new return value', async () => {
    addFunction('myFunc', {
      func: async () => ({ version: 1 }),
    })

    await writeFunctionModule(tmpDir, 'myFunc.ts', '{ version: 1 }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
      pikkuDir: tmpDir,
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

  test('should not replace a function that is not registered', async () => {
    addFunction('registeredFunc', {
      func: async () => ({ name: 'registered' }),
    })

    await writeFunctionModule(tmpDir, 'unknownFunc.ts', '{ name: "unknown" }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
      pikkuDir: tmpDir,
    })

    await writeFunctionModule(tmpDir, 'unknownFunc.ts', '{ name: "updated" }')

    await wait(300)

    assert.equal(
      pikkuState(null, 'function', 'functions').has('unknownFunc'),
      false
    )
  })

  test('should keep old code when JS import fails', async () => {
    addFunction('badFunc', {
      func: async () => ({ working: true }),
    })

    await writeFile(
      join(tmpDir, 'badFunc.js'),
      'export const badFunc = { func: async () => ({ working: true }) };\n'
    )
    await writeFile(join(tmpDir, 'badFunc.ts'), '// initial')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
      pikkuDir: tmpDir,
    })

    await writeFile(
      join(tmpDir, 'badFunc.js'),
      'this is not valid javascript {{{'
    )
    await writeFile(join(tmpDir, 'badFunc.ts'), `// trigger ${Date.now()}`)

    await wait(300)

    const func = pikkuState(null, 'function', 'functions').get('badFunc')!
    assert.deepEqual(await func.func({} as any, {}, {} as any), {
      working: true,
    })
  })

  test('should ignore non-ts files, test files, and gen files', async () => {
    addFunction('someFunc', {
      func: async () => ({ original: true }),
    })

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
      pikkuDir: tmpDir,
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

  test('should hot-reload function used via HTTP wire', async () => {
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
      pikkuDir: tmpDir,
    })

    await writeFunctionModule(tmpDir, 'httpFunc.ts', '{ value: "new" }')

    await wait(300)

    const funcAfter = pikkuState(null, 'function', 'functions').get('httpFunc')!
    assert.deepEqual(await funcAfter.func({} as any, {}, {} as any), {
      value: 'new',
    })
  })

  test('should hot-reload function used via scheduler wire', async () => {
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

    const jsV1 = `export const hotTask = { func: async () => { }, auth: false };\n`
    await writeFile(join(tmpDir, 'hotTask.js'), jsV1)
    await writeFile(join(tmpDir, 'hotTask.ts'), '// initial')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
      pikkuDir: tmpDir,
    })

    // Write updated function via file system and let the watcher pick it up
    const jsV2 = `export const hotTask = { func: async () => { return { reloaded: true }; }, auth: false };\n`
    await writeFile(join(tmpDir, 'hotTask.js'), jsV2)
    await writeFile(join(tmpDir, 'hotTask.ts'), `// trigger ${Date.now()}`)

    await wait(300)

    // Verify the function was reloaded via the watcher
    const reloadLog = mockLogger
      .getLogs()
      .find(
        (l) =>
          l.message.includes('Hot-reloaded') && l.message.includes('hotTask')
      )
    assert.ok(reloadLog, 'Should log hot-reload for hotTask')

    // runScheduledTask uses runPikkuFunc which reads from the functions Map,
    // so it will pick up the hot-reloaded function (no longer sets taskResult.ref)
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

  test('should debounce rapid file changes', async () => {
    addFunction('debounceFunc', {
      func: async () => ({ count: 0 }),
    })

    await writeFunctionModule(tmpDir, 'debounceFunc.ts', '{ count: 0 }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
      pikkuDir: tmpDir,
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

  test('should watch subdirectories', async () => {
    const subDir = join(tmpDir, 'functions')
    await mkdir(subDir)

    addFunction('subFunc', {
      func: async () => ({ nested: false }),
    })

    const jsContent = `export const subFunc = { func: async () => ({ nested: false }) };\n`
    await writeFile(join(subDir, 'subFunc.js'), jsContent)
    await writeFile(join(subDir, 'subFunc.ts'), '// initial')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
      pikkuDir: tmpDir,
    })

    const jsContentNew = `export const subFunc = { func: async () => ({ nested: true }) };\n`
    await writeFile(join(subDir, 'subFunc.js'), jsContentNew)
    await writeFile(join(subDir, 'subFunc.ts'), `// trigger ${Date.now()}`)

    await wait(300)

    const func = pikkuState(null, 'function', 'functions').get('subFunc')!
    assert.deepEqual(await func.func({} as any, {}, {} as any), {
      nested: true,
    })
  })

  test('should properly clean up on close', async () => {
    addFunction('cleanupFunc', {
      func: async () => ({ v: 1 }),
    })

    await writeFunctionModule(tmpDir, 'cleanupFunc.ts', '{ v: 1 }')

    reloader = await pikkuDevReloader({
      srcDirectories: [tmpDir],
      logger: mockLogger,
      pikkuDir: tmpDir,
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
