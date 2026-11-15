import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createPublicKey } from 'node:crypto'
import {
  DomainPolicyError,
  KeyCustodyLostError,
  KeyRetiredError,
  KeyUnavailableError,
  type CoreKeyPair,
  type KeyPublisher,
  type KeyRecord,
  type PublicKeyInfo,
} from '@pikku/core/keypair'
import {
  LocalSecretService,
  ScopedSecretService,
  TypedSecretService,
  type SecretService,
} from '@pikku/core/services'
import { createSecretValue } from '@pikku/core/classification'
import {
  createLocalKeyService,
  type LocalKeyServiceOptions,
} from './local-key-service.js'
import { MemoryKeyStore } from './memory-key-store.js'
import { signJws } from './sign-jws.js'
import { seal } from './sealed-box.js'
import { toBase64 } from './base64.js'

const HOUR = 3_600_000
const START = Date.parse('2026-01-01T00:00:00Z')

class DurableSecrets implements SecretService {
  readonly durable = true
  readonly map = new Map<string, unknown>()
  failReads = false
  failWrites = false
  async getSecret<T = string>(key: string) {
    if (this.failReads) throw new Error(`backend down while reading ${key}`)
    if (!this.map.has(key)) throw new Error(`missing ${key}`)
    return createSecretValue(this.map.get(key) as T)
  }
  async hasSecret(key: string) {
    return this.map.has(key)
  }
  async setSecret(key: string, value: unknown) {
    if (this.failWrites) throw new Error('backend refused the write')
    this.map.set(key, value)
  }
  async deleteSecret(key: string) {
    this.map.delete(key)
  }
  async getSecrets(): Promise<never> {
    throw new Error('unused')
  }
}

const def = (over: Partial<CoreKeyPair> & { name: string }): CoreKeyPair => ({
  displayName: over.name,
  algorithm: 'ed25519',
  purpose: 'signing',
  rotationPeriod: '1day',
  verifyGrace: '2h',
  scope: 'deployment',
  ...over,
})

const DEFS: CoreKeyPair[] = [
  def({ name: 'audit', public: 'jwks' }),
  def({ name: 'token', signedFormat: 'jws', public: 'jwks' }),
  def({ name: 'legacy', algorithm: 'rs256', signedFormat: 'jws' }),
  def({ name: 'vault', algorithm: 'x25519', purpose: 'sealing' }),
  def({ name: 'tenant', scope: 'keyed' }),
  def({ name: 'strict-audit' }),
]

const setup = async (over: Partial<LocalKeyServiceOptions> = {}) => {
  const clock = { t: START }
  const store = over.store ?? new MemoryKeyStore()
  const secrets = (over.secrets as DurableSecrets) ?? new DurableSecrets()
  const logs: string[] = []
  const options: LocalKeyServiceOptions = {
    definitions: DEFS,
    store,
    secrets,
    publishDelayMs: 15 * 60_000,
    now: () => clock.t,
    logger: {
      warn: (m: unknown) => void logs.push(String(m)),
      info: (m: unknown) => void logs.push(String(m)),
      debug: (m: unknown) => void logs.push(String(m)),
    },
    ...over,
  }
  const svc = await createLocalKeyService(options)
  return { svc, store, secrets, clock, logs, options }
}

const thumbprint = (spki: string) => {
  const jwk = createPublicKey({
    key: Buffer.from(spki, 'base64'),
    format: 'der',
    type: 'spki',
  }).export({ format: 'jwk' }) as Record<string, string>
  return createHash('sha256')
    .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x }))
    .digest('base64url')
}

