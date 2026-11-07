/**
 * What to do with a frame whose `data:` is not JSON. `subscribeToSSE` has always
 * skipped them; a stream the caller reads to the end (an agent run) throws,
 * because a frame it cannot read is a frame it has lost.
 */
export type MalformedFrame = 'skip' | 'throw'

/**
 * Parses one server-sent event frame into the JSON its `data:` lines carry.
 * Returns `undefined` for a frame without data (a comment or keep-alive).
 */
const parseFrame = <T>(
  raw: string,
  malformed: MalformedFrame
): { event: T } | undefined => {
  const data = raw
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return undefined
  try {
    return { event: JSON.parse(data) as T }
  } catch {
    if (malformed === 'skip') return undefined
    throw new Error(`Malformed server event: ${data.slice(0, 200)}`)
  }
}

/**
 * Reads a `text/event-stream` body and yields the JSON in each `data:` frame, in order.
 * A frame split across network chunks is held until its blank-line terminator arrives;
 * a final frame without one is still read when the body ends.
 *
 * Cancelling stops the read: aborting the request's `AbortSignal` makes the next read
 * throw, and leaving a `for await` loop early releases the body.
 *
 * @param body - The response body to read.
 * @param malformed - Whether a frame that is not JSON is skipped or throws. Defaults to `'throw'`.
 */
export async function* readServerEvents<T = unknown>(
  body: ReadableStream<Uint8Array>,
  malformed: MalformedFrame = 'throw'
): AsyncGenerator<T, void, undefined> {
  const reader = body.getReader()
  // `stream: true` keeps a multi-byte character split across chunks intact.
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = parseFrame<T>(buffer.slice(0, sep), malformed)
        buffer = buffer.slice(sep + 2)
        if (frame) yield frame.event
      }
    }
    buffer += decoder.decode()
    const last = parseFrame<T>(buffer, malformed)
    if (last) yield last.event
  } finally {
    // Reached on an early `break` as well as on the end of the body: either
    // way nothing more will be read, so the connection is let go.
    await reader.cancel().catch(() => {})
  }
}
