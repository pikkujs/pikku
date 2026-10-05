import type { AnalyticsEvent } from '@project/functions-sdk/types'
import { apiUrl } from '@/lib/env'

/**
 * Buffered product-analytics client.
 *
 * Deliberately **not** a `useMutation`. That hook exists for async work with
 * user-visible state — `isPending` drives a spinner, `error` renders. Analytics
 * has neither, must never surface a failure to the user, and must not retry
 * aggressively. So: a buffer, flushed on an interval, on size, and on the page
 * going away.
 *
 * The unload flush is the one that matters. The last events before someone
 * leaves are the abandon point — the most valuable rows in any funnel — and a
 * plain `fetch()` fired during unload is cancelled. `sendBeacon` is queued by
 * the browser and survives the page.
 */

/** Payload of an event, i.e. everything the registry declares except its name. */
type PropsOf<Name extends AnalyticsEvent['name']> = Omit<
  Extract<AnalyticsEvent, { name: Name }>,
  'name'
>

interface BufferedEvent {
  at: number
  event: AnalyticsEvent
}

const FLUSH_INTERVAL_MS = 5_000
/** Flush early rather than let a burst grow unbounded; the ingest caps a batch at 50. */
const MAX_BUFFER = 25

let buffer: BufferedEvent[] = []
let timer: ReturnType<typeof setInterval> | null = null
let listenersBound = false

function endpoint(): string {
  return `${apiUrl()}/analytics`
}

function flush(): void {
  if (buffer.length === 0) return
  const events = buffer
  buffer = []

  const body = JSON.stringify({ events })
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // A Blob with an explicit type is what makes the beacon arrive as JSON;
      // a bare string is sent as text/plain and the ingest would reject it.
      const queued = navigator.sendBeacon(
        endpoint(),
        new Blob([body], { type: 'application/json' }),
      )
      if (queued) return
      // The beacon queue is full or the payload is over the browser's cap —
      // fall through to keepalive rather than silently dropping the batch.
    }
    void fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'include',
      keepalive: true,
    }).catch(() => {
      // Analytics is lossy-tolerant and must never reach the user. A dropped
      // batch is not retried: a retry storm on a failing endpoint costs the app
      // real requests to recover data nobody is waiting for.
    })
  } catch {
    // Same reasoning — never let instrumentation throw into app code.
  }
}

function ensureStarted(): void {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true

  timer = setInterval(flush, FLUSH_INTERVAL_MS)

  // `visibilitychange → hidden` is the reliable "the page may be going away"
  // signal on mobile, where `beforeunload`/`unload` often never fire at all
  // (the tab is frozen or killed instead).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
}

/**
 * Record an event. Typed against the registry in
 * `packages/functions/src/analytics.ts` — an unknown name or a wrong
 * payload is a build error, not a silently forked series.
 */
export function recordEvent<Name extends AnalyticsEvent['name']>(
  name: Name,
  props: PropsOf<Name>,
): void {
  if (typeof window === 'undefined') return
  ensureStarted()
  buffer.push({ at: Date.now(), event: { name, ...props } as AnalyticsEvent })
  if (buffer.length >= MAX_BUFFER) flush()
}

/**
 * Record an event whose name is only known at runtime — the `data-analytics-click`
 * path, where the name is a DOM attribute.
 *
 * This is the untyped door, and that is exactly why the typed `recordEvent` is
 * the primitive: a name that is not in the registry is rejected by the ingest's
 * schema at runtime rather than caught at build time. Use `recordEvent` unless
 * the name genuinely comes from markup.
 *
 * Note the blast radius. Validation is over the whole batch, so one
 * `data-analytics-click` naming an event the registry does not declare fails
 * the request that carries it and takes the other buffered events with it. A
 * typo'd attribute costs more than its own event — check the network tab for a
 * 400 from `/analytics` when a series goes quiet.
 */
export function recordRawEvent(name: string, props: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  ensureStarted()
  buffer.push({ at: Date.now(), event: { name, ...props } as unknown as AnalyticsEvent })
  if (buffer.length >= MAX_BUFFER) flush()
}

/** Flush now. Exposed for tests and for a deliberate flush before a full page navigation. */
export function flushAnalytics(): void {
  flush()
}

/** Stop the interval. Only useful in tests — the client is a module singleton. */
export function stopAnalytics(): void {
  if (timer) clearInterval(timer)
  timer = null
}
