import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/internal'

import { PikkuNodeHTTPServer } from './pikku-node-http-server.js'

const createMockLogger = () => ({
  info: (_msg: string) => {},
  warn: (_msg: string) => {},
  error: (_msg: string | Error) => {},
  debug: (_msg: string) => {},
  setLevel: () => {},
})

const createMockJwt = () => ({
  encode: async (_expiresIn: any, payload: any) =>
    Buffer.from(JSON.stringify(payload)).toString('base64url'),
  decode: async <T>(token: string) =>
    JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as T,
})

const createSignedAssetUrl = async (options?: {
  origin?: string
  path?: string
  signedAt?: number
  expiresAt?: number
  notBefore?: number
  jwt?: ReturnType<typeof createMockJwt>
}) => {
  const origin = options?.origin ?? 'http://127.0.0.1:3000'
  const path = options?.path ?? '/assets/uploads/hello.txt'
  const signedAt = options?.signedAt ?? Date.now()
  const expiresAt = options?.expiresAt ?? Date.now() + 60_000
  const notBefore = options?.notBefore
  const url = new URL(`${origin}${path}`)
  url.searchParams.set('signedAt', String(signedAt))
  url.searchParams.set('expiresAt', String(expiresAt))
  if (notBefore != null) {
    url.searchParams.set('notBefore', String(notBefore))
  }
  if (options?.jwt) {
    const payload: {
      signedAt: number
      expiresAt: number
      notBefore?: number
    } = {
      signedAt,
      expiresAt,
    }
    if (notBefore != null) {
      payload.notBefore = notBefore
    }
    url.searchParams.set(
      'signature',
      await options.jwt.encode({ value: 60, unit: 'second' }, payload)
    )
  }
  return url
}

const createCapturingLogger = () => {
  const warnings: string[] = []
  const infos: string[] = []
  const capture =
    (sink: string[]) =>
    (messageOrObj: string | Record<string, any>, ..._meta: any[]) => {
      sink.push(
        typeof messageOrObj === 'string'
          ? messageOrObj
          : JSON.stringify(messageOrObj)
      )
    }
  return {
    logger: {
      info: capture(infos),
      warn: capture(warnings),
      error: (
        _messageOrObj: string | Record<string, any> | Error,
        ..._meta: any[]
      ) => {},
      debug: (
        _messageOrObj: string | Record<string, any>,
        ..._meta: any[]
      ) => {},
      setLevel: () => {},
    },
    warnings,
    infos,
  }
}

const skipContentRouteSuite = Number.parseInt(process.versions.node, 10) >= 24

