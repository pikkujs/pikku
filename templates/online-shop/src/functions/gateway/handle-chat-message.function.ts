import { pikkuSessionlessFunc } from '#pikku/function'

/**
 * The webchat gateway's handler.
 *
 * It exists because the websocket gateway was wired to `handlePaymentWebhook` —
 * the handler that marks orders paid or failed from the body of the message it
 * is given. Nothing reached it, because the demo adapter's `init` is a stub that
 * never registers a callback, so the mis-wiring was inert rather than
 * exploitable. It would not have stayed inert: the moment somebody filled that
 * adapter in to make chat work, an unauthenticated socket would have been able
 * to mark any order paid by naming its id.
 *
 * Two gateways of different types sharing one handler is the smell. A gateway
 * handler is written against the messages of exactly one source.
 */
// @coverage-unreachable a websocket gateway's message handler is never invoked in a generated app: `wireGateway` registers the channel with an inline empty `onMessage` and puts the real handler in channel meta, but codegen does not emit the gateway channel, so route resolution finds nothing and runs the stub. Framework gap, not a template one.
export const handleChatMessage = pikkuSessionlessFunc({
  expose: false,
  description: 'Handle an inbound webchat message from the websocket gateway.',
  func: async ({ logger }, { text }: { text: string; raw: unknown }) => {
    logger.info({ event: 'webchat_message', length: text.length })
    // A real shop would answer here — hand the text to the assistant agent, or
    // queue it for a human. Deliberately not the payment handler.
    return { received: true }
  },
})
