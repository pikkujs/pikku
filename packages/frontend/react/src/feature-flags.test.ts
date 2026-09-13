/**
 * Run: node --test packages/frontend/react/src/feature-flags.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFeatureFlags } from './feature-flags.ts'

const withFetch = <T>(
  impl: (url: string) => Promise<unknown>,
  body: (calls: string[]) => Promise<T> | T
): Promise<T> => {
  const calls: string[] = []
  const original = globalThis.fetch
  globalThis.fetch = ((url: string) => {
    calls.push(url)
    return impl(url)
  }) as typeof globalThis.fetch
  return Promise.resolve(body(calls)).finally(() => {
    globalThis.fetch = original
  })
}

const ok = (flags: Record<string, boolean>) =>
  Promise.resolve({ ok: true, json: async () => flags } as Response)

test('reads the bootstrapped map before any request lands', () => {
  const flags = createFeatureFlags<'sandboxes'>({
    endpoint: '/feature-flags',
    bootstrap: { sandboxes: true },
  })

  assert.equal(flags.has('sandboxes'), true)
  assert.equal(flags.ready, false, 'bootstrapped is not the same as confirmed')
})

test('an unknown flag is false rather than undefined', () => {
  const flags = createFeatureFlags<'sandboxes'>({ endpoint: '/feature-flags' })
  assert.equal(flags.has('sandboxes'), false)

  const open = createFeatureFlags<'sandboxes'>({
    endpoint: '/feature-flags',
    fallback: true,
  })
  assert.equal(open.has('sandboxes'), true)
})

test('the first subscriber starts one request, not one each', async () => {
  await withFetch(
    () => ok({ sandboxes: true }),
    async (calls) => {
      const flags = createFeatureFlags<'sandboxes'>({
        endpoint: '/feature-flags',
      })
      flags.subscribe(() => {})
      flags.subscribe(() => {})
      await flags.refresh()

      assert.equal(calls.length, 1)
      assert.equal(flags.has('sandboxes'), true)
      assert.equal(flags.ready, true)
    }
  )
})

test('a page with no flagged component never asks', async () => {
  await withFetch(
    () => ok({}),
    async (calls) => {
      createFeatureFlags<'sandboxes'>({ endpoint: '/feature-flags' })
      await Promise.resolve()
      assert.deepEqual(calls, [])
    }
  )
})

test('a failed refresh keeps what is already on screen', async () => {
  await withFetch(
    () => Promise.reject(new Error('offline')),
    async () => {
      const flags = createFeatureFlags<'sandboxes'>({
        endpoint: '/feature-flags',
        bootstrap: { sandboxes: true },
      })
      await flags.refresh()

      // Relabelling every flag on a blip is the failure mode this exists to
      // avoid: the feature was there a moment ago and nothing changed but the
      // network.
      assert.equal(flags.has('sandboxes'), true)
      assert.equal(flags.ready, true)
    }
  )
})

test('a non-ok response is not a map', async () => {
  await withFetch(
    () => Promise.resolve({ ok: false, json: async () => ({}) } as Response),
    async () => {
      const flags = createFeatureFlags<'sandboxes'>({
        endpoint: '/feature-flags',
        bootstrap: { sandboxes: true },
      })
      await flags.refresh()
      assert.equal(flags.has('sandboxes'), true)
    }
  )
})

test('notifies subscribers when the map lands', async () => {
  await withFetch(
    () => ok({ sandboxes: true }),
    async () => {
      const flags = createFeatureFlags<'sandboxes'>({
        endpoint: '/feature-flags',
      })
      let notified = 0
      const unsubscribe = flags.subscribe(() => notified++)
      await flags.refresh()

      assert.ok(notified > 0)
      unsubscribe()
      await flags.refresh()
      assert.equal(notified, 1, 'an unsubscribed listener stops hearing')
    }
  )
})

test('refresh re-reads, because capable moves with the session', async () => {
  let map: Record<string, boolean> = { sandboxes: false }
  await withFetch(
    () => ok(map),
    async (calls) => {
      const flags = createFeatureFlags<'sandboxes'>({
        endpoint: '/feature-flags',
      })
      await flags.refresh()
      assert.equal(flags.has('sandboxes'), false)

      map = { sandboxes: true }
      await flags.refresh()

      assert.equal(flags.has('sandboxes'), true)
      assert.equal(calls.length, 2)
    }
  )
})

test('resolves the endpoint lazily when it is a getter', async () => {
  let base = '/a'
  await withFetch(
    () => ok({}),
    async (calls) => {
      const flags = createFeatureFlags({
        endpoint: () => `${base}/feature-flags`,
      })
      await flags.refresh()
      base = '/b'
      await flags.refresh()
      assert.deepEqual(calls, ['/a/feature-flags', '/b/feature-flags'])
    }
  )
})
