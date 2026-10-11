import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { LocalSecretService, LocalVariablesService } from '@pikku/core/services'
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
  })
})

test('falls back to the local store for keys the vault lacks', async () => {
  await withVault(async (socketPath) => {
    process.env.ONLY_LOCAL = '"local"'
    const fallback = new LocalSecretService(new LocalVariablesService())
    const service = new VaultSecretService({ socketPath, token: 't' }, fallback)
    assert.equal(await service.hasSecret('ONLY_LOCAL'), true)
    assert.equal((await service.getSecret('ONLY_LOCAL')).reveal(), 'local')
    delete process.env.ONLY_LOCAL
  })
})

test('connection comes from the environment only when both are set', () => {
  assert.equal(vaultConnectionFromEnv({ PIKKU_VAULT_SOCKET: '/s' }), undefined)
  assert.deepEqual(vaultConnectionFromEnv({ PIKKU_VAULT_SOCKET: '/s', PIKKU_VAULT_TOKEN: 't' }), {
    socketPath: '/s',
    token: 't',
  })
})
