import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import type { KeyRecord, KeyStore } from '../../wirings/keypair/index.js'

/**
 * One isolated, empty ledger. `open()` returns a store over it and may be
 * called again: a store that persists hands back a new instance over the same
 * ledger (a new connection for a database), one that cannot returns the same
 * instance.
 */
export interface KeyStoreHarness {
  open(): Promise<KeyStore>
  close?(): Promise<void>
}

export interface KeyStoreTestOptions {
  /** A second `open()` over the same ledger sees what the first wrote. Default true. */
  persists?: boolean
  /** Two `open()` instances can write the same ledger at once (separate connections). Default false. */
  sharedWriters?: boolean
}

/** A row without its null and absent fields: a SQL store cannot tell `null` from absent. */
const norm = (rec: KeyRecord | undefined) =>
  rec &&
  Object.fromEntries(
    Object.entries(rec).filter(([, v]) => v !== null && v !== undefined)
  )

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-02-01T00:00:00.000Z'
const T2 = '2026-03-01T00:00:00.000Z'
const T3 = '2026-04-01T00:00:00.000Z'

const PUBLIC = (n: number) => `public-${n}`

let counter = 0
const record = (over: Partial<KeyRecord> = {}): KeyRecord => {
  counter += 1
  return {
    kid: `kid-${counter}`,
    name: 'audit',
    scopeKey: 'default',
    version: counter,
    algorithm: 'ed25519',
    purpose: 'signing',
    publicKey: PUBLIC(counter),
    status: 'pending',
    createdAt: T0,
    custody: 'secret',
    privateRef: `KEY_AUDIT_${counter}`,
    rev: 0,
    ...over,
  }
}

/**
 * Conformance suite for {@link KeyStore}. Each test gets a fresh ledger. The
 * store must be passed the same assertions whether it keeps the ledger in
 * memory, in a file or in a SQL database.
 */
