/**
 * Drains a server-sent-event response into the events it carried.
 *
 * A frame is separated by a blank line and may spread its payload over several
 * `data:` lines, which the spec says to join — so a step cannot read the stream
 * a line at a time without silently dropping any event a producer chose to
 * wrap. Comments, `event:` lines, keep-alives and the `[DONE]` terminator carry
 * no payload and are not events. A frame that will not parse is skipped rather
 * than thrown on: a stream is asserted on by what it delivered, and one
 * malformed keep-alive should not fail a scenario about run status.
 */
export const readScenarioSseEvents = async <T = unknown>(
  response: Response
): Promise<T[]> => {
  if (!response.body) {
    return []
  }
  const raw = await response.text().catch(() => '')
  const events: T[] = []
  for (const frame of raw.split('\n\n')) {
    const data = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('')
    if (!data || data === '[DONE]') {
      continue
    }
    try {
      events.push(JSON.parse(data) as T)
    } catch {
      // Not JSON — a comment or keep-alive frame, not an event.
    }
  }
  return events
}
