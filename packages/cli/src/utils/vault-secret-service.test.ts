import assert from 'node:assert/strict'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync, writeFileSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  VaultSecretService,
  vaultConnectionFromEnv,
  VAULT_CONNECTION_FILE_ENV,
} from './vault-secret-service.js'

const SECRET_VALUE = 'sk-live-very-secret'
const GOOD = 'good-token'

type Seen = { url: string; headers: IncomingMessage['headers']; body: any }

/** A stand-in for the vault host: POST /rpc/<fn> with the remote contract header and a bearer. */
const startHost = async (
  token: () => string = () => GOOD,
  extra?: (req: IncomingMessage, res: any, seen: Seen) => boolean
) => {
  const seen: Seen[] = []
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      const entry: Seen = {
        url: req.url ?? '',
        headers: req.headers,
        body: text ? JSON.parse(text) : undefined,
      }
      seen.push(entry)
      res.setHeader('content-type', 'application/json')
      if (extra?.(req, res, entry)) return
      if (req.headers.authorization !== `Bearer ${token()}`) {
        res.statusCode = 401
        return res.end(
          '{"name":"InvalidSessionError","message":"Unauthorized"}'
        )
      }
      const name = entry.body?.data?.name
      if (entry.url === '/rpc/vault%3AsecretGetOwn%40v1') {
        if (name === 'api') {
          return res.end(
            JSON.stringify({ value: JSON.stringify({ token: SECRET_VALUE }) })
          )
        }
        res.statusCode = 404
        return res.end('{"name":"NotFoundError","message":"Not found"}')
      }
      if (entry.url === '/rpc/vault%3AsecretHasOwn%40v1') {
        return res.end(JSON.stringify({ exists: name === 'api' }))
      }
      res.statusCode = 404
      res.end('{"name":"NotFoundError","message":"Not found"}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const stop = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  return { url, seen, stop }
}

const withDir = async (run: (dir: string) => Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-cli-'))
  try {
    await run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const writeConnection = (file: string, url: string, token: string) => {
  // Studio writes then renames, so a reader never sees half a file.
  writeFileSync(`${file}.tmp`, JSON.stringify({ url, token }), { mode: 0o600 })
  renameSync(`${file}.tmp`, file)
}

const service = (file: string, options = {}) =>
  new VaultSecretService({ file }, options)

const failure = async (run: () => Promise<unknown>): Promise<Error> => {
  try {
    await run()
  } catch (error) {
    return error as Error
  }
  throw new Error('expected a rejection')
}

test('reads over the remote contract with the bearer and the contract header', async () => {
  await withDir(async (dir) => {
    const host = await startHost()
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, host.url, GOOD)
      const secrets = service(file)
      assert.deepEqual(
        (await secrets.getSecret<{ token: string }>('api')).reveal(),
        { token: SECRET_VALUE }
      )
      assert.equal(await secrets.hasSecret('api'), true)
      assert.equal(await secrets.hasSecret('missing'), false)
      const read = host.seen[0]!
      assert.equal(read.url, '/rpc/vault%3AsecretGetOwn%40v1')
      assert.equal(read.headers.authorization, `Bearer ${GOOD}`)
      assert.ok(read.headers['x-pikku-remote-contract'] !== undefined)
      assert.deepEqual(read.body, {
        rpcName: 'vault:secretGetOwn@v1',
        data: { name: 'api' },
      })
    } finally {
      await host.stop()
    }
  })
})

test('a missing secret is not found, and getSecrets skips absent keys', async () => {
  await withDir(async (dir) => {
    const host = await startHost()
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, host.url, GOOD)
      const secrets = service(file)
      await assert.rejects(
        () => secrets.getSecret('missing'),
        /Requested secret not found: missing/
      )
      const many = await secrets.getSecrets(['api', 'missing'] as any)
      assert.deepEqual(Object.keys(many), ['api'])
    } finally {
      await host.stop()
    }
  })
})

test('read-only: set and delete throw, and the service is not durable', async () => {
  const secrets = service('/nowhere') as any
  await assert.rejects(() => secrets.setSecret(), /through Pikku Studio/)
  await assert.rejects(() => secrets.deleteSecret(), /through Pikku Studio/)
  assert.equal(secrets.durable, undefined)
})

test('a renewed token in the file is picked up after one 401', async () => {
  await withDir(async (dir) => {
    let current = 'old-token'
    const host = await startHost(() => current)
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, host.url, 'old-token')
      const secrets = service(file)
      assert.ok(await secrets.hasSecret('api'))
      current = 'new-token' // the host expired the old credential...
      writeConnection(file, host.url, 'new-token') // ...and Studio rewrote the file
      assert.equal(await secrets.hasSecret('api'), true)
      const last = host.seen.slice(-2)
      assert.equal(last[0]!.headers.authorization, 'Bearer old-token')
      assert.equal(last[1]!.headers.authorization, 'Bearer new-token')
    } finally {
      await host.stop()
    }
  })
})

test('a connection error picks up a new host URL from the file, once', async () => {
  await withDir(async (dir) => {
    const first = await startHost()
    const second = await startHost()
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, first.url, GOOD)
      const secrets = service(file)
      assert.equal(await secrets.hasSecret('api'), true)
      await first.stop() // host restarted on another port
      writeConnection(file, second.url, GOOD)
      assert.equal(await secrets.hasSecret('api'), true)
      assert.equal(second.seen.length, 1)
    } finally {
      await first.stop()
      await second.stop()
    }
  })
})

