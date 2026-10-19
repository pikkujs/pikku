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
 * plain `fetch()` fired during unload is cancelled. `fetch(..., { keepalive:
 * true })` is not: the request outlives the document, and unlike `sendBeacon` it
 * still carries the origin and the session cookie the ingest checks for.
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
    // `fetch` with `keepalive`, not `navigator.sendBeacon`.
    //
    // sendBeacon looks like the right tool and is the wrong one here. It gives
    // the caller no control over headers or credentials, and a beacon queued as
    // the document goes away can reach the server with neither `Origin` nor
    // `Referer` — which is precisely what the ingest's origin lock rejects, so
    // the unload flush this whole module exists for was answered with a 403 and
    // logged as a console error on the next page. `keepalive` survives unload
    // for the same reason sendBeacon does (the request outlives the document),
    // while still sending the origin and the session cookie.
    //
    // The cost is the 64KB keepalive body cap, which a batch of at most 25
    // events is nowhere near.
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
 * `packages/functions/src/analytics/registry.ts` — an unknown name or a wrong
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
