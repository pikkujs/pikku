import type { DeploymentService } from '../../services/deployment-service.js'
import type { CoreSingletonServices } from '../../types/core.types.js'
import { pikkuState } from '../../pikku-state.js'
import { validateSchema } from '../../schema.js'

/**
 * Envelope actions for request/response RPC carried over an already-open
 * channel. Both directions share one socket, so every frame is tagged and
 * correlated by `id` — a channel is otherwise fire-and-forget in both
 * directions.
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
 * "Still working on it — a human is being asked." Sent by a peer that has
 * suspended a call on someone's answer.
 *
 * Without it the caller's timeout runs while a person reads a prompt, and any
 * approval slower than the timeout fails the call and then drops the answer
 * when it arrives. The frame carries no result and grants nothing: it only
 * asks the caller to keep waiting, and a peer that lies about it can at worst
 * hold its own call open.
 */
export interface ChannelRPCPending {
  action: typeof CHANNEL_RPC_PENDING
  id: string
  /** What the peer is waiting on, for a caller that wants to log or show it. */
  reason?: string
}

const isRecord = (message: unknown): message is Record<string, unknown> =>
  typeof message === 'object' && message !== null

/**
 * Both guards check the whole envelope, not just the action tag.
 *
 * Every frame arrives from the other end of a socket, so the fields the
 * correlation depends on — the id above all — are peer input. A frame tagged
 * as RPC but carrying an id of the wrong type would otherwise reach `settle`
 * and be looked up in the pending map, which is not somewhere untyped peer
 * data belongs.
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

/**
 * The error a caller sees when the peer is gone or never answered. Callers
 * cannot distinguish "peer rejected" from "peer vanished" without this — a
 * dropped socket must not look like a resolved call.
 */
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
 * `remote` for channels that only ever flow one way — a server-sent stream, an
 * agent's output, a local CLI writing to stdout. Nothing is listening for a
 * request on them, so the call is refused at once rather than waiting out a
 * timeout for an answer that was never going to come.
 */
export const unsupportedChannelRemote = async (
  funcName: string
): Promise<never> => {
  throw new ChannelRPCError(
    `Cannot call "${funcName}" remotely: this channel has no peer that answers`,
    'unsupported'
  )
}

/**
 * Whether a callable exposed to a remote decider needs a human to agree before
 * it runs, and how to describe the particular invocation while asking.
 *
 * Shared with `AIAgentToolDef`, which has carried these two fields since before
 * channels could call back: both are an allowlist of named callables invoked by
 * something other than the code that wrote them, and both need the same two
 * answers. The runtime around them is deliberately not shared — an agent
 * suspends its run and resumes it later, while a reverse RPC call is a live
 * await on a socket with a person at the other end of it.
 *
 * `approvalDescriptionFn` is the field that makes a prompt readable: without it
 * the user is asked about `localPush` and a JSON blob, with it they are asked
 * about "push tag v2.1.0 to origin".
 */
export interface ApprovalPolicy {
  needsApproval: boolean
  approvalDescriptionFn?: (input: unknown) => Promise<string> | string
}

/**
 * A capability with no policy attached. Still the right form for a capability
 * that takes no arguments and reads something harmless — but see
 * `CapabilityDef`: unclassified is treated as the dangerous tier, because the
 * capability nobody got round to classifying is the one most likely to matter.
 */
export type CapabilityHandler = (data: any) => Promise<unknown> | unknown

/**
 * A capability that has been classified.
 *
 * `needsApproval` is required here on purpose. On `AIAgentToolDef` the same
 * field is optional and absence means "do not ask" — safe there, because a tool
 * is written by the same people who run the server it executes on. Here absence
 * means the opposite, so it must not be expressible: a bare function is the
 * unclassified form, and this one always states its policy.
 */
export interface CapabilityDef extends ApprovalPolicy {
  execute: CapabilityHandler
}

export type Capability = CapabilityHandler | CapabilityDef

export type Capabilities = Record<string, Capability>

const isCapabilityDef = (capability: Capability): capability is CapabilityDef =>
  typeof capability === 'object' &&
  capability !== null &&
  typeof (capability as CapabilityDef).execute === 'function'