describe(
  'PikkuNodeHTTPServer content routes',
  { concurrency: false, skip: skipContentRouteSuite },
  () => {
    let tmpDir: string
    let server: PikkuNodeHTTPServer | undefined

    beforeEach(async () => {
      resetPikkuState()
      tmpDir = await mkdtemp(join(tmpdir(), 'pikku-node-http-server-'))
      pikkuState(null, 'package', 'singletonServices', {
        schema: {
          compileSchema: async () => {},
          getSchemaNames: () => new Set<string>(),
        },
      } as any)
    })

    afterEach(async () => {
      if (server) {
        await server.stop()
        server = undefined
      }
      await rm(tmpDir, { recursive: true, force: true })
    })

    test('uploads files through the configured reaper path and serves them back', async () => {
      server = new PikkuNodeHTTPServer(
        {
          hostname: '127.0.0.1',
          port: 0,
          content: {
            localFileUploadPath: tmpDir,
            uploadUrlPrefix: '/reaper',
            assetUrlPrefix: '/assets',
          },
        } as any,
        createMockLogger() as any
      )

      await server.init()
      await server.start()

      const address = server.server.address()
      assert.ok(address && typeof address === 'object')
      const origin = `http://127.0.0.1:${address.port}`

      const uploadResponse = await fetch(`${origin}/reaper/uploads/hello.txt`, {
        method: 'PUT',
        headers: {
          connection: 'close',
        },
        body: Buffer.from('hello world'),
      })

      assert.equal(uploadResponse.status, 200)
      assert.equal(
        await readFile(join(tmpDir, 'uploads', 'hello.txt'), 'utf8'),
        'hello world'
      )

      const signedAssetUrl = await createSignedAssetUrl({ origin })
      const assetResponse = await fetch(signedAssetUrl, {
        headers: {
          connection: 'close',
        },
      })
      assert.equal(assetResponse.status, 200)
      assert.equal(await assetResponse.text(), 'hello world')
    })

    test('rejects upload path traversal outside the configured directory', async () => {
      server = new PikkuNodeHTTPServer(
        {
          hostname: '127.0.0.1',
          port: 0,
          content: {
            localFileUploadPath: tmpDir,
            uploadUrlPrefix: '/reaper',
            assetUrlPrefix: '/assets',
          },
        } as any,
        createMockLogger() as any
      )

      await server.init()
      await server.start()

      const address = server.server.address()
      assert.ok(address && typeof address === 'object')
      const origin = `http://127.0.0.1:${address.port}`

      const response = await fetch(`${origin}/reaper/..%2Fevil.txt`, {
        method: 'PUT',
        headers: {
          connection: 'close',
        },
        body: Buffer.from('bad'),
      })

      assert.equal(response.status, 400)
      assert.equal(await response.text(), 'Invalid path')
    })

    test('rejects unsigned asset reads', async () => {
      server = new PikkuNodeHTTPServer(
        {
          hostname: '127.0.0.1',
          port: 0,
          content: {
            localFileUploadPath: tmpDir,
            uploadUrlPrefix: '/reaper',
            assetUrlPrefix: '/assets',
          },
        } as any,
        createMockLogger() as any
      )

      await server.init()
      await server.start()

      const address = server.server.address()
      assert.ok(address && typeof address === 'object')
      const origin = `http://127.0.0.1:${address.port}`

      const uploadResponse = await fetch(`${origin}/reaper/uploads/hello.txt`, {
        method: 'PUT',
        headers: {
          connection: 'close',
        },
        body: Buffer.from('hello world'),
      })

      assert.equal(uploadResponse.status, 200)

      const assetResponse = await fetch(`${origin}/assets/uploads/hello.txt`, {
        headers: {
          connection: 'close',
        },
      })

      assert.equal(assetResponse.status, 403)
      assert.equal(await assetResponse.text(), 'Signed URL required')
    })

    test('serves assets for a valid signed URL with a jwt signature', async () => {
      const jwt = createMockJwt()
      pikkuState(null, 'package', 'singletonServices', {
        ...pikkuState(null, 'package', 'singletonServices'),
        jwt,
      })

      server = new PikkuNodeHTTPServer(
        {
          hostname: '127.0.0.1',
          port: 0,
          content: {
            localFileUploadPath: tmpDir,
            uploadUrlPrefix: '/reaper',
            assetUrlPrefix: '/assets',
          },
        } as any,
        createMockLogger() as any
      )

      await server.init()
      await server.start()

      const address = server.server.address()
      assert.ok(address && typeof address === 'object')
      const origin = `http://127.0.0.1:${address.port}`

      const uploadResponse = await fetch(`${origin}/reaper/uploads/hello.txt`, {
        method: 'PUT',
        headers: {
          connection: 'close',
        },
        body: Buffer.from('hello world'),
      })

      assert.equal(uploadResponse.status, 200)

      const signedAssetUrl = await createSignedAssetUrl({
        origin,
        jwt,
        notBefore: Date.now() - 1_000,
      })

      const assetResponse = await fetch(signedAssetUrl, {
        headers: {
          connection: 'close',
        },
      })

      assert.equal(assetResponse.status, 200)
      assert.equal(await assetResponse.text(), 'hello world')
    })

    test('rejects signed asset reads with a tampered signature window', async () => {
      const jwt = createMockJwt()
      pikkuState(null, 'package', 'singletonServices', {
        ...pikkuState(null, 'package', 'singletonServices'),
        jwt,
      })

      server = new PikkuNodeHTTPServer(
        {
          hostname: '127.0.0.1',
          port: 0,
          content: {
            localFileUploadPath: tmpDir,
            uploadUrlPrefix: '/reaper',
            assetUrlPrefix: '/assets',
          },
        } as any,
        createMockLogger() as any
      )

      await server.init()
      await server.start()

      const address = server.server.address()
      assert.ok(address && typeof address === 'object')
      const origin = `http://127.0.0.1:${address.port}`

      const uploadResponse = await fetch(`${origin}/reaper/uploads/hello.txt`, {
        method: 'PUT',
        headers: {
          connection: 'close',
        },
        body: Buffer.from('hello world'),
      })

      assert.equal(uploadResponse.status, 200)

      const signedAssetUrl = await createSignedAssetUrl({
        origin,
        jwt,
        notBefore: Date.now() - 1_000,
      })
      signedAssetUrl.searchParams.set('expiresAt', String(Date.now() + 120_000))

      const assetResponse = await fetch(signedAssetUrl, {
        headers: {
          connection: 'close',
        },
      })

      assert.equal(assetResponse.status, 403)
      assert.equal(await assetResponse.text(), 'Invalid signed URL')
    })
  }
)

const MCP_SESSION_ERROR = 'Invalid or missing session ID'