test('an invalid or expired token is an error after exactly one retry, naming no token or value', async () => {
  await withDir(async (dir) => {
    const host = await startHost()
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, host.url, 'wrong-token-xyz')
      const secrets = service(file)
      const error = await failure(() => secrets.getSecret('api'))
      assert.match(error.message, /401/)
      assert.doesNotMatch(
        error.message + String(error.stack),
        /wrong-token-xyz|sk-live/
      )
      assert.equal(host.seen.length, 2) // first try plus one retry, not a loop
      await assert.rejects(() => secrets.hasSecret('api'), /401/)
    } finally {
      await host.stop()
    }
  })
})

test('a failing host rejects with the status and never echoes its body', async () => {
  await withDir(async (dir) => {
    const host = await startHost(
      () => GOOD,
      (_req, res) => {
        res.statusCode = 500
        res.end(JSON.stringify({ message: `leak ${SECRET_VALUE}` }))
        return true
      }
    )
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, host.url, GOOD)
      const error = await failure(() => service(file).getSecret('api'))
      assert.match(error.message, /500/)
      assert.doesNotMatch(error.message, /sk-live/)
    } finally {
      await host.stop()
    }
  })
})

test('an unreachable host is a clear error that does not include the token', async () => {
  await withDir(async (dir) => {
    const host = await startHost()
    const url = host.url
    await host.stop()
    const file = join(dir, 'vault.json')
    writeConnection(file, url, 'tok-abc-123')
    const error = await failure(() => service(file).getSecret('api'))
    assert.match(error.message, /unreachable/i)
    assert.doesNotMatch(error.message, /tok-abc-123/)
  })
})

test('a host that never answers times out instead of hanging', async () => {
  await withDir(async (dir) => {
    const host = await startHost(
      () => GOOD,
      () => true
    )
    // never ends the response
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, host.url, GOOD)
      await assert.rejects(
        () => service(file, { timeoutMs: 100 }).getSecret('api'),
        /unreachable|did not answer/i
      )
    } finally {
      await host.stop()
    }
  })
})

test('a junk 200 body rejects instead of crashing', async () => {
  await withDir(async (dir) => {
    const host = await startHost(
      () => GOOD,
      (_req, res) => {
        res.end('<html>oops</html>')
        return true
      }
    )
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, host.url, GOOD)
      await assert.rejects(
        () => service(file).getSecret('api'),
        /invalid response/i
      )
    } finally {
      await host.stop()
    }
  })
})

test('a missing connection file is a clear error naming the variable and path', async () => {
  await withDir(async (dir) => {
    const file = join(dir, 'absent.json')
    const secrets = service(file)
    const error = await failure(() => secrets.getSecret('api'))
    assert.ok(error.message.includes(VAULT_CONNECTION_FILE_ENV))
    assert.ok(error.message.includes(file))
    await assert.rejects(() => secrets.hasSecret('api'), /absent\.json/)
  })
})

test('a malformed connection file is a clear error and never echoes its contents', async () => {
  await withDir(async (dir) => {
    for (const content of [
      'not json tok-in-file',
      '{"url":"http://127.0.0.1:1"}',
      '{"token":"tok-in-file"}',
      '{"url":"ftp://x","token":"tok-in-file"}',
      '{"url":5,"token":"tok-in-file"}',
      '[]',
    ]) {
      const file = join(dir, 'bad.json')
      writeFileSync(file, content)
      const error = await failure(() => service(file).getSecret('api'))
      assert.match(error.message, /connection file/i)
      assert.doesNotMatch(error.message, /tok-in-file/)
    }
  })
})

test('the connection comes from PIKKU_VAULT_CONNECTION_FILE only; the old variables are ignored', () => {
  assert.equal(vaultConnectionFromEnv({}), undefined)
  assert.equal(
    vaultConnectionFromEnv({ PIKKU_VAULT_CONNECTION_FILE: '' }),
    undefined
  )
  assert.equal(
    vaultConnectionFromEnv({ PIKKU_VAULT_SOCKET: '/s', PIKKU_VAULT_TOKEN: 't' }),
    undefined
  )
  assert.deepEqual(
    vaultConnectionFromEnv({
      PIKKU_VAULT_CONNECTION_FILE: '/f.json',
      PIKKU_VAULT_SOCKET: '/s',
      PIKKU_VAULT_TOKEN: 't',
    }),
    { file: '/f.json' }
  )
})

test('a configured vault is the only source: the local store is never consulted', async () => {
  await withDir(async (dir) => {
    const host = await startHost()
    try {
      const file = join(dir, 'vault.json')
      writeConnection(file, host.url, GOOD)
      process.env.ONLY_LOCAL = '"local"'
      const secrets = service(file)
      assert.equal(await secrets.hasSecret('ONLY_LOCAL'), false)
      await assert.rejects(
        () => secrets.getSecret('ONLY_LOCAL'),
        /Requested secret not found/
      )
    } finally {
      delete process.env.ONLY_LOCAL
      await host.stop()
    }
  })
})
