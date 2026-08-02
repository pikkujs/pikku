import {
  CHANNEL_RPC_PENDING,
  CHANNEL_RPC_RESPONSE,
  isCapabilityDef,
  isChannelRPCRequest,
  resolveCapability,
  type ApprovalRequester,
  type Capabilities,
  type ChannelRPCPending,
  type ChannelRPCResponse,
} from './channel-rpc.types.js'

/**
 * Answers reverse RPC requests arriving on a channel.
 *
 * `capabilities` is the authorisation boundary, not a convenience: the peer is
 * asking this process to execute code, so only listed names run. An absent
 * name is refused exactly like an unknown one, so the caller cannot probe for
 * what this end can do.
 */
export const createChannelRPCResponder = ({
  capabilities,
  send,
  approve,
}: {
  capabilities: Capabilities
  send: (data: unknown) => Promise<void> | void
  /** Omitted means there is nobody to ask, which refuses rather than runs. */
  approve?: ApprovalRequester
}) => {
  return async (message: unknown): Promise<boolean> => {
    if (!isChannelRPCRequest(message)) {
      return false
    }

    const refuse = (name: string, why: string): ChannelRPCResponse => ({
      action: CHANNEL_RPC_RESPONSE,
      id: message.id,
      ok: false,
      error: { name, message: why },
    })

    // Own properties only: an object literal inherits from `Object.prototype`,
    // so a peer asking for `toString` would otherwise resolve a real function.
    const entry = Object.prototype.hasOwnProperty.call(
      capabilities,
      message.funcName
    )
      ? capabilities[message.funcName]
      : undefined

    if (
      entry === undefined ||
      (typeof entry !== 'function' && !isCapabilityDef(entry))
    ) {
      await send(
        refuse(
          'RPCNotFoundError',
          `Capability not exposed: ${message.funcName}`
        )
      )
      return true
    }

    const { execute, needsApproval, approvalDescriptionFn } =
      resolveCapability(entry)

    let response: ChannelRPCResponse
    try {
      if (needsApproval) {
        if (!approve) {
          await send(
            refuse(
              'RPCNotApprovedError',
              `"${message.funcName}" needs approval and there is nobody to ask`
            )
          )
          return true
        }

        // Before the asking, not after: an answer arriving past the caller's
        // timeout is dropped, silently discarding the human's decision.
        const description = await approvalDescriptionFn?.(message.data)
        await send({
          action: CHANNEL_RPC_PENDING,
          id: message.id,
          reason: description ?? `approval for ${message.funcName}`,
        } satisfies ChannelRPCPending)

        const approved = await approve({
          funcName: message.funcName,
          data: message.data,
          description,
        })
        if (!approved) {
          await send(
            refuse('RPCDeniedError', `"${message.funcName}" was not approved`)
          )
          return true
        }
      }

      response = {
        action: CHANNEL_RPC_RESPONSE,
        id: message.id,
        ok: true,
        result: await execute(message.data),
      }
    } catch (e: unknown) {
      const error = e as Error
      response = refuse(error?.name ?? 'Error', error?.message ?? String(e))
    }

    await send(response)
    return true
  }
}