describe('sign and verify', () => {
  test('ed25519 round trip under a domain; kid is the independently computed thumbprint', async () => {
    const { svc } = await setup()
    const info = await svc.generate('audit')
    assert.equal(info.status, 'active')
    assert.equal(info.kid, thumbprint(info.publicKey))
    const { kid, signature, alg } = await svc.sign('audit', 'row-1', {
      domain: 'audit-v1',
    })
    assert.equal(kid, info.kid)
    assert.equal(alg, 'ed25519')
    assert.equal(
      await svc.verify('audit', 'row-1', signature, {
        domain: 'audit-v1',
        kid,
      }),
      true
    )
    assert.equal(
      await svc.verify('audit', 'row-2', signature, { domain: 'audit-v1' }),
      false
    )
  })

  test('a signature made for one domain does not verify under another', async () => {
    const { svc } = await setup()
    await svc.generate('audit')
    const { signature } = await svc.sign('audit', 'data', { domain: 'a' })
    assert.equal(
      await svc.verify('audit', 'data', signature, { domain: 'a' }),
      true
    )
    assert.equal(
      await svc.verify('audit', 'data', signature, { domain: 'b' }),
      false
    )
  })

  test('DomainPolicyError in both directions', async () => {
    const { svc } = await setup()
    await svc.generate('audit')
    await svc.generate('token')
    await assert.rejects(svc.signer('audit'), DomainPolicyError)
    await assert.rejects(svc.sign('audit', 'x'), DomainPolicyError)
    await assert.rejects(svc.verify('audit', 'x', 'AA'), DomainPolicyError)
    await assert.rejects(
      svc.signer('token', { domain: 'd' }),
      DomainPolicyError
    )
    await assert.rejects(
      svc.verify('token', 'x', 'AA', { domain: 'd' }),
      DomainPolicyError
    )
    await assert.rejects(svc.signer('audit', { domain: '' }), DomainPolicyError)
  })

  test('jws name: signJws writes alg and kid from the handle, over anything in the header', async () => {
    const { svc } = await setup()
    await svc.generate('token')
    const signer = await svc.signer('token')
    const jws = await signJws(
      signer,
      { alg: 'none', kid: 'forged', typ: 'JWT' },
      { sub: 'u1' }
    )
    const [head, body, sig] = jws.split('.')
    const header = JSON.parse(Buffer.from(head!, 'base64url').toString())
    assert.deepEqual(header, { alg: 'EdDSA', kid: signer.kid, typ: 'JWT' })
    assert.equal(signer.jwsAlg, 'EdDSA')
    assert.equal(
      await svc.verify('token', `${head}.${body}`, sig!, { kid: header.kid }),
      true
    )
  })

  test('rs256 signs and verifies, header alg is RS256', async () => {
    const { svc } = await setup()
    await svc.generate('legacy')
    const signer = await svc.signer('legacy')
    assert.equal(signer.jwsAlg, 'RS256')
    const jws = await signJws(signer, {}, { a: 1 })
    const [head, body, sig] = jws.split('.')
    assert.equal(await svc.verify('legacy', `${head}.${body}`, sig!), true)
  })

  test('verify never throws on a malformed signature', async () => {
    const { svc } = await setup()
    await svc.generate('audit')
    assert.equal(await svc.verify('audit', 'x', '***', { domain: 'd' }), false)
    assert.equal(await svc.verify('audit', 'x', 'AAAA', { domain: 'd' }), false)
  })

  test('a handle fixes the version: promote between signer() and sign() still verifies under signer.kid', async () => {
    const { svc, clock } = await setup({ publishDelayMs: 0 })
    await svc.generate('audit')
    const signer = await svc.signer('audit', { domain: 'd' })
    const next = await svc.rotate('audit')
    clock.t += 1
    await svc.promote('audit', next.kid)
    const signature = await signer.sign('late')
    assert.equal(
      await svc.verify('audit', 'late', signature, {
        domain: 'd',
        kid: signer.kid,
      }),
      true
    )
    assert.notEqual(
      (await svc.signer('audit', { domain: 'd' })).kid,
      signer.kid
    )
  })
})

