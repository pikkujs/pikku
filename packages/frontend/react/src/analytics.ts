type NamedEvent = { name: string }

type PropsOf<TEvent extends NamedEvent, Name extends TEvent['name']> = Omit<
  Extract<TEvent, { name: Name }>,
  'name'
>

interface BufferedEvent {
  at: number
  event: NamedEvent
}

export interface CreateAnalyticsOptions {
  /** The ingest endpoint, or a getter for it when the API URL is resolved lazily. */
  endpoint: string | (() => string)
  flushIntervalMs?: number
  /** Flush early rather than let a burst grow unbounded; ingests cap a batch at 50. */
  maxBuffer?: number
}

export interface AnalyticsClient<TEvent extends NamedEvent> {
  event<Name extends TEvent['name']>(
    name: Name,
    props: PropsOf<TEvent, Name>
  ): void
  rawEvent(name: string, props: Record<string, unknown>): void
  flush(): void
  stop(): void
  registerClickListener(): () => void
}

/**
 * A buffered, beacon-based product-analytics client typed against the app's event union.
 *
 * Not a mutation hook: analytics has no loading or error state to render, must never
 * surface a failure to the user, and must not retry. The unload flush is why it buffers
 * at all — the last events before someone leaves are the abandon point, and a `fetch()`
 * fired during unload is cancelled while `sendBeacon` is queued by the browser.
 */
export function createAnalytics<TEvent extends NamedEvent>({
  endpoint,
  flushIntervalMs = 5_000,
  maxBuffer = 25,
}: CreateAnalyticsOptions): AnalyticsClient<TEvent> {
  let buffer: BufferedEvent[] = []
  let timer: ReturnType<typeof setInterval> | null = null
  let started = false

  const url = () => (typeof endpoint === 'function' ? endpoint() : endpoint)

  const flush = (): void => {
    if (buffer.length === 0) return
    const events = buffer
    buffer = []
    const body = JSON.stringify({ events })

    try {
      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function'
      ) {
        const blob = new Blob([body], { type: 'application/json' })
        if (navigator.sendBeacon(url(), blob)) return
      }
      void fetch(url(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        credentials: 'include',
        keepalive: true,
      }).catch(() => {})
    } catch {}
  }

  const start = (): void => {
    if (started || typeof window === 'undefined') return
    started = true
    timer = setInterval(flush, flushIntervalMs)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
    window.addEventListener('pagehide', flush)
  }

  const push = (event: NamedEvent): void => {
    if (typeof window === 'undefined') return
    start()
    buffer.push({ at: Date.now(), event })
    if (buffer.length >= maxBuffer) flush()
  }

  return {
    event: (name, props) => push({ name, ...props } as NamedEvent),
    rawEvent: (name, props) => push({ name, ...props }),
    flush,
    stop: () => {
      if (timer) clearInterval(timer)
      timer = null
    },
    registerClickListener: () => {
      const onClick = (e: Event) => {
        if (!(e.target instanceof Element)) return
        const el = e.target.closest<HTMLElement>('[data-analytics-click]')
        const name = el?.dataset.analyticsClick
        if (!el || !name) return

        const meta: Record<string, unknown> = {}
        for (let node: HTMLElement | null = el; node; node = node.parentElement) {
          const raw = node.dataset?.analyticsMeta
          if (!raw) continue
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>
            for (const [key, value] of Object.entries(parsed)) {
              if (!(key in meta)) meta[key] = value
            }
          } catch {}
        }
        push({ name, ...meta })
      }

      // Capture phase, because a bubble-phase listener on `document` never fires
      // when a component between calls `stopPropagation()`.
      document.addEventListener('click', onClick, { capture: true })
      return () =>
        document.removeEventListener('click', onClick, { capture: true })
    },
  }
}
