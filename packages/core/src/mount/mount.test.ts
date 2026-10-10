import { afterEach, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { pikkuState, resetPikkuState } from '../pikku-state.js'
import { addSchema } from '../schema.js'
import { UnprocessableContentError } from '../errors/errors.js'
import { fetch } from '../wirings/http/http-runner.js'
import { httpRouter } from '../wirings/http/routers/http-router.js'
import {
  MCPError,
  runMCPPrompt,
  runMCPResource,
  runMCPTool,
} from '../wirings/mcp/mcp-runner.js'
import { executeCLI } from '../wirings/cli/cli-runner.js'
import { mountHTTPRoutes } from './mount-http-routes.js'
import { mountMCP } from './mount-mcp.js'
import {
  getMountedPackages,
  mountPackage,
  unmountPackage,
} from './mount-package.js'

const PKG = '@acme/studio-extension'

const logger = { debug() {}, info() {}, warn() {}, error() {} }

const emptyHTTPMeta = () => ({
  get: {},
  post: {},
  delete: {},
  patch: {},
  head: {},
  put: {},
  options: {},
})

const hostSecrets = {
  getSecret: async (key: string) => `value-of-${key}`,
  hasSecret: async () => true,
  setSecret: async () => {},
  deleteSecret: async () => {},
  getSecrets: async () => ({}),
}

const schemaService = {
  compileSchema() {},
  validateSchema(schema: string, data: any) {
    if (schema.endsWith('PkgInput') && typeof data?.n !== 'number') {
      throw new UnprocessableContentError('n must be a number')
    }
  },
  getSchemaNames: () => new Set<string>(),
  getSchemaKeys: () => [] as string[],
}

const funcMeta = (id: string, extra: Record<string, unknown> = {}) => ({
  pikkuFuncId: id,
  name: id,
  sessionless: true,
  inputSchemaName: null,
  outputSchemaName: null,
  inputs: [],
  outputs: [],
  services: { optimized: false, services: [] },
  ...extra,
})

const registerPackageFunction = (
  id: string,
  func: (services: any, data: any) => unknown,
  config: Record<string, unknown> = {},
  meta: Record<string, unknown> = {}
) => {
  pikkuState(PKG, 'function', 'meta')[id] = funcMeta(id, meta) as never
  pikkuState(PKG, 'function', 'functions').set(id, { func, ...config } as never)
}

const snapshot = () => ({
  http: JSON.stringify(pikkuState(null, 'http', 'meta')),
  routes: [...pikkuState(null, 'http', 'routes').entries()].map(([m, r]) => [
    m,
    [...r.keys()],
  ]),
  tools: Object.keys(pikkuState(null, 'mcp', 'toolsMeta')),
  resources: Object.keys(pikkuState(null, 'mcp', 'resourcesMeta')),
  resourceWirings: [...pikkuState(null, 'mcp', 'resources').keys()],
  prompts: Object.keys(pikkuState(null, 'mcp', 'promptsMeta')),
  promptWirings: [...pikkuState(null, 'mcp', 'prompts').keys()],
  cli: JSON.stringify(pikkuState(null, 'cli', 'meta')),
  cliPrograms: JSON.stringify(pikkuState(null, 'cli', 'programs')),
  packageFunctions: [...pikkuState(PKG, 'function', 'functions').keys()],
  packageMeta: Object.keys(pikkuState(PKG, 'function', 'meta')),
})

const call = (path: string, init: RequestInit = {}) =>
  fetch(new Request(`http://host.test${path}`, init))

const httpRoute = (
  route: string,
  pikkuFuncId: string,
  method: 'get' | 'post' = 'get',
  extra: Record<string, unknown> = {}
) => ({ meta: { pikkuFuncId, route, method, ...extra } as never })

beforeEach(() => {
  resetPikkuState()
  httpRouter.reset()
  pikkuState(null, 'http', 'meta', emptyHTTPMeta() as never)
  pikkuState(null, 'package', 'singletonServices', {
    logger,
    secrets: hostSecrets,
    schema: schemaService,
  } as never)
  pikkuState(null, 'package', 'factories', {
    createWireServices: async () => ({}),
  } as never)
  pikkuState(null, 'cli', 'meta', {
    programs: { pikku: { program: 'pikku', commands: {}, options: {} } },
    renderers: {},
  })
  pikkuState(null, 'cli', 'programs', {
    pikku: {
      defaultRenderer: () => {},
      middleware: [],
      renderers: {},
    },
  })
})

afterEach(() => {
  for (const mounted of getMountedPackages()) mounted.unmount()
  resetPikkuState()
  httpRouter.reset()
})

describe('mountHTTPRoutes', () => {
  test('serves a package route through the http runner with the package schema', async () => {
    pikkuState(PKG, 'function', 'meta')['echo'] = funcMeta('echo', {
      inputSchemaName: 'PkgInput',
    }) as never
    addSchema(
      'PkgInput',
      { type: 'object', properties: { n: { type: 'number' } } },
      PKG
    )
    registerPackageFunction(
      'echo',
      async (_s, data) => ({ ...data, ran: 'package' }),
      {},
      { inputSchemaName: 'PkgInput' }
    )
    const handle = mountHTTPRoutes({
      packageName: PKG,
      routes: [
        { ...httpRoute('/ext/echo', 'echo', 'post'), wiring: { auth: false } },
      ],
    })
    assert.deepEqual(handle.added, ['POST /ext/echo'])
    assert.equal(
      pikkuState(null, 'http', 'meta').post['/ext/echo']?.packageName,
      PKG
    )

    const ok = await call('/ext/echo', {
      method: 'post',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n: 2 }),
    })
    assert.equal(ok.status, 200)
    assert.deepEqual(await ok.json(), { n: 2, ran: 'package' })

    const bad = await call('/ext/echo', {
      method: 'post',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ n: 'x' }),
    })
    assert.equal(bad.status, 422)
  })

  test('route auth from the mount is enforced', async () => {
    registerPackageFunction('open', async () => ({ ok: true }))
    mountHTTPRoutes({
      packageName: PKG,
      routes: [
        { ...httpRoute('/ext/open', 'open'), wiring: { auth: false } },
        { ...httpRoute('/ext/closed', 'open'), wiring: { auth: true } },
      ],
    })
    assert.equal((await call('/ext/open')).status, 200)
    assert.equal((await call('/ext/closed')).status, 401)
  })

  test('permissions declared by the package function are enforced', async () => {
    registerPackageFunction('guarded', async () => ({ ok: true }), {
      permissions: { never: async () => false },
    })
    mountHTTPRoutes({
      packageName: PKG,
      routes: [
        { ...httpRoute('/ext/guarded', 'guarded'), wiring: { auth: false } },
      ],
    })
    assert.equal((await call('/ext/guarded')).status, 403)
  })

  test('mounted route middleware runs before the package function', async () => {
    registerPackageFunction('open', async () => ({ ok: true }))
    mountHTTPRoutes({
      packageName: PKG,
      routes: [
        {
          ...httpRoute('/ext/mw', 'open'),
          wiring: {
            auth: false,
            middleware: [
              async (_s: unknown, wire: any) => {
                wire.http.response.status(418)
                throw new Error('stop')
              },
            ],
          },
        },
      ],
    })
    assert.notEqual((await call('/ext/mw')).status, 200)
  })

  test('host secrets stay unreadable to the mounted package', async () => {
    pikkuState(PKG, 'package', 'declaredSecrets', ['OWN_KEY'])
    const seen: Record<string, string> = {}
    registerPackageFunction('secrets', async (services: any) => {
      try {
        await services.secrets.getSecret('HOST_ONLY')
        seen.inFunction = 'readable'
      } catch {
        seen.inFunction = 'denied'
      }
      return {}
    })
    mountHTTPRoutes({
      packageName: PKG,
      routes: [
        {
          ...httpRoute('/ext/secrets', 'secrets'),
          wiring: {
            auth: false,
            middleware: [
              async (
                services: any,
                _wire: unknown,
                next: () => Promise<void>
              ) => {
                seen.own = await services.secrets.getSecret('OWN_KEY')
                try {
                  await services.secrets.getSecret('HOST_ONLY')
                  seen.host = 'readable'
                } catch (error) {
                  seen.host = (error as Error).message
                }
                await next()
              },
            ],
          },
        },
      ],
    })
    assert.equal((await call('/ext/secrets')).status, 200)
    assert.deepEqual(seen, {
      own: 'value-of-OWN_KEY',
      host: 'Access denied to secret key: HOST_ONLY',
      inFunction: 'denied',
    })
  })

  test('refuses collisions without changing anything', () => {
    registerPackageFunction('open', async () => ({}))
    pikkuState(null, 'http', 'meta').get['/users/:id'] = {
      pikkuFuncId: 'host',
      route: '/users/:id',
      method: 'get',
    } as never
    const before = snapshot()
    assert.throws(
      () =>
        mountHTTPRoutes({
          packageName: PKG,
          routes: [httpRoute('/users/:id', 'open')],
        }),
      /collides/
    )
    assert.throws(
      () =>
        mountHTTPRoutes({
          packageName: PKG,
          routes: [httpRoute('/users/:name', 'open')],
        }),
      /collides/
    )
    assert.throws(
      () =>
        mountHTTPRoutes({
          packageName: PKG,
          routes: [httpRoute('/ext/a', 'open'), httpRoute('/ext/a', 'open')],
        }),
      /mounted twice/
    )
    assert.throws(
      () =>
        mountHTTPRoutes({
          packageName: PKG,
          routes: [httpRoute('/ext/a', 'open'), httpRoute('/ext/b', 'missing')],
        }),
      /has not registered/
    )
    assert.deepEqual(snapshot(), before)
  })

  test('unmount removes the route and leaves no trace', async () => {
    const before = snapshot()
    pikkuState(PKG, 'function', 'meta')['fresh'] = funcMeta('fresh') as never
    const handle = mountHTTPRoutes({
      packageName: PKG,
      routes: [
        {
          ...httpRoute('/ext/new', 'fresh'),
          wiring: { auth: false, func: { func: async () => ({ ok: true }) } },
        },
      ],
    })
    assert.equal((await call('/ext/new')).status, 200)
    handle.unmount()
    assert.equal((await call('/ext/new')).status, 404)
    const again = mountHTTPRoutes({
      packageName: PKG,
      routes: [
        {
          ...httpRoute('/ext/new', 'fresh'),
          wiring: { auth: false, func: { func: async () => ({ ok: true }) } },
        },
      ],
    })
    assert.equal((await call('/ext/new')).status, 200)
    assert.deepEqual(again.unmount(), ['GET /ext/new'])
    assert.equal((await call('/ext/new')).status, 404)
    delete pikkuState(PKG, 'function', 'meta')['fresh']
    assert.deepEqual(snapshot(), before)
  })

  test('host routes mounted earlier keep working after a mount and unmount', async () => {
    pikkuState(null, 'function', 'meta')['hostFn'] = funcMeta('hostFn') as never
    pikkuState(null, 'function', 'functions').set('hostFn', {
      func: async () => ({ host: true }),
    } as never)
    pikkuState(null, 'http', 'meta').get['/host'] = {
      pikkuFuncId: 'hostFn',
      route: '/host',
      method: 'get',
    } as never
    pikkuState(null, 'http', 'routes').set(
      'get',
      new Map([
        ['/host', { route: '/host', method: 'get', auth: false } as never],
      ])
    )
    assert.equal((await call('/host')).status, 200)
    registerPackageFunction('open', async () => ({}))
    const handle = mountHTTPRoutes({
      packageName: PKG,
      routes: [{ ...httpRoute('/ext/x', 'open'), wiring: { auth: false } }],
    })
    assert.equal((await call('/host')).status, 200)
    handle.unmount()
    assert.equal((await call('/host')).status, 200)
  })
})