describe('status re-check', () => {
  test('revoke while a handle is held: sign throws KeyRetiredError', async () => {
    const { svc } = await setup()
    await svc.generate('audit')
    const signer = await svc.signer('audit', { domain: 'd' })
    await signer.sign('ok')
    await svc.revoke('audit', signer.kid)
    await assert.rejects(signer.sign('after'), KeyRetiredError)
    const fresh = await svc.signer('audit', { domain: 'd' })
    assert.notEqual(fresh.kid, signer.kid)
    await fresh.sign('fine')
  })

  test('a second instance trusts its view for statusTtlMs, then refuses', async () => {
    const a = await setup()
    await a.svc.generate('audit')
    const b = await createLocalKeyService({
      ...a.options,
      now: () => a.clock.t,
    })
    const handle = await b.signer('audit', { domain: 'd' })
    await handle.sign('warm') // caches the key, as a live process would
    await a.svc.revoke('audit', handle.kid)
    const ttl = 30_000
    a.clock.t += ttl - 1
    await handle.sign('still inside the window')
    a.clock.t += 2
    await assert.rejects(handle.sign('outside'), KeyRetiredError)
  })

  test('strictStatus names read the store on every sign', async () => {
    const a = await setup({ strictStatus: ['audit'] })
    await a.svc.generate('audit')
    const b = await createLocalKeyService({
      ...a.options,
      now: () => a.clock.t,
    })
    const handle = await b.signer('audit', { domain: 'd' })
    await handle.sign('warm')
    await a.svc.revoke('audit', handle.kid)
    await assert.rejects(handle.sign('immediately'), KeyRetiredError)
  })

  test('an unreachable store with a stale view fails closed, never signs on stale data', async () => {
    const store = new MemoryKeyStore()
    const a = await setup({ store })
    await a.svc.generate('audit')
    const handle = await a.svc.signer('audit', { domain: 'd' })
    await handle.sign('warm')
    store.list = async () => {
      throw new Error('connection refused')
    }
    a.clock.t += 31_000
    await assert.rejects(handle.sign('x'), KeyUnavailableError)
  })

  test('previous keeps signing until verifyUntil, then stops', async () => {
    const { svc, clock } = await setup({ publishDelayMs: 0 })
    await svc.generate('audit')
    const old = await svc.signer('audit', { domain: 'd' })
    const next = await svc.rotate('audit')
    await svc.promote('audit', next.kid)
    await old.sign('in grace')
    clock.t += 2 * HOUR + 1
    await assert.rejects(old.sign('past grace'), KeyRetiredError)
  })

  test('retire evicts the cached signing key', async () => {
    const { svc, clock } = await setup({ publishDelayMs: 0 })
    const first = await svc.generate('audit')
    const old = await svc.signer('audit', { domain: 'd' })
    await old.sign('warm')
    const next = await svc.rotate('audit')
    await svc.promote('audit', next.kid)
    await svc.retire('audit', first.kid)
    await assert.rejects(old.sign('x'), KeyRetiredError)
    clock.t += 1
    await assert.rejects(old.sign('y'), KeyRetiredError)
  })

  test('verify: previous accepted in grace, rejected after; retired only when historical', async () => {
    const { svc, clock } = await setup({ publishDelayMs: 0 })
    await svc.generate('audit')
    const old = await svc.signer('audit', { domain: 'd' })
    const sig = await old.sign('doc')
    const next = await svc.rotate('audit')
    await svc.promote('audit', next.kid)
    assert.equal(await svc.verify('audit', 'doc', sig, { domain: 'd' }), true)
    clock.t += 2 * HOUR + 1
    assert.equal(await svc.verify('audit', 'doc', sig, { domain: 'd' }), false)
    await svc.retire('audit', old.kid)
    assert.equal(
      await svc.verify('audit', 'doc', sig, { domain: 'd', kid: old.kid }),
      false
    )
    assert.equal(
      await svc.verify('audit', 'doc', sig, {
        domain: 'd',
        kid: old.kid,
        historical: true,
      }),
      true
    )
  })

  test('an unknown kid costs one store read per window, then a negative cache', async () => {
    const store = new MemoryKeyStore()
    const { svc, clock } = await setup({ store })
    await svc.generate('audit')
    let lists = 0
    const list = store.list.bind(store)
    store.list = async (...args) => {
      lists += 1
      return list(...args)
    }
    clock.t += 31_000
    for (let i = 0; i < 5; i++) {
      assert.equal(
        await svc.verify('audit', 'x', 'AAAA', { domain: 'd', kid: 'nope' }),
        false
      )
    }
    assert.ok(lists <= 2, `expected a bounded number of reads, saw ${lists}`)
  })
})

