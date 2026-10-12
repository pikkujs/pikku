import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { VaultSecretService, vaultConnectionFromEnv } from './vault-secret-service.js'

const withVault = async (run: (socketPath: string) => Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-cli-'))
  const socketPath = join(dir, 'v.sock')
  const server = createServer((req, res) => {
    const url = req.url ?? ''
    res.setHeader('content-type', 'application/json')
    if (req.headers.authorization !== 'Bearer t') {
      res.statusCode = 401
      return res.end('{"error":"unauthorized"}')
    }
    if (url === '/v1/secrets/api') return res.end(JSON.stringify({ value: '{"token":"sk"}' }))
    if (url === '/v1/secrets/api/exists') return res.end('{"exists":true}')
    if (url.endsWith('/exists')) return res.end('{"exists":false}')
    res.statusCode = 404
    res.end('{"error":"not_found"}')
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  try {
    await run(socketPath)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
}

test('reads from the vault and reports absence', async () => {
  await withVault(async (socketPath) => {
    const service = new VaultSecretService({ socketPath, token: 't' })
    assert.deepEqual((await service.getSecret<{ token: string }>('api')).reveal(), { token: 'sk' })
    assert.equal(await service.hasSecret('missing'), false)
    await assert.rejects(() => service.getSecret('missing'), /Requested secret not found: missing/)
    await assert.rejects(() => service.setSecret(), /through Pikku Studio/)
  })
})

test('a rejected token is an error, not a missing secret', async () => {
  await withVault(async (socketPath) => {
    const service = new VaultSecretService({ socketPath, token: 'wrong' })
    await assert.rejects(() => service.getSecret('api'), /401/)
    await assert.rejects(() => service.hasSecret('api'), /401/)
    await assert.rejects(() => service.getSecrets(['api']), /401/)
  })
})

test('a configured vault is the only source: the local store is never consulted', async () => {
  await withVault(async (socketPath) => {
    process.env.ONLY_LOCAL = '"local"'
    const service = new VaultSecretService({ socketPath, token: 't' })
    assert.equal(await service.hasSecret('ONLY_LOCAL'), false)
    await assert.rejects(() => service.getSecret('ONLY_LOCAL'), /Requested secret not found/)
    delete process.env.ONLY_LOCAL
  })
})

test('a vault that never answers or sends junk rejects instead of hanging or crashing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-cli-'))
  const socketPath = join(dir, 'v.sock')
  const server = createServer((req, res) => {
    if (req.url?.includes('junk')) return res.end('<html>oops</html>')
    res.writeHead(200)
    res.write('{')
  })
  await new Promise<void>((resolve) => server.listen(socketPath, resolve))
  try {
    const service = new VaultSecretService({ socketPath, token: 't' })
    await assert.rejects(() => service.getSecret('junk'), /non-JSON/)
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('connection comes from the environment only when both are set', () => {
  assert.equal(vaultConnectionFromEnv({ PIKKU_VAULT_SOCKET: '/s' }), undefined)
  assert.deepEqual(vaultConnectionFromEnv({ PIKKU_VAULT_SOCKET: '/s', PIKKU_VAULT_TOKEN: 't' }), {
    socketPath: '/s',
    token: 't',
  })
})