describe('mountMCP', () => {
  const toolMeta = (pikkuFuncId: string) =>
    ({
      pikkuFuncId,
      name: 'x',
      description: 'd',
      inputSchema: null,
      outputSchema: null,
    }) as never

  test('calls a package tool, resource and prompt', async () => {
    registerPackageFunction('toolFn', async (_s, data) => ({ got: data.v }))
    registerPackageFunction('resFn', async () => [
      { uri: 'ext://a/1', text: 'doc' },
    ])
    registerPackageFunction('promptFn', async () => [
      { role: 'user', content: { type: 'text', text: 'hi' } },
    ])
    mountMCP({
      packageName: PKG,
      tools: { ext_tool: { meta: toolMeta('toolFn') } },
      resources: { 'ext://a/{id}': { meta: toolMeta('resFn'), wiring: {} } },
      prompts: {
        ext_prompt: {
          meta: { ...(toolMeta('promptFn') as object), arguments: [] } as never,
          wiring: {},
        },
      },
    })
    const tool = await runMCPTool(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { v: 7 } },
      {},
      'ext_tool'
    )
    assert.deepEqual(tool.result, [
      { type: 'text', text: JSON.stringify({ got: 7 }) },
    ])
    const resource = await runMCPResource(
      { jsonrpc: '2.0', id: 2, method: 'resources/read', params: {} },
      {},
      'ext://a/1'
    )
    assert.deepEqual(resource.result, [{ uri: 'ext://a/1', text: 'doc' }])
    const prompt = await runMCPPrompt(
      { jsonrpc: '2.0', id: 3, method: 'prompts/get', params: {} },
      {},
      'ext_prompt'
    )
    assert.equal((prompt.result as unknown[]).length, 1)
  })

  test('tool auth and package secret scoping apply', async () => {
    pikkuState(PKG, 'package', 'declaredSecrets', [])
    registerPackageFunction(
      'needsSession',
      async () => ({}),
      {},
      { sessionless: false }
    )
    registerPackageFunction('peek', async (services: any) =>
      services.secrets.getSecret('HOST_ONLY')
    )
    mountMCP({
      packageName: PKG,
      tools: {
        gated: { meta: toolMeta('needsSession') },
        peek: { meta: toolMeta('peek') },
      },
    })
    await assert.rejects(
      runMCPTool(
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
        {},
        'gated'
      ),
      (error: unknown) => error instanceof MCPError
    )
    await assert.rejects(
      runMCPTool(
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: {} },
        {},
        'peek'
      ),
      (error: unknown) => error instanceof MCPError
    )
  })

  test('collisions throw and leave nothing behind; unmount leaves no trace', async () => {
    registerPackageFunction('toolFn', async () => ({}))
    registerPackageFunction('resFn', async () => [])
    pikkuState(null, 'mcp', 'toolsMeta')['taken'] = toolMeta('toolFn')
    const before = snapshot()
    assert.throws(
      () =>
        mountMCP({
          packageName: PKG,
          resources: { 'ext://r': { meta: toolMeta('resFn'), wiring: {} } },
          tools: { taken: { meta: toolMeta('toolFn') } },
        }),
      /already defined/
    )
    assert.deepEqual(snapshot(), before)
    const handle = mountMCP({
      packageName: PKG,
      tools: { fresh: { meta: toolMeta('toolFn') } },
      resources: { 'ext://r': { meta: toolMeta('resFn'), wiring: {} } },
    })
    assert.deepEqual(handle.unmount(), ['tool:fresh', 'resource:ext://r'])
    assert.deepEqual(snapshot(), before)
    await assert.rejects(
      runMCPTool(
        { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} },
        {},
        'fresh'
      )
    )
  })
})