describe('custody refusals (D.1)', () => {
  test('LocalSecretService is refused even with secretsDurable', async () => {
    for (const secretsDurable of [undefined, true]) {
      await assert.rejects(
        createLocalKeyService({
          definitions: DEFS,
          store: new MemoryKeyStore(),
          secrets: new LocalSecretService(),
          secretsDurable,
        }),
        (e: unknown) =>
          e instanceof KeyCustodyLostError &&
          /LocalSecretService/.test(e.message)
      )
    }
  })

  test('allowEphemeralSecretCustody is the only override of that refusal', async () => {
    const svc = await createLocalKeyService({
      definitions: [DEFS[0]!],
      store: new MemoryKeyStore(),
      secrets: new LocalSecretService(),
      allowEphemeralSecretCustody: true,
    })
    await svc.generate('audit')
    const { signature } = await svc.sign('audit', 'x', { domain: 'd' })
    assert.equal(
      await svc.verify('audit', 'x', signature, { domain: 'd' }),
      true
    )
  })

  test('a durable service is accepted; a non-durable one is refused unless the host asserts it', async () => {
    const base = { definitions: [DEFS[0]!], store: new MemoryKeyStore() }
    await createLocalKeyService({ ...base, secrets: new DurableSecrets() })
    const unknown = Object.assign(new DurableSecrets(), { durable: undefined })
    await assert.rejects(
      createLocalKeyService({ ...base, secrets: unknown }),
      KeyCustodyLostError
    )
    await createLocalKeyService({
      ...base,
      secrets: unknown,
      secretsDurable: true,
    })
    await assert.rejects(
      createLocalKeyService({
        ...base,
        secrets: new DurableSecrets(),
        secretsDurable: false,
      }),
      KeyCustodyLostError
    )
  })

  test('durable is read through TypedSecretService and ScopedSecretService', async () => {
    const durable = new DurableSecrets()
    const base = { definitions: [DEFS[0]!], store: new MemoryKeyStore() }
    await createLocalKeyService({
      ...base,
      secrets: new TypedSecretService(durable, {}),
    })
    await createLocalKeyService({
      ...base,
      secrets: new ScopedSecretService(durable, new Set()),
    })
    await assert.rejects(
      createLocalKeyService({
        ...base,
        secrets: new TypedSecretService(new LocalSecretService(), {}),
      }),
      KeyCustodyLostError
    )
  })

  test('a wrapper that does not forward `durable` is refused', async () => {
    const durable = new DurableSecrets()
    const opaque: SecretService = {
      getSecret: (k) => durable.getSecret(k),
      hasSecret: (k) => durable.hasSecret(k),
      setSecret: (k, v) => durable.setSecret(k, v),
      deleteSecret: (k) => durable.deleteSecret(k),
      getSecrets: () => durable.getSecrets(),
    }
    await assert.rejects(
      createLocalKeyService({
        definitions: [DEFS[0]!],
        store: new MemoryKeyStore(),
        secrets: opaque,
      }),
      KeyCustodyLostError
    )
  })

  test('no custody available at all is refused, not defaulted', async () => {
    await assert.rejects(
      createLocalKeyService({
        definitions: [DEFS[0]!],
        store: new MemoryKeyStore(),
      }),
      KeyCustodyLostError
    )
  })

  test('a lost private half refuses start for deployment names', async () => {
    const a = await setup()
    await a.svc.generate('audit')
    a.secrets.map.clear()
    await assert.rejects(createLocalKeyService(a.options), KeyCustodyLostError)
  })

  test('a lost private half fails only that scope of a keyed name, and reconcile never mints over it', async () => {
    const a = await setup()
    const one = await a.svc.generate('tenant', { scopeKey: 'one' })
    await a.svc.generate('tenant', { scopeKey: 'two' })
    const stored = (await a.store.list('tenant', 'one')).find(
      (r) => r.kid === one.kid
    )!
    a.secrets.map.delete(stored.privateRef!)
    const fresh = await createLocalKeyService(a.options) // keyed names are lazy
    await assert.rejects(
      fresh.signer('tenant', { scopeKey: 'one', domain: 'd' }),
      KeyCustodyLostError
    )
    await fresh.signer('tenant', { scopeKey: 'two', domain: 'd' })
    const summary = await fresh.reconcile()
    assert.ok(summary.failed.some((f) => f.target === 'tenant:one'))
    assert.equal((await a.store.list('tenant', 'one')).length, 1)
    const health = await fresh.keyHealth('tenant')
    assert.deepEqual(
      health
        .map((h) => [h.scopeKey, h.state])
        .sort((x, y) => String(x[0]).localeCompare(String(y[0]))),
      [
        ['one', 'custody-lost'],
        ['two', 'ok'],
      ]
    )
  })
})

