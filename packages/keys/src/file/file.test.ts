import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { CoreKeyPair } from '@pikku/core/keypair'
import { createLocalKeyService } from '../local-key-service.js'
import { FileCustody, FileKeyStore } from './index.js'

const DEF: CoreKeyPair = {
  name: 'audit',
  displayName: 'Audit',
  algorithm: 'ed25519',
  purpose: 'signing',
  rotationPeriod: '1day',
  verifyGrace: '2h',
  scope: 'deployment',
}

const withDir = async (fn: (dir: string) => Promise<void>) => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-keys-'))
  try {
    await fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('file custody and ledger', () => {
  test('keys survive a restart: a second service over the same files verifies and signs', async () => {
    await withDir(async (dir) => {
      const open = () =>
        createLocalKeyService({
          definitions: [DEF],
          store: new FileKeyStore(join(dir, 'keys.json')),
          fileCustody: new FileCustody(join(dir, 'keys')),
        })
      const first = await open()
      const info = await first.generate('audit')
      const { signature } = await first.sign('audit', 'x', { domain: 'd' })
      const second = await open()
      assert.equal((await second.publicKeys('audit'))[0]!.kid, info.kid)
      assert.equal(
        await second.verify('audit', 'x', signature, { domain: 'd' }),
        true
      )
      await second.sign('audit', 'y', { domain: 'd' })
    })
  })

  test('private half is mode 0600 in a 0700 directory, and the ledger never holds it', async () => {
    await withDir(async (dir) => {
      const svc = await createLocalKeyService({
        definitions: [DEF],
        store: new FileKeyStore(join(dir, 'keys.json')),
        fileCustody: new FileCustody(join(dir, 'keys')),
      })
      const info = await svc.generate('audit')
      const keyFile = join(dir, 'keys', 'audit', `${info.kid}.key`)
      assert.equal(statSync(keyFile).mode & 0o777, 0o600)
      assert.equal(statSync(join(dir, 'keys', 'audit')).mode & 0o777, 0o700)
      assert.equal(statSync(join(dir, 'keys.json')).mode & 0o777, 0o600)
      const priv = readFileSync(keyFile, 'utf8')
      assert.ok(!readFileSync(join(dir, 'keys.json'), 'utf8').includes(priv))
      assert.deepEqual(
        readdirSync(dir).filter((f) => f.endsWith('.tmp')),
        []
      )
    })
  })

  test('a key file readable by others counts as lost, and refuses start', async () => {
    await withDir(async (dir) => {
      const options = {
        definitions: [DEF],
        store: new FileKeyStore(join(dir, 'keys.json')),
        fileCustody: new FileCustody(join(dir, 'keys')),
      }
      const svc = await createLocalKeyService(options)
      const info = await svc.generate('audit')
      chmodSync(join(dir, 'keys', 'audit', `${info.kid}.key`), 0o644)
      await assert.rejects(
        createLocalKeyService({
          ...options,
          store: new FileKeyStore(join(dir, 'keys.json')),
        }),
        /missing|cannot/
      )
    })
  })

  test('revoke removes the key file', async () => {
    await withDir(async (dir) => {
      const svc = await createLocalKeyService({
        definitions: [DEF],
        store: new FileKeyStore(join(dir, 'keys.json')),
        fileCustody: new FileCustody(join(dir, 'keys')),
      })
      const info = await svc.generate('audit')
      await svc.revoke('audit', info.kid)
      assert.equal(
        readdirSync(join(dir, 'keys', 'audit')).includes(`${info.kid}.key`),
        false
      )
    })
  })

  test('refFor refuses names and kids that are not safe file names', () => {
    const custody = new FileCustody('/tmp/x')
    assert.throws(() => custody.refFor('audit', 'default', '../../etc/passwd'))
    assert.throws(() => custody.refFor('../audit', 'default', 'abc'))
    assert.ok(
      custody.refFor('audit', 'default', 'abc_-D').endsWith('audit/abc_-D.key')
    )
  })

  test('a ledger write that fails rolls the in-memory change back', async () => {
    await withDir(async (dir) => {
      const store = new FileKeyStore(join(dir, 'blocked', 'keys.json'))
      writeFileSync(join(dir, 'blocked'), 'a file where a directory should be')
      await assert.rejects(
        store.insertPending({
          kid: 'k',
          name: 'audit',
          scopeKey: 'default',
          version: 1,
          algorithm: 'ed25519',
          purpose: 'signing',
          status: 'minting',
          createdAt: 'x',
          custody: 'file',
          rev: 0,
        })
      )
      assert.deepEqual(await store.list('audit', 'default'), [])
    })
  })
})
