/**
 * Envelope actions for request/response RPC carried over an already-open
 * channel. Both directions share one socket, so every frame is tagged and
 * correlated by `id`.
 */
export const CHANNEL_RPC_REQUEST = 'pikku-rpc-request'
export const CHANNEL_RPC_RESPONSE = 'pikku-rpc-response'
export const CHANNEL_RPC_PENDING = 'pikku-rpc-pending'

export interface ChannelRPCRequest {
  action: typeof CHANNEL_RPC_REQUEST
  id: string
  funcName: string
  data: unknown
  traceId?: string
}

export interface ChannelRPCResponse {
  action: typeof CHANNEL_RPC_RESPONSE
  id: string
  ok: boolean
  result?: unknown
  error?: { name: string; message: string }
}

/**
 * "Still working on it — a human is being asked." Stops the caller's timeout,
 * which otherwise fails any approval slower than it and then discards the
 * answer when it arrives. Grants nothing: a peer that sends it dishonestly can
 * only keep its own call waiting.
 */
export interface ChannelRPCPending {
  action: typeof CHANNEL_RPC_PENDING
  id: string
  reason?: string
}

const isRecord = (message: unknown): message is Record<string, unknown> =>
  typeof message === 'object' && message !== null

/**
 * The guards check the whole envelope, not just the action tag: `id` is peer
 * input and is used as a map key, so a frame carrying one of the wrong type
 * must not reach `settle`.
 */
export const isChannelRPCRequest = (
  message: unknown
): message is ChannelRPCRequest =>
  isRecord(message) &&
  message.action === CHANNEL_RPC_REQUEST &&
  typeof message.id === 'string' &&
  message.id.length > 0 &&
  typeof message.funcName === 'string' &&
  message.funcName.length > 0 &&
  (message.traceId === undefined || typeof message.traceId === 'string')

export const isChannelRPCResponse = (
  message: unknown
): message is ChannelRPCResponse =>
  isRecord(message) &&
  message.action === CHANNEL_RPC_RESPONSE &&
  typeof message.id === 'string' &&
  message.id.length > 0 &&
  typeof message.ok === 'boolean'

export const isChannelRPCPending = (
  message: unknown
): message is ChannelRPCPending =>
  isRecord(message) &&
  message.action === CHANNEL_RPC_PENDING &&
  typeof message.id === 'string' &&
  message.id.length > 0 &&
  (message.reason === undefined || typeof message.reason === 'string')

/** `reason` exists so a dropped socket cannot look like a resolved call. */
export class ChannelRPCError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'timeout'
      | 'closed'
      | 'remote'
      | 'invalid'
      | 'unsupported'
  ) {
    super(message)
    this.name = 'ChannelRPCError'
  }
}

/**
 * Whether a callable exposed to a remote decider needs a human to agree before
 * it runs, and how to describe the invocation while asking.
 *
 * Shared with `AgentToolDef`: both are an allowlist of named callables
 * invoked by something other than the code that wrote them. The runtime around
 * them is not shared — an agent suspends and resumes, a reverse call is a live
 * await.
 */
export interface ApprovalPolicy {
  needsApproval: boolean
  approvalDescriptionFn?: (input: unknown) => Promise<string> | string
}

export type CapabilityHandler = (data: any) => Promise<unknown> | unknown

/**
 * `needsApproval` is required here on purpose. On `AgentToolDef` the same
 * field is optional and absence means "do not ask"; here absence means the
 * opposite, so it must not be expressible — a bare function is the
 * unclassified form.
 */
export interface CapabilityDef extends ApprovalPolicy {
  execute: CapabilityHandler
}

export type Capability = CapabilityHandler | CapabilityDef

export type Capabilities = Record<string, Capability>

export const isCapabilityDef = (
  capability: Capability
): capability is CapabilityDef =>
  typeof capability === 'object' &&
  capability !== null &&
  typeof (capability as CapabilityDef).execute === 'function'

/**
 * A bare function is unclassified, which resolves to needing approval:
 * forgetting the annotation costs a prompt rather than costing a key.
 */
export const resolveCapability = (
  capability: Capability
): { execute: CapabilityHandler } & ApprovalPolicy =>
  isCapabilityDef(capability)
    ? capability
    : { execute: capability, needsApproval: true }

/** Returning false refuses the call, and the peer is told so. */
export type ApprovalRequester = (request: {
  funcName: string
  data: unknown
  description?: string
}) => Promise<boolean> | boolean

/** Checks one end of a call — arguments going out, or the answer coming back. */
export type ChannelRPCValidator = (
  funcName: string,
  value: unknown
) => Promise<void> | void

/**
 * `remote` for wires with no peer that answers — a server-sent stream, an
 * agent's output, a local CLI. Nothing is listening for a request on them, so
 * the call is refused rather than waiting out a timeout.
 */
export const unsupportedChannelRemote = async (
  funcName: string
): Promise<never> => {
  throw new ChannelRPCError(
    `Cannot call "${funcName}" remotely: this channel has no peer that answers`,
    'unsupported'
  )
}
