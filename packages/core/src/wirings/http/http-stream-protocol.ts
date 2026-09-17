import type { HTTPStreamProtocol } from './http.types.js'

/**
 * The frames that terminate a stream whose function threw after the response
 * was already committed to streaming.
 *
 * A stream's consumer parses every frame against the protocol it was promised,
 * so an error announced in the wrong one reaches it as a parser failure with
 * the actual message nowhere in sight. AG-UI accepts `RUN_ERROR` as the first
 * event as readily as the last, and forbids anything after it, so a failure
 * there is that one frame — never a trailing `done`.
 */
export const streamErrorFrames = (
  protocol: HTTPStreamProtocol | undefined,
  message: string
): Array<Record<string, unknown>> => {
  if (protocol === 'agui') {
    return [{ type: 'RUN_ERROR', message }]
  }
  return [{ type: 'error', errorText: message }, { type: 'done' }]
}
