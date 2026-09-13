/**
 * Run: node --test packages/frontend/react/src/analytics.test.ts
 *
 * The browser globals are stubbed rather than mocked through a DOM, because
 * what is under test is when the client decides to send and what it decides to
 * send — `sendBeacon` versus `fetch`, the consent re-read, the unload flush.
 * None of that needs a document, and a DOM would hide the ordering.
 */
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createAnalytics } from './analytics.ts'

type Sent = { url: string; body: string; via: 'beacon' | 'fetch' }

interface Harness {
  sent: Sent[]
  listeners: Map<string, Array<() => void>>
  tick(): void
  restore(): void
}

// `navigator` is a getter-only global in Node, so every stub goes through
// `defineProperty` and every restore puts the original descriptor back.
const originals = new Map<string, PropertyDescriptor | undefined>()

const restoreGlobals = () => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else delete (globalThis as Record<string, unknown>)[name]
  }
  originals.clear()
}

const stubBrowser = ({
  beaconAccepts = true,
}: { beaconAccepts?: boolean } = {}): Harness => {
  const sent: Sent[] = []
  const listeners = new Map<string, Array<() => void>>()
  const timers: Array<() => void> = []

  const addEventListener = (name: string, fn: () => void) => {
    listeners.set(name, [...(listeners.get(name) ?? []), fn])
  }

  const stub = (name: string, value: unknown) => {
    if (!originals.has(name)) {
      originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    }
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    })
  }

  stub('window', { addEventListener })
  stub('document', { addEventListener, visibilityState: 'visible' })
  stub('Blob', class {
    parts: string[]
    constructor(parts: string[]) {
      this.parts = parts
    }
  })
  stub('navigator', {
    sendBeacon: (url: string, blob: { parts: string[] }) => {
      if (!beaconAccepts) return false
      sent.push({ url, body: blob.parts.join(''), via: 'beacon' })
      return true
    },
  })
  stub('fetch', async (url: string, init: { body: string }) => {
    sent.push({ url, body: init.body, via: 'fetch' })
    return { ok: true } as Response
  })
  // The interval is collected rather than run: a test that waits on real time
  // is a test that is slow when it passes and flaky when it does not.
  stub('setInterval', (fn: () => void) => {
    timers.push(fn)
    return 0 as unknown as ReturnType<typeof setInterval>
  })
  stub('clearInterval', () => {})

  return {
    sent,
    listeners,
    tick: () => timers.forEach((fn) => fn()),
    restore: restoreGlobals,
  }
}

type Event = { name: 'viewed'; path: string } | { name: 'clicked'; id: string }

const bodyOf = (sent: Sent) =>
  (JSON.parse(sent.body) as { events: Array<{ event: Event }> }).events.map(
    (entry) => entry.event
  )

afterEach(restoreGlobals)

test('holds events until a flush, then sends them as one batch', () => {
  const browser = stubBrowser()
  const analytics = createAnalytics<Event>({ endpoint: '/analytics' })

  analytics.event('viewed', { path: '/' })
  analytics.event('viewed', { path: '/pricing' })
  assert.equal(browser.sent.length, 0, 'an event is not a request')

  analytics.flush()

  assert.equal(browser.sent.length, 1)
  assert.deepEqual(bodyOf(browser.sent[0]!), [
    { name: 'viewed', path: '/' },
    { name: 'viewed', path: '/pricing' },
  ])
})

test('an empty buffer sends nothing at all', () => {
  const browser = stubBrowser()
  const analytics = createAnalytics<Event>({ endpoint: '/analytics' })

  analytics.flush()
  browser.tick()

  assert.equal(browser.sent.length, 0)
})

/**
 * The consent contract: the answer is read at the moment of sending, so a
 * visitor who accepts mid-session is measured from then on and one who refuses
 * has their backlog dropped rather than parked.
 */
test('reads consent at each flush, and discards what it may not send', () => {
  const browser = stubBrowser()
  let granted = false
  const analytics = createAnalytics<Event>({
    endpoint: '/analytics',
    enabled: () => granted,
  })

  analytics.event('viewed', { path: '/' })
  analytics.flush()
  assert.equal(browser.sent.length, 0, 'nothing leaves before consent')

  granted = true
  analytics.flush()
  assert.equal(
    browser.sent.length,
    0,
    'and the refused events are gone, not waiting'
  )

  analytics.event('viewed', { path: '/pricing' })
  analytics.flush()
  assert.deepEqual(bodyOf(browser.sent[0]!), [
    { name: 'viewed', path: '/pricing' },
  ])
})

test('a burst is sent early rather than growing unbounded', () => {
  const browser = stubBrowser()
  const analytics = createAnalytics<Event>({
    endpoint: '/analytics',
    maxBuffer: 3,
  })

  analytics.event('clicked', { id: 'a' })
  analytics.event('clicked', { id: 'b' })
  assert.equal(browser.sent.length, 0)
  analytics.event('clicked', { id: 'c' })

  assert.equal(browser.sent.length, 1)
  assert.equal(bodyOf(browser.sent[0]!).length, 3)
})

test('sends by beacon, and falls back to fetch when the browser refuses it', () => {
  const queued = stubBrowser()
  const first = createAnalytics<Event>({ endpoint: '/analytics' })
  first.event('viewed', { path: '/' })
  first.flush()
  assert.equal(queued.sent[0]?.via, 'beacon')
  queued.restore()

  const refused = stubBrowser({ beaconAccepts: false })
  const second = createAnalytics<Event>({ endpoint: '/analytics' })
  second.event('viewed', { path: '/' })
  second.flush()
  assert.equal(refused.sent[0]?.via, 'fetch')
})

/**
 * The reason the client buffers at all: the last events before someone leaves
 * are the ones that say where they gave up.
 */
test('sends what it is holding when the page goes away', () => {
  const browser = stubBrowser()
  const analytics = createAnalytics<Event>({ endpoint: '/analytics' })

  analytics.event('viewed', { path: '/checkout' })
  browser.listeners.get('pagehide')?.forEach((fn) => fn())

  assert.deepEqual(bodyOf(browser.sent[0]!), [
    { name: 'viewed', path: '/checkout' },
  ])
})

test('resolves a lazily configured endpoint at send time', () => {
  const browser = stubBrowser()
  let apiUrl = '/old'
  const analytics = createAnalytics<Event>({ endpoint: () => apiUrl })

  apiUrl = '/analytics'
  analytics.event('viewed', { path: '/' })
  analytics.flush()

  assert.equal(browser.sent[0]?.url, '/analytics')
})

test('stopping the timer leaves an explicit flush working', () => {
  const browser = stubBrowser()
  const analytics = createAnalytics<Event>({ endpoint: '/analytics' })

  analytics.event('viewed', { path: '/' })
  analytics.stop()
  browser.tick()
  assert.equal(browser.sent.length, 1, 'stop does not drop what is buffered')
})
