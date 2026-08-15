export const randomUUID = (): string => globalThis.crypto.randomUUID()

/**
 * The tool result stored and streamed when a user denies an approval.
 *
 * Two readers, one string. The model needs the sentence — it has to tell the
 * user the action was declined and not retry it. A client needs to know a
 * denial when it sees one, so it can render the call as denied rather than as
 * a successful call that happened to return prose; that is what `approved`
 * carries, and it is the same flag a client sets optimistically the moment the
 * deny button is clicked. Emitting only the sentence made the two disagree:
 * live the call showed denied, and on any re-render from storage the same call
 * came back green.
 */
export const deniedToolResult = (): string =>
  JSON.stringify({
    approved: false,
    message:
      'The user explicitly declined this action. Inform them that it was declined and do not retry.',
  })