/**
 * The policy a capability is subject to, and the function that runs if it
 * passes. A bare function is unclassified, which resolves to needing approval:
 * forgetting the annotation costs a prompt rather than costing a key.
 *
 * Core makes no policy decision beyond this. Whether an approval can actually
 * be obtained is the caller's business — a terminal asks a person, a browser
 * tab may have no one to ask — so the tiers a CLI exposes as flags are just
 * which approver it wires up, not something core knows about.
 */
export const resolveCapability = (
  capability: Capability
): { execute: CapabilityHandler } & ApprovalPolicy =>
  isCapabilityDef(capability)
    ? capability
    : { execute: capability, needsApproval: true }

/**
 * Asked to approve one invocation. Returning false refuses it, and the peer is
 * told so — a refusal is an answer, not a hang.
 */
export type ApprovalRequester = (request: {
  funcName: string
  data: unknown
  /** `approvalDescriptionFn`'s output when the capability provided one. */
  description?: string
}) => Promise<boolean> | boolean

/**
 * Checks one end of a reverse call — the arguments going out or the answer
 * coming back — throwing to fail it. Async because schema validation is.
 */
export type ChannelRPCValidator = (
  funcName: string,
  value: unknown
) => Promise<void> | void

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer?: ReturnType<typeof setTimeout>
  /** Set once the peer says it is waiting on a human. */
  awaitingHuman?: boolean
}

/**
 * Tracks in-flight reverse RPC calls for one channel. One registry per
 * connection: ids are only unique within a socket, and a dropped socket must
 * reject exactly the calls that were riding on it.
 */
export class ChannelRPCRegistry {
  private pending = new Map<string, PendingCall>()
  private nextId = 0
  private closed = false

  constructor(private readonly timeoutMs: number = 30_000) {}

  public get inFlight(): number {
    return this.pending.size
  }

  public register(): { id: string; promise: Promise<unknown> } {
    if (this.closed) {
      return {
        id: '',
        promise: Promise.reject(
          new ChannelRPCError('Channel is closed', 'closed')
        ),
      }
    }

    const id = `${++this.nextId}`
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer =
        this.timeoutMs > 0
          ? setTimeout(() => {
              this.pending.delete(id)
              reject(
                new ChannelRPCError(
                  `Channel RPC ${id} timed out after ${this.timeoutMs}ms`,
                  'timeout'
                )
              )
            }, this.timeoutMs)
          : undefined
      // Never hold the process open waiting on a peer that may not answer.
      timer?.unref?.()
      this.pending.set(id, { resolve, reject, timer })
    })

    return { id, promise }
  }

  /**
   * Stops the clock on a call whose peer has said it is asking a human.
   *
   * The timeout exists to bound a peer that has gone away, and a person reading
   * a prompt is not that. Left running, every approval slower than the timeout
   * would fail the call and then discard the answer when it finally arrived —
   * so a consent prompt would be unusable on anything but the fastest yes.
   *
   * The call is not left unbounded in practice: `rejectAll` still fails it the
   * moment the socket drops, which is what actually happens when the peer dies
   * mid-prompt. Only the peer's own call is affected, so a peer that sends this
   * frame dishonestly can do nothing but keep itself waiting.
   *
   * Returns false for an unknown id — a pending frame for a call that already
   * timed out is stale, not an error.
   */
  public hold(id: string): boolean {
    const call = this.pending.get(id)
    if (!call || call.awaitingHuman) {
      return false
    }
    clearTimeout(call.timer)
    call.timer = undefined
    call.awaitingHuman = true
    return true
  }

  /**
   * Settles the call a response belongs to. Returns false for an unknown id so
   * a late reply after a timeout is dropped rather than throwing.
   */
  public settle(response: ChannelRPCResponse): boolean {
    const call = this.pending.get(response.id)
    if (!call) {
      return false
    }
    this.pending.delete(response.id)
    clearTimeout(call.timer)

    if (response.ok) {
      call.resolve(response.result)
    } else {
      // The failure payload is peer input and is only read, never trusted: a
      // non-string name or message falls back rather than being attached to an
      // Error, where it would surface as `[object Object]` in a log or as
      // something other than a string to a caller matching on `error.name`.
      const { name, message } = response.error ?? {}
      const error = new ChannelRPCError(
        typeof message === 'string' ? message : 'Remote channel RPC failed',
        'remote'
      )
      if (typeof name === 'string' && name.length > 0) {
        error.name = name
      }
      call.reject(error)
    }
    return true
  }

  /**
   * Fails every in-flight call. Called when the socket drops — without this a
   * caller awaits until the timeout on a connection that is already gone.
   */
  public rejectAll(reason: string = 'Channel closed'): void {
    this.closed = true
    for (const [, call] of this.pending) {
      clearTimeout(call.timer)
      call.reject(new ChannelRPCError(reason, 'closed'))
    }
    this.pending.clear()
  }
}