describe('no private material escapes', () => {
  test('not in logs, errors, returned objects, or the ledger', async () => {
    const a = await setup({ publishDelayMs: 0 })
    await a.svc.generate('audit', {})
    await a.svc.generate('vault')
    await a.svc.generate('token')
    const secretValues = [...a.secrets.map.values()].map(
      (v) => (v as { privateKey: string }).privateKey
    )
    assert.equal(secretValues.length, 3)

    const seen: string[] = []
    const record = (v: unknown) => seen.push(JSON.stringify(v) ?? '')
    const collect = async (fn: () => Promise<unknown>) => {
      try {
        record(await fn())
      } catch (e) {
        seen.push(String((e as Error).stack ?? e), JSON.stringify(e))
      }
    }
    const signer = await a.svc.signer('audit', { domain: 'd' })
    record(signer)
    await collect(() =>
      a.svc.publicKeys('audit', { includePending: true, includeRetired: true })
    )
    await collect(() => a.svc.jwks('audit'))
    await collect(() => a.svc.keyHealth('audit'))
    await collect(() => a.svc.reconcile())
    await collect(() => a.store.list('audit', 'default'))
    await collect(() => a.svc.open('vault', 'garbage'))
    await collect(() => a.svc.sign('audit', 'x'))
    // a backend whose error message quotes a private half: ours must not repeat it
    const leaky = (
      a.secrets.map.values().next().value as { privateKey: string }
    ).privateKey
    a.secrets.getSecret = async () => {
      throw new Error(`cannot read value ${leaky}`)
    }
    a.clock.t += 40_000
    await collect(() => signer.sign('x'))
    await collect(() => createLocalKeyService(a.options))
    await collect(() => a.svc.keyHealth('audit'))

    const everything = [...seen, ...a.logs].join('\n')
    for (const priv of secretValues) {
      assert.ok(!everything.includes(priv), 'a private half leaked')
      assert.ok(
        !everything.includes(priv.slice(10, 40)),
        'a fragment of a private half leaked'
      )
    }
    assert.ok(a.logs.length > 0, 'the failure paths should have logged')
  })
})

describe('mint order and crash recovery (C.3)', () => {
  test('placement failure leaves only a minting row; reconcile garbage-collects it after an hour, then mints cleanly', async () => {
    const a = await setup({ definitions: [DEFS[0]!] })
    a.secrets.failWrites = true
    await assert.rejects(a.svc.generate('audit'))
    let rows = await a.store.list('audit', 'default')
    assert.deepEqual(
      rows.map((r) => r.status),
      ['minting']
    )
    a.secrets.failWrites = false
    a.clock.t += HOUR + 1
    const summary = await a.svc.reconcile()
    rows = await a.store.list('audit', 'default')
    assert.deepEqual(rows.map((r) => r.status).sort(), ['active', 'retired'])
    assert.equal(summary.minted.length, 1)
  })

  test('crash after placing, before markPlaced: the stray half is deleted with its minting row', async () => {
    const store = new MemoryKeyStore()
    const markPlaced = store.markPlaced.bind(store)
    store.markPlaced = async () => {
      throw new Error('crash')
    }
    const a = await setup({ store })
    await assert.rejects(a.svc.generate('audit'), /crash/)
    const [row] = await store.list('audit', 'default')
    assert.equal(row!.status, 'minting')
    assert.equal(a.secrets.map.has(row!.privateRef!), true)
    a.clock.t += HOUR + 1
    // restore a working store path for the follow-up reconcile
    store.markPlaced = markPlaced
    await a.svc.reconcile()
    assert.equal(a.secrets.map.has(row!.privateRef!), false)
    assert.equal((await store.get(row!.kid))!.status, 'retired')
  })

  test('crash after markPlaced, before promote: reconcile promotes the pending row, no second mint', async () => {
    const store = new MemoryKeyStore()
    const a = await setup({ store })
    const promote = store.promote.bind(store)
    store.promote = async () => {
      throw new Error('crash')
    }
    await assert.rejects(a.svc.generate('audit'), /crash/)
    assert.deepEqual(
      (await store.list('audit', 'default')).map((r) => r.status),
      ['pending']
    )
    store.promote = promote
    await a.svc.reconcile()
    const rows = await store.list('audit', 'default')
    assert.deepEqual(
      rows.map((r) => r.status),
      ['active']
    )
  })

  test('the private half is placed and proven before the key is ever pending', async () => {
    const order: string[] = []
    const store = new MemoryKeyStore()
    const markPlaced = store.markPlaced.bind(store)
    const insert = store.insertPending.bind(store)
    store.insertPending = async (...args) => {
      order.push(`insert:${args[0].status}`)
      return insert(...args)
    }
    store.markPlaced = async (...args) => {
      order.push('markPlaced')
      return markPlaced(...args)
    }
    const a = await setup({ store })
    const set = a.secrets.setSecret.bind(a.secrets)
    a.secrets.setSecret = async (k, v) => {
      order.push('place')
      return set(k, v)
    }
    await a.svc.generate('audit')
    assert.deepEqual(order, ['insert:minting', 'place', 'markPlaced'])
  })
})

