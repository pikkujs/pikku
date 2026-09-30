/**
 * A project's change-queue events, as a wake-up signal for `changes next`.
 *
 * fabric publishes on `changes:<projectId>` when an item is filed and when a
 * person answers on its thread. An event is only a hint — the caller re-reads
 * `listChanges` for the truth — so nothing here parses or trusts its payload.
 */
export interface ChangeEvents {
  /** True while the stream is connected; polling slows to a safety net. */
  readonly live: boolean
  /**
   * Resolves on the next event, and also when the stream connects or drops,
   * so a caller sleeping on the slow safety interval notices it has lost its
   * signal. Never rejects.
   */
  next(): Promise<void>
  close(): void
}

export interface SubscribeOptions {
  apiUrl: string
  token: string
  projectId: string
  fetch?: typeof fetch
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  log?: (line: string) => void
}

const FIRST_RETRY_MS = 1_000
const MAX_RETRY_MS = 60_000

/** Statuses that will not change by retrying: no such route, or not allowed. */
const PERMANENT = new Set([401, 403, 404, 405, 501])

const abortableSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })

export function subscribeToChanges(options: SubscribeOptions): ChangeEvents {
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? abortableSleep
  const log = options.log ?? (() => {})
  const controller = new AbortController()
  const url = `${options.apiUrl.replace(/\/$/, '')}/events/${encodeURIComponent(`changes:${options.projectId}`)}`

  let live = false
  let waiters: (() => void)[] = []
  const wake = () => {
    const woken = waiters
    waiters = []
    woken.forEach((resolve) => resolve())
  }
  const setLive = (value: boolean) => {
    if (live === value) return
    live = value
    wake()
  }

  const readEvents = async (body: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end + 2)
        if (block.split('\n').some((line) => line.startsWith('data:'))) wake()
      }
    }
  }

  const run = async () => {
    let retry = FIRST_RETRY_MS
    while (!controller.signal.aborted) {
      let dropped: string
      try {
        const response = await doFetch(url, {
          headers: {
            Accept: 'text/event-stream',
            Authorization: `Bearer ${options.token}`,
          },
          signal: controller.signal,
        })
        if (PERMANENT.has(response.status)) {
          log(
            `fabric has no change events for this session (${response.status}); polling instead.`
          )
          return
        }
        if (response.ok && response.body) {
          setLive(true)
          retry = FIRST_RETRY_MS
          await readEvents(response.body)
          dropped = 'the stream ended'
        } else {
          dropped = `HTTP ${response.status}`
        }
      } catch (error) {
        dropped = error instanceof Error ? error.message : String(error)
      }
      if (controller.signal.aborted) return
      setLive(false)
      log(
        `change events dropped (${dropped}); polling until they reconnect in ${Math.round(retry / 1000)}s`
      )
      await sleep(retry, controller.signal)
      retry = Math.min(MAX_RETRY_MS, retry * 2)
    }
  }

  void run().finally(() => setLive(false))

  return {
    get live() {
      return live
    },
    next: () =>
      controller.signal.aborted
        ? new Promise<void>(() => {})
        : new Promise<void>((resolve) => waiters.push(resolve)),
    close: () => {
      controller.abort()
      waiters = []
    },
  }
}