/**
 * A `DeploymentService` whose transport is an open channel rather than an
 * address. This is what lets a server-side function call back into a peer that
 * has no inbound route of its own — a CLI on a laptop, a sandbox behind NAT.
 *
 * It slots into the existing `services.deploymentService` hole, so `rpc.remote`
 * resolution, session propagation and traceId plumbing are unchanged.
 */
export class ChannelDeploymentService implements DeploymentService {
  public readonly registry: ChannelRPCRegistry
  private readonly validateInput?: ChannelRPCValidator
  private readonly validateResult?: ChannelRPCValidator

  constructor(
    private readonly send: (data: unknown) => Promise<void> | void,
    options: {
      timeoutMs?: number
      validateInput?: ChannelRPCValidator
      validateResult?: ChannelRPCValidator
    } = {}
  ) {
    this.registry = new ChannelRPCRegistry(options.timeoutMs)
    this.validateInput = options.validateInput
    this.validateResult = options.validateResult
  }

  public async init(): Promise<void> {}

  public async start(): Promise<void> {}

  public async stop(): Promise<void> {
    this.registry.rejectAll('Deployment service stopped')
  }

  /**
   * Routes a response or pending frame read off the channel back to its caller.
   * The channel owner must call this — the service has no read side of its own.
   */
  public handleResponse(message: unknown): boolean {
    if (isChannelRPCPending(message)) {
      return this.registry.hold(message.id)
    }
    return isChannelRPCResponse(message) ? this.registry.settle(message) : false
  }

  /**
   * `session` is accepted to satisfy `DeploymentService` and deliberately not
   * sent. A deployed unit runs the call as the caller's user; the peer here is
   * a client executing a capability as itself, on its own machine, under its
   * own identity — a session on the wire would carry the caller's credentials
   * to it while authorising nothing.
   */
  public async invoke(
    funcName: string,
    data: unknown,
    _session?: unknown,
    traceId?: string
  ): Promise<unknown> {
    // Checked before anything is registered or sent, so a call this app got
    // wrong fails here rather than on the peer's machine. It is not a security
    // control — the peer must check its own inputs, since a caller that means
    // harm would send arguments that pass this. What it catches is drift: a
    // server built against a newer capability signature than the client it
    // happens to be talking to, which would otherwise surface as a confusing
    // failure inside someone else's process.
    if (this.validateInput) {
      try {
        await this.validateInput(funcName, data)
      } catch (e: unknown) {
        throw new ChannelRPCError(
          `Invalid arguments for "${funcName}": ${(e as Error)?.message ?? String(e)}`,
          'invalid'
        )
      }
    }

    const { id, promise } = this.registry.register()
    // A closed registry answers with an already-rejected promise and no id.
    // Returning it before the send keeps that rejection from sitting unobserved
    // across an await, on a channel already known to be gone.
    if (!id) {
      return promise
    }

    const request: ChannelRPCRequest = {
      action: CHANNEL_RPC_REQUEST,
      id,
      funcName,
      data,
      traceId,
    }

    try {
      await this.send(request)
    } catch (e: unknown) {
      // The call is registered before the request goes out, so a failed send
      // otherwise leaves an entry nobody waits on: this throws, `promise` never
      // gets a handler, and the timeout later rejects it into an unhandled
      // rejection. Settling retires the timer and the entry with it; the
      // rejection is absorbed so the send error is the one the caller sees.
      this.registry.settle({
        action: CHANNEL_RPC_RESPONSE,
        id,
        ok: false,
        error: {
          name: (e as Error)?.name ?? 'Error',
          message: (e as Error)?.message ?? String(e),
        },
      })
      promise.catch(() => {})
      throw e
    }

    const result = await promise
    if (!this.validateResult) {
      return result
    }

    // A capability runs on the peer's machine and answers with whatever it
    // likes, so this is the point where a value that has been through nothing
    // enters a server-side command. Checking it here means a client on an
    // older build fails the call it answered, rather than the command failing
    // later somewhere that had no reason to expect a bad shape.
    try {
      await this.validateResult(funcName, result)
    } catch (e: unknown) {
      throw new ChannelRPCError(
        `Invalid result from "${funcName}": ${(e as Error)?.message ?? String(e)}`,
        'invalid'
      )
    }
    return result
  }
}

