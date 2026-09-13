import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { CachedFlagSource } from './cached-flag-source.js'
import type { DeclaredFlag, FlagConfigSnapshot } from './flag.types.js'

class TestSource extends CachedFlagSource {
  public reads = 0
  public fail = false
  public value: FlagConfigSnapshot = {
    sandboxes: { enabled: true, rolloutPercent: null, overrides: {} },
  }

  protected async fetchSnapshot(): Promise<FlagConfigSnapshot> {
    this.reads++
    if (this.fail) {
      throw new Error('store is down')
    }
    return this.value
  }

  public expire(): void {
    this.invalidate()
  }

  public declare(flags: DeclaredFlag[]): void {
    this.setDeclared(flags)
  }
}

describe('CachedFlagSource', () => {
  test('reads once inside the ttl', async () => {
    const source = new TestSource({ ttlMs: 60_000 })
    await source.snapshot()
    await source.snapshot()
    assert.equal(source.reads, 1)
  })

  test('collapses concurrent reads into one', async () => {
    const source = new TestSource({ ttlMs: 60_000 })
    await Promise.all([source.snapshot(), source.snapshot(), source.snapshot()])
    assert.equal(source.reads, 1)
  })

  test('re-reads once invalidated', async () => {
    const source = new TestSource({ ttlMs: 60_000 })
    await source.snapshot()
    source.expire()
    await source.snapshot()
    assert.equal(source.reads, 2)
  })

  test('serves the last good snapshot when the store goes down', async () => {
    const source = new TestSource({ ttlMs: 60_000 })
    await source.snapshot()
    source.value = {
      sandboxes: { enabled: false, rolloutPercent: null, overrides: {} },
    }
    source.fail = true
    source.expire()

    const snapshot = await source.snapshot()
    assert.equal(snapshot['sandboxes']?.enabled, true)
  })

  test('falls back to the declaration only on a cold start', async () => {
    const source = new TestSource({
      ttlMs: 60_000,
      declared: [{ name: 'sandboxes' }],
    })
    source.fail = true

    const snapshot = await source.snapshot()
    assert.deepEqual(snapshot, {
      sandboxes: { enabled: true, rolloutPercent: null, overrides: {} },
    })
  })

  test('reports the declared set, so drift can be seen', async () => {
    const source = new TestSource({ declared: [{ name: 'sandboxes' }] })
    assert.deepEqual(source.declaredFlags(), [{ name: 'sandboxes' }])

    source.declare([{ name: 'sandboxes' }, { name: 'nightlyReindex' }])
    assert.deepEqual(
      source.declaredFlags().map((flag) => flag.name),
      ['sandboxes', 'nightlyReindex']
    )
  })
})