describe('PikkuNodeHTTPServer MCP mounting', { concurrency: false }, () => {
  let server: PikkuNodeHTTPServer | undefined

  beforeEach(() => {
    resetPikkuState()
    pikkuState(null, 'package', 'singletonServices', {
      schema: {
        compileSchema: async () => {},
        getSchemaNames: () => new Set<string>(),
      },
    } as any)
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = undefined
    }
  })

  const startServer = async (
    options?: ConstructorParameters<typeof PikkuNodeHTTPServer>[2],
    logger = createMockLogger()
  ) => {
    server = new PikkuNodeHTTPServer(
      { hostname: '127.0.0.1', port: 0 } as any,
      logger as any,
      options
    )
    await server.init()
    await server.start()
    const address = server.server.address()
    assert.ok(address && typeof address === 'object')
    return `http://127.0.0.1:${address.port}`
  }

  const getMcp = (origin: string) =>
    fetch(`${origin}/mcp`, { headers: { connection: 'close' } })

  test('does not mount /mcp when mcpJson is absent', async () => {
    const origin = await startServer()
    const response = await getMcp(origin)
    assert.equal(
      (await response.text()).includes(MCP_SESSION_ERROR),
      false,
      '/mcp should not be handled by the MCP server when mcpJson is absent'
    )
  })

  test('does not mount /mcp when mcpJson has no tools, resources, or prompts', async () => {
    const origin = await startServer({
      mcpJson: { tools: [], resources: [], prompts: [] },
    })
    const response = await getMcp(origin)
    assert.equal(
      (await response.text()).includes(MCP_SESSION_ERROR),
      false,
      'empty mcpJson should not mount the MCP server'
    )
  })

  test('mounts /mcp when mcpJson declares at least one tool', async () => {
    const { logger, infos } = createCapturingLogger()
    const origin = await startServer(
      { mcpJson: { tools: [{ name: 'echo' }] } },
      logger
    )

    const response = await getMcp(origin)
    // A GET to /mcp with no session is handled by the MCP server, which
    // responds with a JSON-RPC "missing session" error — proving the request
    // was routed to the mounted handler rather than the normal pikku pipeline.
    assert.equal(response.status, 400)
    assert.equal((await response.text()).includes(MCP_SESSION_ERROR), true)
    assert.ok(
      infos.some((msg) => msg.includes('MCP mounted at /mcp')),
      'expected a log line confirming the mount'
    )
  })

  test('mounts the MCP server at a configurable path', async () => {
    const { logger, infos } = createCapturingLogger()
    const origin = await startServer(
      { mcpJson: { tools: [{ name: 'echo' }] }, mcpPath: '/api/mcp' },
      logger
    )

    const mounted = await fetch(`${origin}/api/mcp`, {
      headers: { connection: 'close' },
    })
    assert.equal(mounted.status, 400)
    assert.equal((await mounted.text()).includes(MCP_SESSION_ERROR), true)
    assert.ok(
      infos.some((msg) => msg.includes('MCP mounted at /api/mcp')),
      'expected a log line confirming the configured mount path'
    )

    const defaultPath = await fetch(`${origin}/mcp`, {
      headers: { connection: 'close' },
    })
    assert.equal(
      (await defaultPath.text()).includes(MCP_SESSION_ERROR),
      false,
      'the default /mcp path must not be served when a custom path is set'
    )
  })

  test('does not route /mcp-prefixed paths to the MCP handler', async () => {
    const origin = await startServer({ mcpJson: { tools: [{ name: 'echo' }] } })
    const response = await fetch(`${origin}/mcpfoo`, {
      headers: { connection: 'close' },
    })
    const body = await response.text()
    // The MCP handler answers an unmatched path with an empty-body 404; the
    // normal pikku pipeline always returns a JSON body. A non-empty body proves
    // /mcpfoo was NOT diverted to the MCP handler.
    assert.equal(body.includes(MCP_SESSION_ERROR), false)
    assert.notEqual(body, '', '/mcpfoo must not be routed to the MCP handler')
  })

  test('logs a warning and serves normally when MCP mounting fails', async () => {
    const { logger, warnings } = createCapturingLogger()
    // A null entry makes the registry throw while reading `tool.name`, which
    // exercises the catch branch in initMCP.
    const origin = await startServer(
      { mcpJson: { tools: [null] } as any },
      logger
    )

    assert.ok(
      warnings.some((msg) => msg.includes('MCP could not be mounted')),
      'expected a warning when the MCP server fails to initialize'
    )

    const response = await getMcp(origin)
    assert.equal(
      (await response.text()).includes(MCP_SESSION_ERROR),
      false,
      'a failed mount must not leave a partial /mcp handler installed'
    )
  })
})