describe('reconcile state machine', () => {
  const publisherFor = () => {
    const sets: PublicKeyInfo[][] = []
    const publisher: KeyPublisher & { fail: boolean } = {
      fail: false,
      async publish(_n, _s, keys) {
        if (publisher.fail) throw new Error('publisher down')
        sets.push(keys)
      },
    }
    return { sets, publisher }
  }

  test('mint, publish, delay, promote, grace, retire (one step per pass)', async () => {
    const a = await setup({ definitions: [DEFS[0]!] })
    const { sets, publisher } = publisherFor()
    a.svc.onPublish('audit', publisher)
    assert.equal((await a.svc.reconcile()).minted.length >= 1, true)
    const first = (await a.svc.publicKeys('audit'))[0]!
    // not due yet
    a.clock.t += HOUR
    assert.ok((await a.svc.reconcile()).current.includes('audit:default'))

    a.clock.t = START + 24 * HOUR + 1 // rotation due
    const minted = await a.svc.reconcile()
    assert.equal(minted.minted.length, 1)
    const pending = (
      await a.svc.publicKeys('audit', { includePending: true })
    ).find((k) => k.status === 'pending')!

    await a.svc.reconcile() // publishes the pending key
    assert.ok(sets.at(-1)!.some((k) => k.kid === pending.kid))
    assert.equal((await a.svc.publicKeys('audit')).length, 1)

    a.clock.t += 14 * 60_000
    assert.equal((await a.svc.reconcile()).promoted.length, 0)
    a.clock.t += 2 * 60_000
    assert.deepEqual((await a.svc.reconcile()).promoted, [pending.kid])
    const keys = await a.svc.publicKeys('audit')
    assert.deepEqual(
      keys.map((k) => [k.kid, k.status]),
      [
        [pending.kid, 'active'],
        [first.kid, 'previous'],
      ]
    )

    a.clock.t += 2 * HOUR
    assert.deepEqual((await a.svc.reconcile()).retired, [first.kid])
    assert.equal((await a.svc.publicKeys('audit')).length, 1)
    assert.equal(
      sets.at(-1)!.some((k) => k.kid === first.kid),
      false
    )
    const old = (await a.store.get(first.kid))!
    assert.equal(old.status, 'retired')
    assert.equal(
      a.secrets.map.has(old.privateRef!),
      false,
      'private half destroyed on retire'
    )
  })

  test('a failed retire-publish is recorded and retried by reconcile', async () => {
    const a = await setup({ publishDelayMs: 0 })
    const { publisher } = publisherFor()
    a.svc.onPublish('audit', publisher)
    const first = await a.svc.generate('audit')
    const next = await a.svc.rotate('audit')
    await a.svc.promote('audit', next.kid)
    publisher.fail = true
    await a.svc.retire('audit', first.kid)
    assert.equal((await a.store.get(first.kid))!.status, 'retired')
    assert.equal(
      (await a.svc.keyHealth('audit'))[0]!.state,
      'overdue-unpublish'
    )
    publisher.fail = false
    await a.svc.reconcile()
    assert.equal((await a.svc.keyHealth('audit'))[0]!.state, 'ok')
  })

  test('promote refuses until the key is published and the delay has passed', async () => {
    const a = await setup()
    const { publisher } = publisherFor()
    a.svc.onPublish('audit', publisher)
    await a.svc.generate('audit')
    const next = await a.svc.rotate('audit')
    await assert.rejects(a.svc.promote('audit', next.kid), KeyUnavailableError)
    a.clock.t += 15 * 60_000
    await a.svc.promote('audit', next.kid)
    assert.equal((await a.svc.publicKeys('audit'))[0]!.kid, next.kid)
  })

  test('concurrent generate calls serialise: one active, one pending, no duplicate version', async () => {
    const a = await setup()
    const [x, y] = await Promise.all([
      a.svc.generate('audit'),
      a.svc.generate('audit'),
    ])
    assert.notEqual(x.kid, y.kid)
    const rows = await a.store.list('audit', 'default')
    assert.deepEqual(
      rows.map((r) => [r.version, r.status]),
      [
        [2, 'pending'],
        [1, 'active'],
      ]
    )
  })
})

