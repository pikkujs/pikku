import { pikkuFetch } from '#pikku/pikku-fetch.gen.js'
import type { HTTPWiringHandlerOf } from '#pikku/http/pikku-http-wirings-map.gen.d.js'

type Ingest = HTTPWiringHandlerOf<'/analytics', 'POST'>['input']

/**
 * What this app can measure, as the generated ingest declares it.
 *
 * Taken from the wiring map rather than imported from the union directly, so
 * the browser is typed by the same schema the server validates against: an
 * event this file can name is an event the route will accept.
 */
export type AnalyticsEvent = Ingest['events'][number]['event']

/** Match the ingest's `.max(50)` — a larger batch is rejected whole. */
const MAX_BATCH = 50

/** Long enough to coalesce a burst of navigation, short enough that a closed tab loses little. */
const FLUSH_INTERVAL_MS = 5_000

let buffer: Ingest['events'] = []
let timer: ReturnType<typeof setTimeout> | null = null

const url = () => `${window.location.origin}/analytics`

/**
 * Send what is buffered.
 *
 * `keepalive` rather than a plain request: the flush that matters most is the
 * one on a page being closed, and an ordinary fetch is cancelled with the
 * document. Fire-and-forget in both directions — analytics must never block
 * navigation and must never surface an error to someone using the app, and a
 * batch lost to a closing tab is a row on a chart, not an order.
 */
export const flushAnalytics = () => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (buffer.length === 0) return
  const events = buffer
  buffer = []

  if (
    navigator.sendBeacon?.(
      url(),
      new Blob([JSON.stringify({ events })], { type: 'application/json' })
    )
  ) {
    return
  }

  void pikkuFetch.post('/analytics', { events }).catch(() => {})
}

/**
 * Queue one event.
 *
 * Buffered rather than sent immediately because a page view costs a request
 * nobody is waiting on, and a burst of navigation would otherwise be a burst of
 * requests. The buffer is flushed on an interval, when it fills, and when the
 * tab is hidden — the last of which is the important one, since the events just
 * before someone leaves are the ones a funnel is made of.
 */
export const recordEvent = (event: AnalyticsEvent) => {
  buffer.push({ at: Date.now(), event })
  if (buffer.length >= MAX_BATCH) {
    flushAnalytics()
    return
  }
  timer ??= setTimeout(flushAnalytics, FLUSH_INTERVAL_MS)
}

let started = false

/**
 * Point the client at this page's own origin and flush on the way out.
 *
 * `visibilitychange` rather than `unload`: a backgrounded mobile tab is
 * routinely killed without ever firing an unload, which is exactly the session
 * whose last events are worth keeping.
 */
export const startAnalytics = () => {
  if (started || typeof window === 'undefined') return
  started = true
  pikkuFetch.setServerUrl(window.location.origin)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAnalytics()
  })
}