export const defineKeyStoreTests = (
  name: string,
  create: () => Promise<KeyStoreHarness>,
  options: KeyStoreTestOptions = {}
): void => {
  const persists = options.persists ?? true
  const sharedWriters = options.sharedWriters ?? false

  const withStore = async (
    fn: (store: KeyStore, harness: KeyStoreHarness) => Promise<void>
  ) => {
    const harness = await create()
    try {
      await fn(await harness.open(), harness)
    } finally {
      await harness.close?.()
    }
  }

  describe(`KeyStore [${name}]`, () => {
    describe('create, get and list', () => {
      test('a pending row reads back with every field', () =>
        withStore(async (store) => {
          const rec = record({
            kid: 'k-full',
            custody: 'wrapped',
            privateRef: null,
            privateWrapped: 'ciphertext-ABC==',
            metadata: {
              kekVersionId: 'kek-1',
              snake_case_key: { nested_key: [1, 'two', null, true] },
            },
          })
          await store.insertPending(rec)
          assert.deepEqual(norm(await store.get('k-full')), norm(rec))
        }))

      test('optional fields come back absent or null, never invented', () =>
        withStore(async (store) => {
          const rec = record({
            kid: 'k-min',
            custody: 'external',
            privateRef: null,
          })
          await store.insertPending(rec)
          const got = (await store.get('k-min'))!
          assert.equal(got.activatedAt ?? null, null)
          assert.equal(got.publishedAt ?? null, null)
          assert.equal(got.verifyUntil ?? null, null)
          assert.equal(got.retiredAt ?? null, null)
          assert.equal(got.privateWrapped ?? null, null)
          assert.equal(got.metadata ?? null, null)
          assert.equal(got.privateRef ?? null, null)
          assert.equal(got.rev, 0)
        }))

      test('a minting row has no public half and is stored as minting', () =>
        withStore(async (store) => {
          const rec = record({
            kid: 'k-minting',
            status: 'minting',
            publicKey: undefined,
          })
          await store.insertPending(rec)
          const got = (await store.get('k-minting'))!
          assert.equal(got.status, 'minting')
          assert.equal(got.publicKey ?? null, null)
        }))

      test('insertPending refuses any other status', () =>
        withStore(async (store) => {
          await assert.rejects(
            store.insertPending(record({ status: 'active' }))
          )
          await assert.rejects(
            store.insertPending(record({ status: 'retired', retiredAt: T1 }))
          )
        }))

      test('get of an unknown kid is undefined', () =>
        withStore(async (store) => {
          assert.equal(await store.get('nope'), undefined)
        }))

      test('list is newest version first and scoped to name and scopeKey', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({ kid: 'v3', version: 3, status: 'minting' })
          )
          await store.insertPending(
            record({ kid: 'v1', version: 1, status: 'minting' })
          )
          await store.insertPending(
            record({ kid: 'v2', version: 2, status: 'minting' })
          )
          await store.insertPending(
            record({ kid: 'other-scope', version: 9, scopeKey: 'stage:1' })
          )
          await store.insertPending(
            record({ kid: 'other-name', version: 9, name: 'sealing' })
          )
          assert.deepEqual(
            (await store.list('audit', 'default')).map((r) => r.kid),
            ['v3', 'v2', 'v1']
          )
          assert.deepEqual(
            (await store.list('audit', 'stage:1')).map((r) => r.kid),
            ['other-scope']
          )
          assert.deepEqual(await store.list('audit', 'nothing'), [])
        }))

      test('versions order numerically, not as text', () =>
        withStore(async (store) => {
          for (const version of [2, 10, 9]) {
            await store.insertPending(
              record({ kid: `n${version}`, version, status: 'minting' })
            )
          }
          assert.deepEqual(
            (await store.list('audit', 'default')).map((r) => r.version),
            [10, 9, 2]
          )
        }))

      test('listScopeKeys is distinct, sorted and per name', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({ scopeKey: 'stage:b', version: 1, status: 'minting' })
          )
          await store.insertPending(
            record({ scopeKey: 'stage:a', version: 1, status: 'minting' })
          )
          await store.insertPending(
            record({ scopeKey: 'stage:a', version: 2, status: 'minting' })
          )
          await store.insertPending(
            record({ name: 'sealing', scopeKey: 'stage:z', status: 'minting' })
          )
          assert.deepEqual(await store.listScopeKeys('audit'), [
            'stage:a',
            'stage:b',
          ])
          assert.deepEqual(await store.listScopeKeys('nothing'), [])
        }))
    })

    describe('uniqueness', () => {
      test('a kid cannot be inserted twice, and the first row is untouched', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({ kid: 'dup', version: 1, publicKey: 'first' })
          )
          await assert.rejects(
            store.insertPending(
              record({ kid: 'dup', version: 2, publicKey: 'second' })
            )
          )
          const got = (await store.get('dup'))!
          assert.equal(got.publicKey, 'first')
          assert.equal(got.version, 1)
          assert.equal((await store.list('audit', 'default')).length, 1)
        }))

      test('a kid cannot be reused by firstActivate either', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({ kid: 'dup', version: 1, publicKey: 'first' })
          )
          await assert.rejects(
            store.firstActivate(
              record({ kid: 'dup', version: 2, scopeKey: 'other' })
            )
          )
          const got = (await store.get('dup'))!
          assert.equal(got.status, 'pending')
          assert.equal(got.publicKey, 'first')
        }))

      test('a version is unique per (name, scopeKey) and free in another scope or name', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({ kid: 'a', version: 1, status: 'minting' })
          )
          await assert.rejects(
            store.insertPending(
              record({ kid: 'b', version: 1, status: 'minting' })
            )
          )
          await store.insertPending(
            record({
              kid: 'c',
              version: 1,
              scopeKey: 'stage:1',
              status: 'minting',
            })
          )
          await store.insertPending(
            record({ kid: 'd', version: 1, name: 'sealing', status: 'minting' })
          )
          assert.equal(await store.get('b'), undefined)
        }))

      test('only one pending per (name, scopeKey)', () =>
        withStore(async (store) => {
          await store.insertPending(record({ kid: 'p1', version: 1 }))
          await assert.rejects(
            store.insertPending(record({ kid: 'p2', version: 2 }))
          )
          assert.equal(await store.get('p2'), undefined)
          // another scope and another name each have their own slot
          await store.insertPending(
            record({ kid: 'p3', version: 1, scopeKey: 'stage:1' })
          )
          await store.insertPending(
            record({ kid: 'p4', version: 1, name: 'sealing' })
          )
        }))

      test('minting rows do not take the pending slot', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({ kid: 'm1', version: 1, status: 'minting' })
          )
          await store.insertPending(
            record({ kid: 'm2', version: 2, status: 'minting' })
          )
          await store.insertPending(record({ kid: 'p', version: 3 }))
        }))

      test('only one active per (name, scopeKey)', () =>
        withStore(async (store) => {
          assert.equal(
            await store.firstActivate(record({ kid: 'a1', version: 1 })),
            true
          )
          assert.equal(
            await store.firstActivate(record({ kid: 'a2', version: 2 })),
            false
          )
          assert.equal(await store.get('a2'), undefined)
          assert.equal(
            await store.firstActivate(
              record({ kid: 'a3', version: 1, scopeKey: 'stage:1' })
            ),
            true
          )
        }))

      test('an active and a pending can sit side by side', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.insertPending(record({ kid: 'p', version: 2 }))
          assert.deepEqual(
            (await store.list('audit', 'default')).map((r) => [
              r.kid,
              r.status,
            ]),
            [
              ['p', 'pending'],
              ['a', 'active'],
            ]
          )
        }))
    })

    describe('status transitions', () => {
      test('markPlaced moves minting to pending once, with the public half', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({
              kid: 'k',
              version: 1,
              status: 'minting',
              publicKey: undefined,
            })
          )
          assert.equal(await store.markPlaced('k', 'SPKI', T1), true)
          const got = (await store.get('k'))!
          assert.equal(got.status, 'pending')
          assert.equal(got.publicKey, 'SPKI')
          assert.equal(await store.markPlaced('k', 'OTHER', T2), false)
          assert.equal((await store.get('k'))!.publicKey, 'SPKI')
        }))

      test('markPlaced refuses an unknown kid and a row that is not minting', () =>
        withStore(async (store) => {
          assert.equal(await store.markPlaced('nope', 'x', T1), false)
          await store.insertPending(
            record({ kid: 'p', version: 1, publicKey: 'orig' })
          )
          assert.equal(await store.markPlaced('p', 'x', T1), false)
          assert.equal((await store.get('p'))!.publicKey, 'orig')
        }))

      test('markPlaced fails, and leaves the row minting, while another is pending', () =>
        withStore(async (store) => {
          await store.insertPending(record({ kid: 'pend', version: 1 }))
          await store.insertPending(
            record({
              kid: 'mint',
              version: 2,
              status: 'minting',
              publicKey: undefined,
            })
          )
          await assert.rejects(store.markPlaced('mint', 'x', T1))
          assert.equal((await store.get('mint'))!.status, 'minting')
        }))

      test('markPublished stamps a pending row once', () =>
        withStore(async (store) => {
          await store.insertPending(record({ kid: 'p', version: 1 }))
          assert.equal(await store.markPublished('p', T1), true)
          assert.equal((await store.get('p'))!.publishedAt, T1)
          assert.equal(await store.markPublished('p', T2), false)
          assert.equal((await store.get('p'))!.publishedAt, T1)
          assert.equal(await store.markPublished('nope', T1), false)
        }))

      test('markPublished refuses a row that is not pending', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          assert.equal(await store.markPublished('a', T1), false)
          await store.insertPending(
            record({ kid: 'm', version: 2, status: 'minting' })
          )
          assert.equal(await store.markPublished('m', T1), false)
        }))

      test('promote makes the first pending active', () =>
        withStore(async (store) => {
          await store.insertPending(record({ kid: 'p', version: 1 }))
          assert.equal(await store.promote({ pendingKid: 'p', now: T1 }), true)
          const got = (await store.get('p'))!
          assert.equal(got.status, 'active')
          assert.equal(got.activatedAt, T1)
        }))

      test('promote swaps: the old active becomes previous with verifyUntil', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.insertPending(record({ kid: 'p', version: 2 }))
          assert.equal(
            await store.promote({
              pendingKid: 'p',
              activeKid: 'a',
              verifyUntil: T3,
              now: T2,
            }),
            true
          )
          const old = (await store.get('a'))!
          const next = (await store.get('p'))!
          assert.equal(old.status, 'previous')
          assert.equal(old.verifyUntil, T3)
          assert.equal(next.status, 'active')
          assert.equal(next.activatedAt, T2)
          // both slots are free again
          await store.insertPending(record({ kid: 'p2', version: 3 }))
          assert.equal(
            await store.promote({
              pendingKid: 'p2',
              activeKid: 'p',
              verifyUntil: T3,
              now: T3,
            }),
            true
          )
          assert.deepEqual(
            (await store.list('audit', 'default')).map((r) => r.status),
            ['active', 'previous', 'previous']
          )
        }))

      test('promote is false, and changes nothing, when either row is stale', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.insertPending(record({ kid: 'p', version: 2 }))
          // not the active row
          assert.equal(
            await store.promote({
              pendingKid: 'p',
              activeKid: 'p',
              verifyUntil: T3,
              now: T1,
            }),
            false
          )
          // unknown pending row
          assert.equal(
            await store.promote({
              pendingKid: 'nope',
              activeKid: 'a',
              verifyUntil: T3,
              now: T1,
            }),
            false
          )
          // an active exists but the caller did not name it
          assert.equal(await store.promote({ pendingKid: 'p', now: T1 }), false)
          // the named "pending" row is not pending
          assert.equal(
            await store.promote({
              pendingKid: 'a',
              activeKid: 'a',
              verifyUntil: T3,
              now: T1,
            }),
            false
          )
          assert.equal((await store.get('a'))!.status, 'active')
          assert.equal((await store.get('a'))!.verifyUntil ?? null, null)
          assert.equal((await store.get('p'))!.status, 'pending')
        }))

      test('promote refuses an active row from another scope', () =>
        withStore(async (store) => {
          await store.firstActivate(
            record({ kid: 'a', version: 1, scopeKey: 'stage:1' })
          )
          await store.insertPending(record({ kid: 'p', version: 1 }))
          assert.equal(
            await store.promote({
              pendingKid: 'p',
              activeKid: 'a',
              verifyUntil: T3,
              now: T1,
            }),
            false
          )
          assert.equal((await store.get('a'))!.status, 'active')
          assert.equal((await store.get('p'))!.status, 'pending')
        }))

      test('a minting row cannot be promoted', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({ kid: 'm', version: 1, status: 'minting' })
          )
          assert.equal(await store.promote({ pendingKid: 'm', now: T1 }), false)
        }))

      test('retire marks any live row retired once', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.insertPending(record({ kid: 'p', version: 2 }))
          await store.insertPending(
            record({ kid: 'm', version: 3, status: 'minting' })
          )
          assert.equal(await store.retire('p', T1), true)
          assert.equal(await store.retire('m', T1), true)
          assert.equal(await store.retire('a', T2), true)
          assert.equal(await store.retire('a', T3), false)
          assert.equal(await store.retire('nope', T3), false)
          const a = (await store.get('a'))!
          assert.equal(a.status, 'retired')
          assert.equal(a.retiredAt, T2)
          assert.equal((await store.get('p'))!.retiredAt, T1)
        }))

      test('a retired row frees its slot', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.insertPending(record({ kid: 'p', version: 2 }))
          await store.retire('a', T1)
          await store.retire('p', T1)
          assert.equal(
            await store.firstActivate(record({ kid: 'a2', version: 3 })),
            true
          )
          await store.insertPending(record({ kid: 'p2', version: 4 }))
        }))

      test('a previous row can be retired', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.insertPending(record({ kid: 'p', version: 2 }))
          await store.promote({
            pendingKid: 'p',
            activeKid: 'a',
            verifyUntil: T3,
            now: T1,
          })
          assert.equal(await store.retire('a', T2), true)
          assert.equal((await store.get('a'))!.status, 'retired')
          assert.equal((await store.get('p'))!.status, 'active')
        }))

      test('firstActivate keeps the given activatedAt, else uses createdAt', () =>
        withStore(async (store) => {
          await store.firstActivate(
            record({ kid: 'a', version: 1, createdAt: T1 })
          )
          assert.equal((await store.get('a'))!.activatedAt, T1)
          await store.firstActivate(
            record({
              kid: 'b',
              version: 1,
              scopeKey: 'x',
              createdAt: T1,
              activatedAt: T2,
            })
          )
          assert.equal((await store.get('b'))!.activatedAt, T2)
        }))
    })

    describe('compare-and-set', () => {
      test('one of two racing promotes of the same pending key wins', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.insertPending(record({ kid: 'p', version: 2 }))
          const args = {
            pendingKid: 'p',
            activeKid: 'a',
            verifyUntil: T3,
            now: T1,
          }
          const results = await Promise.all([
            store.promote(args),
            store.promote(args),
          ])
          assert.deepEqual(results.filter(Boolean), [true])
          assert.deepEqual(
            (await store.list('audit', 'default')).map((r) => r.status),
            ['active', 'previous']
          )
        }))

      test('one of two racing retires wins', () =>
        withStore(async (store) => {
          await store.insertPending(record({ kid: 'p', version: 1 }))
          const results = await Promise.all([
            store.retire('p', T1),
            store.retire('p', T2),
          ])
          assert.deepEqual(results.filter(Boolean), [true])
        }))

      test('updateCustody succeeds on the current rev and bumps it', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({
              kid: 'k',
              version: 1,
              custody: 'wrapped',
              privateRef: null,
              privateWrapped: 'old',
              metadata: { kekVersionId: 'kek-1' },
            })
          )
          assert.equal(
            await store.updateCustody(
              'k',
              { rev: 0 },
              { privateWrapped: 'new', metadata: { kekVersionId: 'kek-2' } }
            ),
            true
          )
          const got = (await store.get('k'))!
          assert.equal(got.privateWrapped, 'new')
          assert.deepEqual(got.metadata, { kekVersionId: 'kek-2' })
          assert.equal(got.rev, 1)
        }))

      test('updateCustody loses on a stale rev and changes nothing', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({
              kid: 'k',
              version: 1,
              privateWrapped: 'old',
              metadata: { a: 1 },
            })
          )
          assert.equal(
            await store.updateCustody(
              'k',
              { rev: 0 },
              { privateWrapped: 'v1' }
            ),
            true
          )
          assert.equal(
            await store.updateCustody(
              'k',
              { rev: 0 },
              { privateWrapped: 'v2' }
            ),
            false
          )
          const got = (await store.get('k'))!
          assert.equal(got.privateWrapped, 'v1')
          assert.equal(got.rev, 1)
          assert.equal(
            await store.updateCustody('nope', { rev: 0 }, { metadata: {} }),
            false
          )
        }))

      test('updateCustody touches only the fields it is given, and null clears', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({
              kid: 'k',
              version: 1,
              privateWrapped: 'w',
              metadata: { a: 1 },
            })
          )
          await store.updateCustody('k', { rev: 0 }, { metadata: { b: 2 } })
          let got = (await store.get('k'))!
          assert.equal(got.privateWrapped, 'w')
          assert.deepEqual(got.metadata, { b: 2 })
          await store.updateCustody('k', { rev: 1 }, { privateWrapped: null })
          got = (await store.get('k'))!
          assert.equal(got.privateWrapped ?? null, null)
          assert.deepEqual(got.metadata, { b: 2 })
          await store.updateCustody('k', { rev: 2 }, { metadata: null })
          got = (await store.get('k'))!
          assert.equal(got.metadata ?? null, null)
          assert.equal(got.rev, 3)
        }))

      test('the metadata key order does not defeat the compare-and-set', () =>
        withStore(async (store) => {
          await store.insertPending(
            record({
              kid: 'k',
              version: 1,
              metadata: { zebra: 1, apple: 2, nested: { y: 1, x: 2 } },
            })
          )
          const got = (await store.get('k'))!
          assert.deepEqual(got.metadata, {
            apple: 2,
            nested: { x: 2, y: 1 },
            zebra: 1,
          })
          assert.equal(
            await store.updateCustody(
              'k',
              { rev: got.rev },
              { metadata: { apple: 3 } }
            ),
            true
          )
        }))

      test('updateCustody does not move the status or the slots', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.updateCustody('a', { rev: 0 }, { metadata: { x: 1 } })
          assert.equal((await store.get('a'))!.status, 'active')
          assert.equal(
            await store.firstActivate(record({ kid: 'a2', version: 2 })),
            false
          )
        }))
    })

    describe('importRecords', () => {
      test('insert mode adds new rows and skips existing kids untouched', () =>
        withStore(async (store) => {
          await store.firstActivate(
            record({ kid: 'a', version: 1, publicKey: 'mine' })
          )
          const result = await store.importRecords(
            [
              record({ kid: 'a', version: 1, publicKey: 'theirs' }),
              record({
                kid: 'old',
                version: 0,
                status: 'retired',
                retiredAt: T1,
              }),
            ],
            { mode: 'insert' }
          )
          assert.deepEqual(result, { inserted: 1, updated: 0, skipped: 1 })
          assert.equal((await store.get('a'))!.publicKey, 'mine')
          assert.equal((await store.get('a'))!.rev, 0)
          assert.equal((await store.get('old'))!.status, 'retired')
        }))

      test('insert mode is safe to repeat', () =>
        withStore(async (store) => {
          const rows = [
            record({ kid: 'r', version: 1, status: 'retired', retiredAt: T1 }),
            record({ kid: 'a', version: 2, status: 'active' }),
          ]
          assert.deepEqual(
            await store.importRecords(rows, { mode: 'insert' }),
            {
              inserted: 2,
              updated: 0,
              skipped: 0,
            }
          )
          assert.deepEqual(
            await store.importRecords(rows, { mode: 'insert' }),
            {
              inserted: 0,
              updated: 0,
              skipped: 2,
            }
          )
        }))

      test('imported active rows hold the active slot', () =>
        withStore(async (store) => {
          await store.importRecords(
            [record({ kid: 'a', version: 1, status: 'active' })],
            { mode: 'insert' }
          )
          assert.equal(
            await store.firstActivate(record({ kid: 'b', version: 2 })),
            false
          )
          await store.importRecords(
            [record({ kid: 'p', version: 2, status: 'pending' })],
            { mode: 'insert' }
          )
          await assert.rejects(
            store.insertPending(record({ kid: 'p2', version: 3 }))
          )
        }))

      test('reconcile updates an existing row in full and bumps its rev', () =>
        withStore(async (store) => {
          await store.firstActivate(
            record({
              kid: 'a',
              version: 1,
              privateWrapped: 'old',
              metadata: { kekVersionId: 'kek-1' },
            })
          )
          const result = await store.importRecords(
            [
              record({
                kid: 'a',
                version: 1,
                status: 'retired',
                retiredAt: T2,
                privateWrapped: 'new',
                metadata: { kekVersionId: 'kek-2' },
              }),
            ],
            { mode: 'reconcile' }
          )
          assert.deepEqual(result, { inserted: 0, updated: 1, skipped: 0 })
          const got = (await store.get('a'))!
          assert.equal(got.status, 'retired')
          assert.equal(got.retiredAt, T2)
          assert.equal(got.privateWrapped, 'new')
          assert.deepEqual(got.metadata, { kekVersionId: 'kek-2' })
          assert.equal(got.rev, 1)
        }))

      test('reconcile of a retire-then-mint pair never meets a slot violation, in either input order', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          const retired = record({
            kid: 'a',
            version: 1,
            status: 'retired',
            retiredAt: T1,
          })
          const minted = record({ kid: 'b', version: 2, status: 'active' })
          // the new active row comes BEFORE the one it replaces
          const result = await store.importRecords([minted, retired], {
            mode: 'reconcile',
          })
          assert.deepEqual(result, { inserted: 1, updated: 1, skipped: 0 })
          assert.deepEqual(
            (await store.list('audit', 'default')).map((r) => [
              r.kid,
              r.status,
            ]),
            [
              ['b', 'active'],
              ['a', 'retired'],
            ]
          )
        }))

      test('reconcile of an existing pair swapping retired and active', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await store.importRecords(
            [
              record({
                kid: 'b',
                version: 2,
                status: 'retired',
                retiredAt: T0,
              }),
            ],
            { mode: 'insert' }
          )
          const result = await store.importRecords(
            [
              record({ kid: 'b', version: 2, status: 'active' }),
              record({
                kid: 'a',
                version: 1,
                status: 'retired',
                retiredAt: T1,
              }),
            ],
            { mode: 'reconcile' }
          )
          assert.equal(result.updated, 2)
          assert.equal((await store.get('a'))!.status, 'retired')
          assert.equal((await store.get('b'))!.status, 'active')
        }))

      test('a batch that breaks a rule stores nothing', () =>
        withStore(async (store) => {
          await store.firstActivate(record({ kid: 'a', version: 1 }))
          await assert.rejects(
            store.importRecords(
              [
                record({
                  kid: 'fine',
                  version: 5,
                  scopeKey: 'other',
                  status: 'active',
                }),
                record({ kid: 'x', version: 2, status: 'active' }),
              ],
              { mode: 'reconcile' }
            )
          )
          assert.equal(await store.get('fine'), undefined)
          assert.equal(await store.get('x'), undefined)
          assert.equal((await store.get('a'))!.status, 'active')
        }))
    })

    if (persists) {
      describe('persistence', () => {
        test('a new store over the same ledger sees every row, with every field', () =>
          withStore(async (first, harness) => {
            const rec = record({
              kid: 'persisted',
              version: 1,
              custody: 'wrapped',
              privateRef: null,
              privateWrapped: 'wrapped-bytes',
              metadata: { kekVersionId: 'kek-1', a_b: { c_d: 1 } },
            })
            await first.insertPending(rec)
            await first.insertPending(
              record({ kid: 'p', version: 2, scopeKey: 'stage:1' })
            )
            await first.promote({ pendingKid: 'persisted', now: T1 })
            const second = await harness.open()
            assert.deepEqual(
              norm(await second.get('persisted')),
              norm({ ...rec, status: 'active', activatedAt: T1 })
            )
            assert.deepEqual(await second.listScopeKeys('audit'), [
              'default',
              'stage:1',
            ])
            assert.equal(
              (await second.list('audit', 'default'))[0]!.kid,
              'persisted'
            )
          }))

        test('the slots survive too: a new store still refuses a second active', () =>
          withStore(async (first, harness) => {
            await first.firstActivate(record({ kid: 'a', version: 1 }))
            const second = await harness.open()
            assert.equal(
              await second.firstActivate(record({ kid: 'b', version: 2 })),
              false
            )
            await assert.rejects(
              second.insertPending(record({ kid: 'dup', version: 1 }))
            )
          }))
      })
    }

    if (sharedWriters) {
      describe('two connections', () => {
        test('a write by one is visible to the other at once', () =>
          withStore(async (a, harness) => {
            const b = await harness.open()
            await a.insertPending(record({ kid: 'k', version: 1 }))
            assert.equal((await b.get('k'))!.status, 'pending')
            await b.promote({ pendingKid: 'k', now: T1 })
            assert.equal((await a.get('k'))!.status, 'active')
          }))

        // A connection that loses a race may be refused outright (a SQLite
        // lock, a serialization failure) instead of answering false; either
        // way at most one wins and the ledger holds that winner's state.
        const settle = async (...runs: Promise<boolean>[]) => {
          const settled = await Promise.allSettled(runs)
          return settled.filter(
            (s) => s.status === 'fulfilled' && s.value === true
          ).length
        }

        test('two stores racing to promote the same pending key: one wins', () =>
          withStore(async (a, harness) => {
            const b = await harness.open()
            await a.firstActivate(record({ kid: 'a', version: 1 }))
            await a.insertPending(record({ kid: 'p', version: 2 }))
            const args = {
              pendingKid: 'p',
              activeKid: 'a',
              verifyUntil: T3,
              now: T1,
            }
            assert.equal(await settle(a.promote(args), b.promote(args)), 1)
            assert.deepEqual(
              (await a.list('audit', 'default')).map((r) => r.status),
              ['active', 'previous']
            )
          }))

        test('two stores racing to insert the same version: one wins', () =>
          withStore(async (a, harness) => {
            const b = await harness.open()
            const attempts = await Promise.allSettled([
              a.insertPending(record({ kid: 'x1', version: 1 })),
              b.insertPending(record({ kid: 'x2', version: 1 })),
            ])
            assert.equal(
              attempts.filter((s) => s.status === 'fulfilled').length,
              1
            )
            assert.equal((await a.list('audit', 'default')).length, 1)
          }))

        test('two stores racing for the first active key: one wins', () =>
          withStore(async (a, harness) => {
            const b = await harness.open()
            const wins = await settle(
              a.firstActivate(record({ kid: 'x1', version: 1 })),
              b.firstActivate(record({ kid: 'x2', version: 2 }))
            )
            assert.equal(wins, 1)
            assert.equal(
              (await a.list('audit', 'default')).filter(
                (r) => r.status === 'active'
              ).length,
              1
            )
          }))

        test('two stores racing an updateCustody on the same rev: one wins', () =>
          withStore(async (a, harness) => {
            const b = await harness.open()
            await a.insertPending(record({ kid: 'k', version: 1 }))
            const wins = await settle(
              a.updateCustody('k', { rev: 0 }, { privateWrapped: 'from-a' }),
              b.updateCustody('k', { rev: 0 }, { privateWrapped: 'from-b' })
            )
            assert.equal(wins, 1)
            const got = (await a.get('k'))!
            assert.equal(got.rev, 1)
            assert.ok(['from-a', 'from-b'].includes(got.privateWrapped!))
          }))
      })
    }
  })
}