describe('revoke', () => {
  test('successor active first, old retired, private half gone, reduced set published', async () => {
    const a = await setup()
    const sets: PublicKeyInfo[][] = []
    a.svc.onPublish('audit', {
      publish: async (_n, _s, k) => void sets.push(k),
    })
    const first = await a.svc.generate('audit')
    const sig = (await a.svc.sign('audit', 'x', { domain: 'd' })).signature
    await a.svc.revoke('audit', first.kid)
    const keys = await a.svc.publicKeys('audit')
    assert.equal(keys.length, 1)
    assert.notEqual(keys[0]!.kid, first.kid)
    assert.equal(keys[0]!.status, 'active')
    assert.equal(
      sets.at(-1)!.some((k) => k.kid === first.kid),
      false
    )
    const row = (await a.store.get(first.kid))!
    assert.equal(row.status, 'retired')
    assert.equal(a.secrets.map.has(row.privateRef!), false)
    assert.equal(
      await a.svc.verify('audit', 'x', sig, { domain: 'd', kid: first.kid }),
      false
    )
    assert.equal(
      await a.svc.verify('audit', 'x', sig, {
        domain: 'd',
        kid: first.kid,
        historical: true,
      }),
      true
    )
  })

  test('retiring the active key directly is refused', async () => {
    const a = await setup()
    const first = await a.svc.generate('audit')
    await assert.rejects(a.svc.retire('audit', first.kid), /active/)
  })
})

describe('sealing keys', () => {
  test('seal to the public key, open through the service', async () => {
    const a = await setup()
    const info = await a.svc.generate('vault')
    const sealed = await seal(info.publicKey, info.kid, 'api-token-123')
    assert.equal(
      await a.svc.open('vault', JSON.stringify(sealed)),
      'api-token-123'
    )
  })

  test('previous opens past verifyUntil (rows await re-seal); retired does not; retire needs a usage counter', async () => {
    const a = await setup({ publishDelayMs: 0 })
    const first = await a.svc.generate('vault')
    const sealed = JSON.stringify(await seal(first.publicKey, first.kid, 'v'))
    const next = await a.svc.rotate('vault')
    await a.svc.promote('vault', next.kid)
    a.clock.t += 3 * HOUR
    assert.equal(await a.svc.open('vault', sealed), 'v')
    assert.equal((await a.svc.keyHealth('vault'))[0]!.state, 'overdue-reseal')
    await assert.rejects(a.svc.retire('vault', first.kid), /onUsage|force/)
    let used = 2
    a.svc.onUsage('vault', async () => used)
    await assert.rejects(a.svc.retire('vault', first.kid), /still seals 2/)
    used = 0
    await a.svc.retire('vault', first.kid)
    await assert.rejects(a.svc.open('vault', sealed), KeyRetiredError)
    assert.equal(
      a.secrets.map.has((await a.store.get(first.kid))!.privateRef!),
      true,
      'a sealing key keeps its private half'
    )
  })

  test('a sealing name has no sign, and a signing name has no open', async () => {
    const a = await setup()
    await a.svc.generate('vault')
    await a.svc.generate('audit')
    await assert.rejects(a.svc.signer('vault'), /sealing key/)
    await assert.rejects(a.svc.open('audit', '{}'), /signing key/)
  })
})