describe('mountPackage', () => {
  const build = () => {
    registerPackageFunction('toolFn', async () => ({ ok: true }))
    registerPackageFunction('open', async () => ({ ok: true }))
    registerPackageFunction('hello', async () => ({ hi: true }))
    return {
      name: 'studio-ext',
      packageName: PKG,
      wirings: {
        cli: {
          program: 'pikku',
          name: 'ext',
          meta: {
            pikkuFuncId: '',
            positionals: [],
            options: {},
            subcommands: {
              hello: { pikkuFuncId: 'hello', positionals: [], options: {} },
            },
          },
          commands: { hello: { func: async () => ({}), auth: false } },
        },
        http: [{ ...httpRoute('/ext/open', 'open'), wiring: { auth: false } }],
        mcp: {
          tools: {
            ext_tool: {
              meta: {
                pikkuFuncId: 'toolFn',
                inputSchema: null,
                outputSchema: null,
              } as never,
            },
          },
        },
      },
    }
  }

  test('mounts every wiring, then unmounts all of it', async () => {
    const extension = build()
    const before = snapshot()
    const mounted = mountPackage(extension)
    assert.deepEqual(mounted.added, {
      cli: ['ext'],
      http: ['GET /ext/open'],
      mcp: ['tool:ext_tool'],
    })
    assert.equal((await call('/ext/open')).status, 200)
    assert.ok(pikkuState(null, 'mcp', 'toolsMeta')['ext_tool'])
    assert.ok(
      (pikkuState(null, 'cli', 'meta') as any).programs.pikku.commands.ext
    )
    assert.throws(() => mountPackage(extension), /already mounted/)

    assert.deepEqual(unmountPackage('studio-ext'), mounted.added)
    assert.equal((await call('/ext/open')).status, 404)
    assert.deepEqual(snapshot(), before)
    assert.equal(getMountedPackages().length, 0)
  })

  test('a failing wiring rolls back the ones already mounted', () => {
    const extension = build()
    pikkuState(null, 'mcp', 'toolsMeta')['ext_tool'] = {
      pikkuFuncId: 'x',
    } as never
    const before = snapshot()
    assert.throws(() => mountPackage(extension), /already defined/)
    assert.deepEqual(snapshot(), before)
    assert.equal(getMountedPackages().length, 0)
  })

  test('the mounted cli command runs', async () => {
    const out: unknown[] = []
    const mounted = mountPackage(build())
    pikkuState(null, 'cli', 'programs').pikku!.defaultRenderer = (
      _s: unknown,
      data: unknown
    ) => {
      out.push(data)
    }
    await executeCLI({
      programName: 'pikku',
      args: ['ext', 'hello'],
      createSingletonServices: async () => ({ logger }) as never,
    })
    assert.deepEqual(out, [{ hi: true }])
    mounted.unmount()
  })
})
