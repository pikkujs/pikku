import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { CachedFlagSource } from './cached-flag-source.js'
import type { DeclaredFlag, FlagConfigSnapshot } from './flag.types.js'

class TestSource extends CachedFlagSource {
  public reads = 0
  public fail = false
  public hold = false
  private gate: (() => void) | undefined
  public value: FlagConfigSnapshot = {
    sandboxes: { enabled: true, rolloutPercent: null, overrides: {} },
  }

  protected async fetchSnapshot(): Promise<FlagConfigSnapshot> {
    this.reads++
    if (this.hold) {
      const value = this.value
      await new Promise<void>((resolve) => {
        this.gate = resolve
      })
      if (this.fail) {
        throw new Error('store is down')
      }
      return value
    }
    if (this.fail) {
      throw new Error('store is down')
    }
    return this.value
  }

  /** Lets a held read finish, answering the store as it was when it started. */
  public release(): void {
    this.gate?.()
    this.gate = undefined
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
    source.invalidate()
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
    source.invalidate()

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

  test('does not let a read started before an invalidate answer for it', async () => {
    // The webhook lands mid-fetch. The in-flight read is answering the store
    // as it was before the change, so caching it would stamp the pre-webhook
    // snapshot fresh and sit on the kill switch for another whole TTL.
    const source = new TestSource({ ttlMs: 60_000 })
    source.hold = true
    const first = source.snapshot()

    source.value = {
      sandboxes: { enabled: false, rolloutPercent: null, overrides: {} },
    }
    source.invalidate()
    source.release()
    await first

    source.hold = false
    const second = await source.snapshot()
    assert.equal(second['sandboxes']?.enabled, false)
    assert.equal(source.reads, 2)
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
