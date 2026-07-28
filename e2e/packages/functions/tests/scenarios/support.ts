/**
 * The small helpers the step files share.
 *
 * These are deliberately NOT in `@pikku/core`. Core carries what the scenario
 * runtime contract needs — the step wire, the browser-driver interface, the
 * transport's response shape — and what core itself implements. A formatter for
 * an assertion message and a reader for one suite's event streams are neither:
 * they are this suite's own vocabulary, and promoting them would put them in a
 * published package with no consumer inside it.
 */

/**
 * Renders a value the way an assertion message should quote it: a string as
 * itself, anything else as JSON. A step comparing what it found against what
 * was expected reaches for this so the failure names both, rather than saying
 * `[object Object]`.
 */
export const describeValue = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value)

/** Frame separator, per spec: a blank line in any of the three line endings. */
const FRAME = /\r\n\r\n|\n\n|\r\r/
const LINE = /\r\n|\n|\r/

/**
 * Drains a server-sent-event response into the events it carried.
 *
 * A frame is separated by a blank line and may spread its payload over several
 * `data:` lines, which the spec says to join with a newline — so a step cannot
 * read the stream a line at a time without silently dropping any event a
 * producer chose to wrap. Line endings matter as much as the join: a target
 * behind a proxy that normalises to CRLF answers one frame containing every
 * `data:` line, which a `\n\n` split reads as a single unparseable event.
 *
 * Comments, `event:` lines, keep-alives and the `[DONE]` terminator carry no
 * `data:` payload, so they are skipped before anything is parsed — no `catch`
 * is needed to recognise them. A frame that DOES carry a payload and will not
 * parse throws, naming the frame: it means the producer sent something this
 * suite does not understand, and silently returning fewer events turns that
 * into an assertion failure that blames the app.
 */
export const readSseEvents = async <T = unknown>(
  response: Response
): Promise<T[]> => {
  if (!response.body) {
    return []
  }
  const raw = await response.text().catch(() => '')
  const events: T[] = []
  for (const frame of raw.split(FRAME)) {
    const data = frame
      .split(LINE)
      .filter((line) => line.startsWith('data:'))
      .map((line) => stripOneSpace(line.slice('data:'.length)))
      .join('\n')
    if (!data || data === '[DONE]') {
      continue
    }
    try {
      events.push(JSON.parse(data) as T)
    } catch {
      throw new Error(
        `[scenario] an SSE frame carried a data payload that is not JSON: ${data.slice(0, 200)}`
      )
    }
  }
  return events
}

/** The spec strips exactly one space after the colon, and no more. */
const stripOneSpace = (value: string) =>
  value.startsWith(' ') ? value.slice(1) : value