/**
 * Checks a capability's answer against the schema generated for its declared
 * return type.
 *
 * A capability is declared as a function like any other, so codegen has
 * already produced a schema for what it returns — the same one an agent tool
 * or an HTTP response is checked against. Nothing about the value arriving
 * from a peer's machine rather than from local code changes what it is
 * supposed to look like, and a caller should not have to restate the shape it
 * already declared.
 *
 * A name with no function metadata is left alone: it is a capability this app
 * never declared a contract for, and inventing a failure for it would break
 * callers who deliberately treat the answer as opaque.
 */
export const createChannelRPCResultValidator = (
  singletonServices: Pick<CoreSingletonServices, 'logger' | 'schema'>,
  packageName: string | null = null
): ChannelRPCValidator =>
  createChannelRPCSchemaValidator(
    'outputSchemaName',
    singletonServices,
    packageName
  )

/**
 * Checks the arguments going out to a capability against the schema generated
 * for its declared input type.
 *
 * Unlike the result check this is not a boundary — the peer runs the code and
 * must validate what it was handed. It catches version drift, where a server
 * built against a newer capability signature calls a client that predates it,
 * and turns what would be a confusing failure inside someone else's process
 * into a clear one here.
 */
export const createChannelRPCInputValidator = (
  singletonServices: Pick<CoreSingletonServices, 'logger' | 'schema'>,
  packageName: string | null = null
): ChannelRPCValidator =>
  createChannelRPCSchemaValidator(
    'inputSchemaName',
    singletonServices,
    packageName
  )

const createChannelRPCSchemaValidator =
  (
    key: 'inputSchemaName' | 'outputSchemaName',
    singletonServices: Pick<CoreSingletonServices, 'logger' | 'schema'>,
    packageName: string | null = null
  ): ChannelRPCValidator =>
  async (funcName: string, value: unknown): Promise<void> => {
    const pikkuFuncId = pikkuState(packageName, 'rpc', 'meta')[funcName]
    if (!pikkuFuncId) {
      return
    }
    const schemaName = pikkuState(packageName, 'function', 'meta')[
      pikkuFuncId
    ]?.[key]
    if (!schemaName) {
      return
    }
    await validateSchema(
      singletonServices.logger,
      singletonServices.schema,
      schemaName,
      value,
      packageName
    )
  }

/**
 * Answers reverse RPC requests arriving on a channel.
 *
 * `capabilities` is the authorisation boundary, not a convenience: the peer is
 * asking this process to execute code, so only explicitly listed names run. A
 * name absent from the map is refused the same way an unknown one is, so the
 * server cannot probe for what a client can do.
 */
export const createChannelRPCResponder = ({
  capabilities,
  send,
  approve,
}: {
  capabilities: Capabilities
  send: (data: unknown) => Promise<void> | void
  /**
   * Consulted before running a capability that needs approval. Omitted means
   * there is nobody to ask, and such a call is refused rather than run — a
   * client with no human attached is exactly where an unattended `git push`
   * would otherwise happen.
   */
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

    // Own properties only. A plain object literal still inherits from
    // `Object.prototype`, so a peer asking for `toString` or `constructor`
    // would otherwise resolve a real function and this would call it — names
    // the host never listed, through the boundary that is supposed to list
    // them.
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

        // The caller is waiting on a timer that knows nothing about how long a
        // person takes to read. Telling it to hold has to happen before the
        // asking, not after — an answer that arrives past the timeout is
        // dropped, and the human's decision is then silently discarded.
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
