import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'

import { pikkuState, resetPikkuState } from '@pikku/core/state'
import { LocalContent } from '@pikku/core/services/local-content'

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
      path: string
    } = {
      signedAt,
      expiresAt,
      path: decodeURIComponent(url.pathname),
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

      const signedUpload = await createSignedAssetUrl({
        origin,
        path: '/reaper/uploads/hello.txt',
        jwt,
      })
      const uploadResponse = await fetch(signedUpload, {
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

      const signedAssetUrl = await createSignedAssetUrl({ origin, jwt })
      const assetResponse = await fetch(signedAssetUrl, {
        headers: {
          connection: 'close',
        },
      })
      assert.equal(assetResponse.status, 200)
      assert.equal(await assetResponse.text(), 'hello world')
    })

    test('rejects upload path traversal outside the configured directory', async () => {
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

      // Signed for the escaping path itself, so the signature gate passes and
      // the path-traversal guard is what rejects it — not the signature check.
      const signedUpload = await createSignedAssetUrl({
        origin,
        path: '/reaper/..%2Fevil.txt',
        jwt,
      })
      const response = await fetch(signedUpload, {
        method: 'PUT',
        headers: {
          connection: 'close',
        },
        body: Buffer.from('bad'),
      })

      assert.equal(response.status, 400)
      assert.equal(await response.text(), 'Invalid path')
    })

    test('rejects an unsigned upload (no signature on the PUT)', async () => {
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

      const response = await fetch(`${origin}/reaper/uploads/evil.txt`, {
        method: 'PUT',
        headers: { connection: 'close' },
        body: Buffer.from('attacker-controlled'),
      })

      assert.equal(response.status, 403)
    })

    test('rejects unsigned asset reads', async () => {
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

      const signedUpload = await createSignedAssetUrl({
        origin,
        path: '/reaper/uploads/hello.txt',
        jwt,
      })
      const uploadResponse = await fetch(signedUpload, {
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

      const signedUpload = await createSignedAssetUrl({
        origin,
        path: '/reaper/uploads/hello.txt',
        jwt,
      })
      const uploadResponse = await fetch(signedUpload, {
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

      const signedUpload = await createSignedAssetUrl({
        origin,
        path: '/reaper/uploads/hello.txt',
        jwt,
      })
      const uploadResponse = await fetch(signedUpload, {
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

describe(
  'PikkuNodeHTTPServer signed asset verification',
  { concurrency: false },
  () => {
    const contentConfig = {
      localFileUploadPath: join(tmpdir(), 'pikku-signed-asset-verification'),
      uploadUrlPrefix: '/reaper',
      assetUrlPrefix: '/assets',
      server: 'http://127.0.0.1:3000',
    }

    beforeEach(() => {
      resetPikkuState()
      pikkuState(null, 'package', 'singletonServices', {
        schema: {
          compileSchema: async () => {},
          getSchemaNames: () => new Set<string>(),
        },
      } as any)
    })

    const createSigner = (jwt: ReturnType<typeof createMockJwt>) =>
      new LocalContent(contentConfig, createMockLogger() as any, jwt)

    const createServer = (
      contentSigningJWT?: ReturnType<typeof createMockJwt>
    ) =>
      new PikkuNodeHTTPServer(
        { hostname: '127.0.0.1', port: 0, content: contentConfig } as any,
        createMockLogger() as any,
        contentSigningJWT ? { contentSigningJWT } : {}
      )

    const validate = (
      server: PikkuNodeHTTPServer,
      url: string | URL
    ): Promise<{ ok: true } | { ok: false; status: number; body: string }> =>
      (server as any).validateSignedAssetRequest(new URL(url))

    test('rejects a signed URL whose path was swapped to another key', async () => {
      const jwt = createMockJwt()
      const signed = await createSigner(jwt).signContentKey({
        bucket: 'public',
        contentKey: 'thumbnail.png',
        dateLessThan: new Date(Date.now() + 60_000),
      })

      const tampered = new URL(signed)
      tampered.pathname = '/assets/private/passport-scan.png'

      const result = await validate(createServer(jwt), tampered)
      assert.equal(
        result.ok,
        false,
        'a signature for one key must not authorize another key'
      )
      assert.equal(result.ok === false && result.status, 403)
    })

    test('accepts the URL for the key it was signed for', async () => {
      const jwt = createMockJwt()
      const signed = await createSigner(jwt).signContentKey({
        bucket: 'public',
        contentKey: 'thumbnail.png',
        dateLessThan: new Date(Date.now() + 60_000),
        dateGreaterThan: new Date(Date.now() - 1_000),
      })

      const result = await validate(createServer(jwt), signed)
      assert.equal(result.ok, true)
    })

    test('accepts nested keys and keys needing url encoding', async () => {
      const jwt = createMockJwt()
      const signer = createSigner(jwt)
      const server = createServer(jwt)

      for (const contentKey of [
        'nested/deep/thumbnail.png',
        'nested/deep/my file (1).png',
        'reports/2024 Q1 & Q2.pdf',
      ]) {
        const signed = await signer.signContentKey({
          bucket: 'public',
          contentKey,
          dateLessThan: new Date(Date.now() + 60_000),
        })
        const result = await validate(server, signed)
        assert.equal(result.ok, true, `expected ${contentKey} to verify`)
      }
    })

    test('rejects an expired signed URL', async () => {
      const jwt = createMockJwt()
      const signed = await createSigner(jwt).signContentKey({
        bucket: 'public',
        contentKey: 'thumbnail.png',
        dateLessThan: new Date(Date.now() - 1_000),
      })

      const result = await validate(createServer(jwt), signed)
      assert.equal(result.ok, false)
      assert.equal(result.ok === false && result.status, 403)
    })

    test('rejects a signed URL that is not yet valid', async () => {
      const jwt = createMockJwt()
      const signed = await createSigner(jwt).signContentKey({
        bucket: 'public',
        contentKey: 'thumbnail.png',
        dateLessThan: new Date(Date.now() + 120_000),
        dateGreaterThan: new Date(Date.now() + 60_000),
      })

      const result = await validate(createServer(jwt), signed)
      assert.equal(result.ok, false)
      assert.equal(result.ok === false && result.status, 403)
    })

    test('rejects signature params when no signing key is available', async () => {
      const jwt = createMockJwt()
      const signed = await createSigner(jwt).signContentKey({
        bucket: 'public',
        contentKey: 'thumbnail.png',
        dateLessThan: new Date(Date.now() + 60_000),
      })

      const result = await validate(createServer(), signed)
      assert.equal(
        result.ok,
        false,
        'a request that cannot be verified must never be accepted'
      )
      assert.equal(result.ok === false && result.status, 403)
    })

    test('rejects forged timestamps when no signing key is available', async () => {
      const forged = new URL('http://127.0.0.1:3000/assets/private/secret.png')
      forged.searchParams.set('signedAt', '0')
      forged.searchParams.set('expiresAt', '99999999999999')

      const result = await validate(createServer(), forged)
      assert.equal(result.ok, false)
      assert.equal(result.ok === false && result.status, 403)
    })

    test('falls back to the jwt service in singleton services', async () => {
      const jwt = createMockJwt()
      pikkuState(null, 'package', 'singletonServices', {
        ...pikkuState(null, 'package', 'singletonServices'),
        jwt,
      })

      const signed = await createSigner(jwt).signContentKey({
        bucket: 'public',
        contentKey: 'thumbnail.png',
        dateLessThan: new Date(Date.now() + 60_000),
      })

      const result = await validate(createServer(), signed)
      assert.equal(result.ok, true)
    })
  }
)

// A GET with no `accept` header is refused by the MCP transport before it
// considers sessions at all, so this marker holds whatever the session
// configuration is. The normal pikku pipeline never emits it, which is what
// makes it usable as proof that a path did — or did not — reach the handler.
const MCP_HANDLER_MARKER =
  'Not Acceptable: Client must accept text/event-stream'

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
      (await response.text()).includes(MCP_HANDLER_MARKER),
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
      (await response.text()).includes(MCP_HANDLER_MARKER),
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
    // A GET to /mcp without an `accept` header is handled by the MCP server,
    // which refuses it as not acceptable — proving the request was routed to
    // the mounted handler rather than the normal pikku pipeline.
    assert.equal(response.status, 406)
    assert.equal((await response.text()).includes(MCP_HANDLER_MARKER), true)
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
    assert.equal(mounted.status, 406)
    assert.equal((await mounted.text()).includes(MCP_HANDLER_MARKER), true)
    assert.ok(
      infos.some((msg) => msg.includes('MCP mounted at /api/mcp')),
      'expected a log line confirming the configured mount path'
    )

    const defaultPath = await fetch(`${origin}/mcp`, {
      headers: { connection: 'close' },
    })
    assert.equal(
      (await defaultPath.text()).includes(MCP_HANDLER_MARKER),
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
    assert.equal(body.includes(MCP_HANDLER_MARKER), false)
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
      (await response.text()).includes(MCP_HANDLER_MARKER),
      false,
      'a failed mount must not leave a partial /mcp handler installed'
    )
  })
})

describe('PikkuNodeHTTPServer dispatch routes', { concurrency: false }, () => {
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

  const dispatch = (
    origin: string,
    path: string,
    headers: Record<string, string> = {}
  ) =>
    fetch(`${origin}${path}`, {
      method: 'POST',
      headers: { connection: 'close', ...headers },
      body: JSON.stringify({ taskName: 'anything', queueName: 'anything' }),
    })

  test('rejects a dispatch request when no dispatchSecret is configured', async () => {
    const origin = await startServer({ dispatchJobs: true })

    for (const path of ['/__pikku/scheduler-job', '/__pikku/queue-job']) {
      const response = await dispatch(origin, path)
      assert.equal(
        response.status,
        401,
        `${path} must fail closed when dispatchSecret is unset`
      )
    }
  })

  test('warns at startup that the dispatch routes will reject every caller', async () => {
    const { logger, warnings } = createCapturingLogger()
    await startServer({ dispatchJobs: true }, logger as any)

    assert.ok(
      warnings.some((msg) => msg.includes('dispatchSecret')),
      'expected a startup warning naming dispatchSecret'
    )
  })

  test('rejects a wrong dispatch secret, and one of the wrong length alike', async () => {
    const origin = await startServer({
      dispatchJobs: true,
      dispatchSecret: 'the-expected-dispatch-secret',
    })

    const wrong = await dispatch(origin, '/__pikku/scheduler-job', {
      'x-pikku-dispatch': 'the-provided-dispatch-secret',
    })
    assert.equal(wrong.status, 401)

    const short = await dispatch(origin, '/__pikku/scheduler-job', {
      'x-pikku-dispatch': 'short',
    })
    assert.equal(short.status, 401)

    const missing = await dispatch(origin, '/__pikku/scheduler-job')
    assert.equal(missing.status, 401)
  })

  test('lets the correct dispatch secret through to the job handler', async () => {
    const secret = 'the-expected-dispatch-secret'
    const origin = await startServer({
      dispatchJobs: true,
      dispatchSecret: secret,
    })

    const response = await dispatch(origin, '/__pikku/scheduler-job', {
      'x-pikku-dispatch': secret,
    })
    // No scheduled task is registered, so the handler answers 422
    // (ack-no-retry) — reaching it at all is what proves auth passed.
    assert.notEqual(
      response.status,
      401,
      'a matching secret must not be rejected'
    )
  })

  test('does not mount the dispatch routes when dispatchJobs is off', async () => {
    const origin = await startServer({ dispatchSecret: 'a-secret' })

    const response = await dispatch(origin, '/__pikku/scheduler-job')
    assert.notEqual(
      response.status,
      401,
      'an unmounted dispatch path must fall through to the normal pipeline'
    )
    assert.notEqual(response.status, 204)
  })
})

describe('PikkuNodeHTTPServer shutdown', { concurrency: false }, () => {
  const runShutdown = async (hooks: {
    beforeStop?: () => void | Promise<void>
    afterStop?: () => void | Promise<void>
  }) => {
    const errors: string[] = []
    const logger = {
      ...createMockLogger(),
      error: (msg: string | Error) => errors.push(String(msg)),
    }
    const server = new PikkuNodeHTTPServer(
      { port: 0, hostname: '127.0.0.1' },
      logger as any
    )
    await server.init()
    await server.start()

    const realExit = process.exit
    const exited = new Promise<void>((resolve) => {
      // The shutdown ends in process.exit, which would take the test runner
      // with it; swapping it out is the only way to observe what ran first.
      process.exit = (() => {
        resolve()
      }) as never
    })
    try {
      server.enableExitOnSignals(hooks)
      process.emit('SIGTERM' as never)
      await exited
    } finally {
      process.exit = realExit
      process.removeAllListeners('SIGTERM')
      await server.stop()
    }
    return { errors, listening: server.server.listening }
  }

  test('a rejected beforeStop does not skip the server stop', async () => {
    const { errors, listening } = await runShutdown({
      beforeStop: async () => {
        throw new Error('beforeStop exploded')
      },
    })

    assert.equal(
      listening,
      false,
      'a hook that throws must not leave the socket open'
    )
    assert.ok(errors.some((e) => /beforeStop failed during shutdown/.test(e)))
  })

  test('a rejected beforeStop does not skip afterStop', async () => {
    let afterStopRan = false
    const { errors } = await runShutdown({
      beforeStop: async () => {
        throw new Error('beforeStop exploded')
      },
      afterStop: async () => {
        afterStopRan = true
      },
    })

    assert.ok(afterStopRan, 'afterStop owes the app its teardown either way')
    assert.ok(errors.some((e) => /beforeStop failed during shutdown/.test(e)))
  })

  test('a rejected afterStop is logged rather than thrown', async () => {
    const { errors, listening } = await runShutdown({
      afterStop: async () => {
        throw new Error('afterStop exploded')
      },
    })

    assert.equal(listening, false)
    assert.ok(errors.some((e) => /afterStop failed during shutdown/.test(e)))
  })
})