describe('other custodies and listings', () => {
  test('external custody never signs or opens in this process', async () => {
    const a = await setup({
      definitions: [def({ name: 'audit', custody: 'external' })],
    })
    const placed: string[] = []
    a.svc.onPlace('audit', {
      place: async (_n, _s, kid) => void placed.push(kid),
      confirm: async () => {},
    })
    const info = await a.svc.generate('audit')
    assert.deepEqual(placed, [info.kid])
    const signer = await a.svc.signer('audit', { domain: 'd' })
    await assert.rejects(signer.sign('x'), KeyUnavailableError)
  })

  test('external custody with no placer fails to mint', async () => {
    const a = await setup({
      definitions: [def({ name: 'audit', custody: 'external' })],
    })
    await assert.rejects(a.svc.generate('audit'), KeyCustodyLostError)
  })

  test('wrapped custody round trips through the wrapper and keeps ciphertext in the ledger', async () => {
    const wrapper = {
      wrap: async (pkcs8: string) => ({
        wrapped: toBase64(new TextEncoder().encode(pkcs8)),
      }),
      unwrap: async (w: string) =>
        new TextDecoder().decode(
          Uint8Array.from(atob(w), (c) => c.charCodeAt(0))
        ),
    }
    const a = await setup({
      secrets: undefined,
      wrapper,
      definitions: [def({ name: 'audit', custody: 'wrapped' })],
    })
    const info = await a.svc.generate('audit')
    const { signature } = await a.svc.sign('audit', 'x', { domain: 'd' })
    assert.equal(
      await a.svc.verify('audit', 'x', signature, {
        domain: 'd',
        kid: info.kid,
      }),
      true
    )
    assert.ok((await a.store.get(info.kid))!.privateWrapped)
  })

  test('jwks includes the pending key, so verifiers have it before it signs', async () => {
    const a = await setup()
    const first = await a.svc.generate('audit')
    const next = await a.svc.rotate('audit')
    const { keys } = await a.svc.jwks('audit')
    assert.deepEqual(
      keys.map((k) => k.kid).sort(),
      [first.kid, next.kid].sort()
    )
    assert.ok(
      keys.every((k) => k.kty === 'OKP' && k.alg === 'EdDSA' && k.use === 'sig')
    )
    await assert.rejects(a.svc.jwks('strict-audit'), /not declared public/)
  })

  test('keyed names need a scopeKey and keep keyrings apart', async () => {
    const a = await setup()
    await assert.rejects(a.svc.generate('tenant'), /scopeKey/)
    const one = await a.svc.generate('tenant', { scopeKey: 'one' })
    const two = await a.svc.generate('tenant', { scopeKey: 'two' })
    assert.notEqual(one.kid, two.kid)
    const { signature } = await a.svc.sign('tenant', 'x', {
      scopeKey: 'one',
      domain: 'd',
    })
    assert.equal(
      await a.svc.verify('tenant', 'x', signature, {
        scopeKey: 'two',
        domain: 'd',
      }),
      false
    )
    assert.equal(
      await a.svc.verify('tenant', 'x', signature, {
        scopeKey: 'one',
        domain: 'd',
      }),
      true
    )
  })

  test('the secret id follows KEY_<NAME>_<hash16>', async () => {
    const a = await setup()
    const info = await a.svc.generate('strict-audit')
    const row: KeyRecord = (await a.store.get(info.kid))!
    assert.match(row.privateRef!, /^KEY_STRICT_AUDIT_[0-9a-f]{16}$/)
    assert.deepEqual(
      Object.keys(a.secrets.map.get(row.privateRef!) as object),
      ['privateKey']
    )
  })
})

describe('MemoryKeyStore invariants', () => {
  const row = (over: Partial<KeyRecord>): KeyRecord => ({
    kid: 'k1',
    name: 'n',
    scopeKey: 'default',
    version: 1,
    algorithm: 'ed25519',
    purpose: 'signing',
    status: 'pending',
    createdAt: new Date(START).toISOString(),
    publicKey: 'AA',
    custody: 'secret',
    rev: 0,
    ...over,
  })

  test('one active and one pending per slot, unique versions, compare-and-set transitions', async () => {
    const store = new MemoryKeyStore()
    await store.insertPending(row({ kid: 'a' }))
    assert.equal(
      await store.firstActivate(
        row({ kid: 'b', version: 2, status: 'active' })
      ),
      true
    )
    assert.equal(
      await store.firstActivate(
        row({ kid: 'c', version: 3, status: 'active' })
      ),
      false
    )
    await assert.rejects(
      store.insertPending(row({ kid: 'd', version: 3 })),
      /pending/
    )
    await assert.rejects(
      store.insertPending(row({ kid: 'e', version: 1, status: 'minting' })),
      /version/
    )
    assert.equal(
      await store.promote({ pendingKid: 'a', activeKid: 'wrong', now: 'x' }),
      false
    )
    assert.equal(
      await store.promote({
        pendingKid: 'a',
        activeKid: 'b',
        verifyUntil: 'v',
        now: 'x',
      }),
      true
    )
    assert.equal((await store.get('b'))!.status, 'previous')
    assert.equal(await store.retire('b', 'x'), true)
    assert.equal(await store.retire('b', 'x'), false)
    assert.equal(
      await store.updateCustody('a', { rev: 5 }, { metadata: {} }),
      false
    )
    assert.equal(
      await store.updateCustody('a', { rev: 0 }, { metadata: { x: 1 } }),
      true
    )
  })

  test('a failed change rolls back', async () => {
    const store = new MemoryKeyStore()
    await store.insertPending(row({ kid: 'a' }))
    await assert.rejects(store.insertPending(row({ kid: 'z', version: 9 })))
    assert.equal((await store.list('n', 'default')).length, 1)
  })
})
