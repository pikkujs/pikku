import {
  AddonNotUsedError,
  addonCallerOf,
  addonMayReach,
  mapAddonCall,
} from '../addon/addon-reach.js'
import type {
  CoreServices,
  PikkuWire,
  PikkuRawWire,
} from '../../types/core.types.js'
import {
  forwardStepName,
  isCompensationStepName,
} from '../../compensation-name.js'
import type { SessionService } from '../../services/user-session-service.js'
import type { CoreUserSession } from '../../types/core.types.js'
import type { runPikkuFunc as RunPikkuFunc } from '../../function/function-runner.js'
import type { AddonInstance } from '../addon/addon-runner.js'
import { addonInstanceForNamespace } from '../addon/addon-runner.js'
import { isAddonFunctionExposed } from '../addon/wire-addon.js'
import { pikkuState } from '../../pikku-state.js'
import { PikkuError, addError } from '../../errors/error-handler.js'
import type { PikkuRPC, ResolvedFunction } from './rpc-types.js'
import { parseVersionedId } from '../../version.js'
import { resolveRemoteAddonToken } from '../addon/remote-addon-auth.js'
import {
  DEFAULT_REMOTE_ADDON_TIMEOUT_MS,
  REMOTE_CONTRACT_HEADER,
} from '../addon/wire-remote-addon.js'
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  GoneError,
  LockedError,
  NotFoundError,
  PayloadTooLargeError,
  PaymentRequiredError,
  PreconditionFailedError,
  TooManyRequestsError,
  UnauthorizedError,
  UnprocessableContentError,
  UnsupportedMediaTypeError,
} from '../../errors/errors.js'

/**
 * The function runner, reached lazily. `function-runner` builds every
 * invocation's `wire.rpc` from this module, so a static import back would be a
 * module cycle. By the time an rpc call runs the runner is loaded, and the
 * import resolves from the module cache once.
 */
let functionRunner: typeof RunPikkuFunc | undefined
const runPikkuFunc = async <In, Out>(
  ...args: Parameters<typeof RunPikkuFunc<In, Out>>
): Promise<Out> => {
  functionRunner ??= (await import('../../function/function-runner.js'))
    .runPikkuFunc
  return functionRunner<In, Out>(...args)
}

/**
 * The session for a wire: read through `getSession` when a runner attached one,
 * otherwise whatever was placed on the wire directly.
 */
const resolveWireSession = async (wire: PikkuRawWire) =>
  typeof wire.getSession === 'function' ? await wire.getSession() : wire.session

/**
 * Thrown when an RPC name resolves to no function, or to one that `rpc.exposed` may not call. Maps to HTTP 404 and MCP `-32601`.
 *
 * An unexposed function is reported as not found rather than forbidden, so the
 * response does not reveal whether an internal function by that name exists.
 */
export class RPCNotFoundError extends PikkuError {
  public readonly rpcName: string
  constructor(rpcName: string, message = `RPC function not found: ${rpcName}`) {
    super(message)
    this.rpcName = rpcName
  }
}
addError(RPCNotFoundError, {
  status: 404,
  mcpCode: -32601,
  message: 'RPC function not found.',
})

/** Thrown when a remote addon's configuration cannot be used, for example when its `serverUrl` resolves empty. Maps to HTTP 500. */
export class RemoteAddonConfigError extends PikkuError {
  constructor(namespace: string, detail: string) {
    super(`Remote addon '${namespace}' is misconfigured: ${detail}`)
  }
}
addError(RemoteAddonConfigError, {
  status: 500,
  message: 'Remote addon is misconfigured.',
})

/**
 * Thrown when a remote addon fails on its own side — a 5xx, an unreachable
 * host, or a response that is not JSON. Maps to HTTP 502. What went wrong is
 * logged on this host; none of it reaches the caller.
 */
export class RemoteAddonFailedError extends PikkuError {
  constructor(namespace: string, fnName: string) {
    super(`Remote addon '${namespace}:${fnName}' failed`)
  }
}
addError(RemoteAddonFailedError, {
  status: 502,
  message: 'Remote addon failed.',
})

/** Thrown when a remote addon does not answer within the wiring's `timeoutMs`. Maps to HTTP 504. */
export class RemoteAddonTimeoutError extends PikkuError {
  constructor(namespace: string, fnName: string, timeoutMs: number) {
    super(
      `Remote addon '${namespace}:${fnName}' did not answer within ${timeoutMs}ms`
    )
  }
}
addError(RemoteAddonTimeoutError, {
  status: 504,
  message: 'Remote addon timed out.',
})

/** Headers a wiring's `headers` hook cannot set: the call's auth, trace and contract. */
const RESERVED_REMOTE_HEADERS = new Set([
  'authorization',
  'x-request-id',
  REMOTE_CONTRACT_HEADER,
  'content-type',
  'accept',
])

/**
 * The plain error for each 4xx a remote addon may answer with, used when its
 * body names no error this host knows. Constructed without a message, so the
 * caller gets the registered generic one.
 */
const GENERIC_CLIENT_ERRORS: Record<number, new () => PikkuError> = {
  400: BadRequestError,
  401: UnauthorizedError,
  402: PaymentRequiredError,
  403: ForbiddenError,
  404: NotFoundError,
  409: ConflictError,
  410: GoneError,
  412: PreconditionFailedError,
  413: PayloadTooLargeError,
  415: UnsupportedMediaTypeError,
  422: UnprocessableContentError,
  423: LockedError,
  429: TooManyRequestsError,
}

/**
 * The registered error class named `name` whose status is `status`, rebuilt
 * without running its constructor — a constructor's arguments are not on the
 * wire, and running one with the wrong ones could throw or mislabel the error.
 */
const rebuildRegisteredError = (
  name: unknown,
  status: number,
  message: unknown
): Error | undefined => {
  if (typeof name !== 'string' || !name) {
    return undefined
  }
  for (const [ErrorClass, details] of pikkuState(null, 'misc', 'errors')) {
    if (ErrorClass.name !== name || details.status !== status) {
      continue
    }
    const error: Error = Object.create(ErrorClass.prototype)
    Object.defineProperty(error, 'name', {
      value: name,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(error, 'message', {
      value: typeof message === 'string' && message ? message : details.message,
      writable: true,
      configurable: true,
    })
    Error.captureStackTrace?.(error, rebuildRegisteredError)
    return error
  }
  return undefined
}

/**
 * The error a non-2xx response from a remote addon becomes on this host.
 *
 * A 4xx naming an error registered here with the same status is rebuilt as
 * that error, message included — the addon already chose to show it to its
 * caller. Any other 4xx becomes the generic error for its status. A 5xx, or a
 * status with no generic error, becomes {@link RemoteAddonFailedError}. The
 * response body is never passed through: anything beyond the rebuilt message
 * is logged here and goes no further.
 *
 * knowledge: decisions/security/remote-addon-errors-are-rebuilt-not-passed-through.md
 */
const remoteAddonResponseError = async (
  res: Response,
  namespace: string,
  fnName: string,
  logger: CoreServices['logger']
): Promise<Error> => {
  const body = await res.text().catch(() => '')
  if (res.status >= 400 && res.status < 500) {
    let parsed: { name?: unknown; message?: unknown } | undefined
    try {
      parsed = JSON.parse(body)
    } catch {}
    const rebuilt = rebuildRegisteredError(
      parsed?.name,
      res.status,
      parsed?.message
    )
    if (rebuilt) {
      return rebuilt
    }
    const GenericError = GENERIC_CLIENT_ERRORS[res.status]
    if (GenericError) {
      return new GenericError()
    }
  }
  logger.error(
    `Remote addon '${namespace}:${fnName}' answered ${res.status}: ${body.slice(0, 1000)}`
  )
  return new RemoteAddonFailedError(namespace, fnName)
}

export { AddonNotUsedError }

export const resolveNamespace = (
  namespacedFunction: string
): ResolvedFunction | null => {
  const colonIndex = namespacedFunction.indexOf(':')
  if (colonIndex === -1) {
    return null
  }

  const namespace = namespacedFunction.substring(0, colonIndex)
  const functionName = namespacedFunction.substring(colonIndex + 1)

  const addons = pikkuState(null, 'addons', 'packages')
  const pkgConfig = addons.get(namespace)
  if (!pkgConfig) {
    return null
  }

  return {
    package: pkgConfig.package,
    function: functionName,
    addonConfig: pkgConfig,
  }
}

const resolvePikkuFunction = (
  rpcName: string,
  packageName: string | null = null
): { pikkuFuncId: string; packageName: string | null } => {
  if (packageName) {
    const pkgFunctions = pikkuState(packageName, 'function', 'meta')
    const pkgMeta = pkgFunctions?.[rpcName]
    if (pkgMeta) {
      return { pikkuFuncId: pkgMeta.pikkuFuncId || rpcName, packageName }
    }
    throw new RPCNotFoundError(rpcName)
  }
  const rpc = pikkuState(null, 'rpc', 'meta')
  let rpcMeta = rpc[rpcName]
  if (!rpcMeta) {
    const { baseName, version } = parseVersionedId(rpcName)
    if (version !== null) {
      rpcMeta = rpc[baseName]
    }
  }
  if (!rpcMeta) {
    const rootFunctions = pikkuState(null, 'function', 'meta')
    const rootFunctionMeta = rootFunctions?.[rpcName]
    if (rootFunctionMeta) {
      return {
        pikkuFuncId: rootFunctionMeta.pikkuFuncId || rpcName,
        packageName: null,
      }
    }
  }
  if (!rpcMeta && isCompensationStepName(rpcName)) {
    const forward = forwardStepName(rpcName)
    const funcs = pikkuState(null, 'function', 'functions')
    const forwardId = rpc[forward] ?? (funcs.has(forward) ? forward : undefined)
    const forwardFunc = forwardId ? funcs.get(forwardId) : undefined
    if (forwardId && forwardFunc?.compensate) {
      return { pikkuFuncId: `${forwardId}:compensate`, packageName: null }
    }
  }
  if (!rpcMeta) {
    throw new RPCNotFoundError(rpcName)
  }
  return { pikkuFuncId: rpcMeta, packageName: null }
}

/**
 * A caller from outside names `fn@vN` because it was built against that
 * version. Serving it the latest instead would hand it a contract it does not
 * know, so a version this host no longer has is refused, not resolved to the
 * base name the way an internal caller's is. An unversioned function is its
 * own v1.
 */
const refuseUnknownVersion = (rpcName: string): void => {
  const { baseName, version } = parseVersionedId(rpcName)
  if (version === null) return
  const rpc = pikkuState(null, 'rpc', 'meta')
  if (rpc[rpcName]) return
  const current = rpc[baseName]
  if (!current) return
  if (version === 1 && parseVersionedId(current).version === null) return
  throw new RPCNotFoundError(
    rpcName,
    `RPC function not found: ${rpcName}. Version ${version} of '${baseName}' is no longer served here; update the SDK this call was built against.`
  )
}

/**
 * Marks an addon RPC name that could not be resolved. Module-private on purpose:
 * resolution failure must never be conflated with an `RPCNotFoundError` thrown by
 * a function that already started executing, and it must never escape to callers.
 */
const NOT_RESOLVED = Symbol('pikku:rpc-not-resolved')

type AddonCall =
  | {
      kind: 'remote'
      namespace: string
      fnName: string
      addonConfig: ResolvedFunction['addonConfig']
    }
  | {
      kind: 'local'
      namespacedFunction: string
      packageName: string
      pikkuFuncId: string
      auth: boolean | undefined
      tags: string[]
      addonInstance: AddonInstance
    }

export class ContextAwareRPCService {
  constructor(
    private services: CoreServices,
    private wire: PikkuRawWire,
    private options: {
      requiresAuth?: boolean
      sessionService?: SessionService<CoreUserSession>
    },
    private packageName: string | null = null
  ) {}

  public async rpcExposed(funcName: string, data: any): Promise<any> {
    const addonCaller = addonCallerOf(this.wire)
    if (addonCaller && !addonMayReach(addonCaller, funcName)) {
      throw new AddonNotUsedError(addonCaller, funcName)
    }
    let functionMeta: any
    let resolvedAddon: ResolvedFunction | null = null
    if (funcName.includes(':')) {
      resolvedAddon = resolveNamespace(funcName)
      if (resolvedAddon?.addonConfig.remote) {
        // A remote addon's functions have no meta on this host. Its contract
        // stands in for the addon's own `expose`, and the host enforces it:
        // every forwarded call carries REMOTE_CONTRACT_HEADER.
        if (
          !isAddonFunctionExposed(
            resolvedAddon.addonConfig.expose,
            parseVersionedId(resolvedAddon.function).baseName,
            true
          )
        ) {
          throw new RPCNotFoundError(funcName)
        }
        return await this.rpc(funcName, data)
      }
      if (resolvedAddon) {
        functionMeta = pikkuState(resolvedAddon.package, 'function', 'meta')[
          resolvedAddon.function
        ]
      }
    } else {
      if (!this.packageName) refuseUnknownVersion(funcName)
      const resolved = resolvePikkuFunction(funcName, this.packageName)
      functionMeta = pikkuState(resolved.packageName, 'function', 'meta')[
        resolved.pikkuFuncId
      ]
    }
    if (!functionMeta) {
      // Whether a function is in the remote contract is only known where its
      // meta is, so a contract call never leaves this unit.
      if (this.wire.http?.request?.header(REMOTE_CONTRACT_HEADER)) {
        throw new RPCNotFoundError(funcName)
      }
      // The addon runs in another deploy unit, which only carries the
      // functions the analyzer found exposed. The wiring present here must
      // still opt in to the function before it is forwarded.
      const refusedHere =
        resolvedAddon &&
        !isAddonFunctionExposed(
          resolvedAddon.addonConfig.expose,
          resolvedAddon.function,
          true
        )
      if (
        funcName.includes(':') &&
        this.services.deploymentService &&
        !refusedHere
      ) {
        return await this.rpc(funcName, data)
      }
      throw new RPCNotFoundError(funcName)
    }
    const exposed = resolvedAddon
      ? isAddonFunctionExposed(
          resolvedAddon.addonConfig.expose,
          resolvedAddon.function,
          functionMeta.expose
        )
      : functionMeta.expose
    if (!exposed || functionMeta.scenarioStep) {
      throw new RPCNotFoundError(funcName)
    }
    if (
      this.wire.http?.request?.header(REMOTE_CONTRACT_HEADER) &&
      functionMeta.remote !== true
    ) {
      throw new RPCNotFoundError(funcName)
    }
    return await this.rpc(funcName, data)
  }

  public async rpc<In = any, Out = any>(
    funcName: string,
    data: In
  ): Promise<Out> {
    const updatedWire: PikkuRawWire = {
      ...this.wire,
    }

    if (funcName.includes(':')) {
      funcName = this.mapUsedAddon(funcName)
      const addonCall = this.resolveAddonFunction(funcName)
      if (addonCall !== NOT_RESOLVED) {
        return await this.executeAddonFunction<In, Out>(
          addonCall,
          data,
          updatedWire
        )
      }
    }

    let resolved: { pikkuFuncId: string; packageName: string | null }
    try {
      resolved = resolvePikkuFunction(funcName, this.packageName)
    } catch (e) {
      if (e instanceof RPCNotFoundError) {
        if (!this.packageName && this.services.deploymentService) {
          const session = await resolveWireSession(this.wire)
          return this.services.deploymentService.invoke(
            funcName,
            data,
            session,
            this.wire.traceId
          ) as Promise<Out>
        }
      }
      throw e
    }

    const addonInstance = resolved.packageName
      ? addonInstanceForNamespace(
          this.wire.addonNamespace,
          resolved.packageName
        )
      : undefined
    return await runPikkuFunc<In, Out>('rpc', funcName, resolved.pikkuFuncId, {
      auth: this.options.requiresAuth,
      singletonServices: this.services,
      data: () => data,
      wire: updatedWire,
      packageName: resolved.packageName,
      addonInstance,
    })
  }

  private mapUsedAddon(funcName: string): string {
    return mapAddonCall(this.wire.addonNamespace, funcName)
  }

  /**
   * Resolution half of an addon RPC call: never executes anything, so an
   * `RPCNotFoundError` thrown by the function itself can never be mistaken for
   * an unresolvable name.
   */
  private resolveAddonFunction(
    namespacedFunction: string
  ): AddonCall | typeof NOT_RESOLVED {
    const resolved = resolveNamespace(namespacedFunction)
    if (!resolved) {
      return NOT_RESOLVED
    }

    const namespace = namespacedFunction.slice(
      0,
      namespacedFunction.indexOf(':')
    )

    if (resolved.addonConfig?.remote) {
      const addonConfig = pikkuState(null, 'addons', 'packages').get(namespace)
      if (!addonConfig?.remote) {
        return NOT_RESOLVED
      }
      return {
        kind: 'remote',
        namespace,
        fnName: resolved.function,
        addonConfig,
      }
    }

    const addonFunctionMeta = pikkuState(resolved.package, 'function', 'meta')
    let funcMeta = addonFunctionMeta[resolved.function]
    if (!funcMeta && isCompensationStepName(resolved.function)) {
      const forwardName = forwardStepName(resolved.function)
      const forwardMeta = addonFunctionMeta[forwardName]
      if (forwardMeta?.compensate) {
        funcMeta = {
          ...forwardMeta,
          pikkuFuncId: `${forwardMeta.pikkuFuncId || forwardName}:compensate`,
        }
      }
    }
    if (!funcMeta) {
      return NOT_RESOLVED
    }

    return {
      kind: 'local',
      namespacedFunction,
      packageName: resolved.package,
      pikkuFuncId: funcMeta.pikkuFuncId || resolved.function,
      auth: resolved.addonConfig?.auth ?? this.options.requiresAuth,
      tags: [...(resolved.addonConfig?.tags ?? []), ...(funcMeta.tags ?? [])],
      addonInstance: {
        namespace,
        secretOverrides: resolved.addonConfig?.secretOverrides,
        variableOverrides: resolved.addonConfig?.variableOverrides,
        credentialOverrides: resolved.addonConfig?.credentialOverrides,
        secretGrants: resolved.addonConfig?.secretGrants,
        credentialGrants: resolved.addonConfig?.credentialGrants,
        globalSecrets: resolved.addonConfig?.globalSecrets,
        globalCredentials: resolved.addonConfig?.globalCredentials,
        contentBucket: resolved.addonConfig?.contentBucket,
        contentGrants: resolved.addonConfig?.contentGrants,
        globalContent: resolved.addonConfig?.globalContent,
      },
    }
  }

  /**
   * Execution half of an addon RPC call. Must never be called from inside a
   * `try` that catches `RPCNotFoundError`.
   */
  private async executeAddonFunction<In = any, Out = any>(
    addonCall: AddonCall,
    data: In,
    wire: PikkuRawWire
  ): Promise<Out> {
    if (addonCall.kind === 'remote') {
      return this.invokeRemoteAddonFunction<In, Out>(
        addonCall.namespace,
        addonCall.fnName,
        data,
        addonCall.addonConfig
      )
    }

    return runPikkuFunc<In, Out>(
      'rpc',
      addonCall.namespacedFunction,
      addonCall.pikkuFuncId,
      {
        auth: addonCall.auth,
        singletonServices: this.services,
        data: () => data,
        wire,
        packageName: addonCall.packageName,
        tags: addonCall.tags,
        addonInstance: addonCall.addonInstance,
      }
    )
  }

  private async invokeRemoteAddonFunction<In = any, Out = any>(
    namespace: string,
    fnName: string,
    data: In,
    cfg: ResolvedFunction['addonConfig']
  ): Promise<Out> {
    const serverUrl =
      typeof cfg.serverUrl === 'function'
        ? await cfg.serverUrl(this.services)
        : cfg.serverUrl
    if (!serverUrl) {
      throw new RemoteAddonConfigError(namespace, 'serverUrl resolved empty')
    }

    // The host serves `fn` as its own latest, which may be newer than the
    // contract this consumer was built against, so a call always names a
    // version: the caller's, or the newest in the SDK (registered by codegen).
    const versionedFn =
      parseVersionedId(fnName).version !== null
        ? fnName
        : (pikkuState(cfg.package, 'rpc', 'meta')[fnName] ?? fnName)
    // `remoteName` maps the base name; the version rides on the mapped name,
    // so a lookup-table mapping still matches a versioned call.
    const { baseName, version } = parseVersionedId(versionedFn)
    const remoteFn = cfg.remoteName
      ? `${cfg.remoteName(baseName)}${version !== null ? `@v${version}` : ''}`
      : versionedFn
    const token = await resolveRemoteAddonToken(
      cfg.remoteAuth,
      this.services,
      this.wire,
      namespace
    )

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    }
    if (cfg.remoteHeaders) {
      for (const [name, value] of Object.entries(
        await cfg.remoteHeaders(this.services, this.wire)
      )) {
        // Matched case-insensitively: `Authorization` next to `authorization`
        // would reach the host as one combined value.
        if (!RESERVED_REMOTE_HEADERS.has(name.toLowerCase())) {
          headers[name] = value
        }
      }
    }
    headers[REMOTE_CONTRACT_HEADER] = '1'
    if (token) {
      headers.authorization = `Bearer ${token}`
    }
    if (this.wire.traceId) {
      headers['x-request-id'] = this.wire.traceId
    }

    const timeoutMs = cfg.remoteTimeoutMs ?? DEFAULT_REMOTE_ADDON_TIMEOUT_MS
    const base = serverUrl.replace(/\/+$/, '')
    let res: Response
    try {
      // The body the generated `POST /rpc/:rpcName` route reads, the same one
      // the generated fetch client sends.
      res = await fetch(`${base}/rpc/${encodeURIComponent(remoteFn)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ rpcName: remoteFn, data }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      if ((e as Error | undefined)?.name === 'TimeoutError') {
        throw new RemoteAddonTimeoutError(namespace, remoteFn, timeoutMs)
      }
      this.services.logger.error(
        `Remote addon '${namespace}:${remoteFn}' could not be reached: ${e instanceof Error ? e.message : e}`
      )
      throw new RemoteAddonFailedError(namespace, remoteFn)
    }

    if (!res.ok) {
      throw await remoteAddonResponseError(
        res,
        namespace,
        remoteFn,
        this.services.logger
      )
    }

    if (res.status === 204) {
      return undefined as Out
    }
    const text = await res.text()
    if (!text) {
      return undefined as Out
    }
    try {
      return JSON.parse(text) as Out
    } catch {
      this.services.logger.error(
        `Remote addon '${namespace}:${remoteFn}' answered ${res.status} with a body that is not JSON`
      )
      throw new RemoteAddonFailedError(namespace, remoteFn)
    }
  }

  public async rpcWithWire<In = any, Out = any>(
    rpcName: string,
    data: In,
    wire: PikkuRawWire
  ): Promise<Out> {
    const mergedWire: PikkuRawWire = {
      ...this.wire,
      ...wire,
    }

    if (rpcName.includes(':')) {
      rpcName = this.mapUsedAddon(rpcName)
      const addonCall = this.resolveAddonFunction(rpcName)
      if (addonCall !== NOT_RESOLVED) {
        return await this.executeAddonFunction<In, Out>(
          addonCall,
          data,
          mergedWire
        )
      }
    }

    let resolved: { pikkuFuncId: string; packageName: string | null }
    try {
      resolved = resolvePikkuFunction(rpcName, this.packageName)
    } catch (e) {
      if (
        e instanceof RPCNotFoundError &&
        !this.packageName &&
        this.services.deploymentService
      ) {
        const session = await resolveWireSession(mergedWire)
        return this.services.deploymentService.invoke(
          rpcName,
          data,
          session,
          mergedWire.traceId
        ) as Promise<Out>
      }
      throw e
    }

    const addonInstance = resolved.packageName
      ? addonInstanceForNamespace(
          this.wire.addonNamespace,
          resolved.packageName
        )
      : undefined
    return await runPikkuFunc<In, Out>('rpc', rpcName, resolved.pikkuFuncId, {
      auth: this.options.requiresAuth,
      singletonServices: this.services,
      data: () => data,
      wire: mergedWire,
      packageName: resolved.packageName,
      addonInstance,
    })
  }

  public async startWorkflow<In = any>(
    workflowName: string,
    input: In,
    options?: {
      startNode?: string
      wire?: { type: string; id?: string; parentRunId?: string }
    }
  ): Promise<{ runId: string }> {
    if (!this.services.workflowService) {
      throw new Error('WorkflowService service not available')
    }
    if (workflowName.includes(':')) {
      workflowName = this.mapUsedAddon(workflowName)
    }
    const parentRunId = this.wire.workflowStep?.runId ?? this.wire.graph?.runId
    const wire = options?.wire ?? {
      type: this.wire.wireType ?? 'unknown',
      id: this.wire.wireId,
      ...(parentRunId ? { parentRunId } : {}),
      ...(this.wire.pikkuUserId ? { pikkuUserId: this.wire.pikkuUserId } : {}),
    }
    return this.services.workflowService.startWorkflow(
      workflowName,
      input,
      wire,
      this,
      options
    )
  }

  /**
   * The agent facade, built on access.
   *
   * Resolved through state rather than imported: naming `agent-rpc.ts` here
   * pinned the agent runtime — runner, stream, memory, AGUI — into every
   * deployment unit, because every unit reaches this file through
   * `function-runner`. `@pikku/core/agent` registers the factory on import, so
   * a unit that holds an agent has one and a unit that does not never bundles
   * the tree behind it.
   */
  public get agent(): PikkuRPC['agent'] {
    const createAgentRPC = pikkuState(null, 'agent', 'rpcFactory')
    if (!createAgentRPC) {
      throw new Error(
        'Agent runtime not available: import @pikku/core/agent in this deployment unit to use rpc.agent'
      )
    }
    return createAgentRPC(this.wire, this.options)
  }

  public async mesh<In = any, Out = any>(
    funcName: string,
    data: In
  ): Promise<Out> {
    if (!this.services.deploymentService) {
      throw new Error(
        `No DeploymentService configured for mesh RPC: ${funcName}. ` +
          `Set up a DeploymentService to enable mesh function calls.`
      )
    }

    const session = await resolveWireSession(this.wire)

    return this.services.deploymentService.invoke(
      funcName,
      data,
      session,
      this.wire.traceId
    ) as Promise<Out>
  }
}

/**
 * Builds the `rpc` object handed to every function on its wire.
 *
 * `rpc.invoke(name, data)` calls another function in-process, or through the
 * `DeploymentService` when the function lives in another deployment unit.
 * `rpc.exposed` does the same but only reaches functions marked `expose: true`
 * (and, for addons, those the consuming app exposes), which is what the public
 * RPC endpoint uses. `rpc.mesh` always goes through the `DeploymentService`.
 * Calls carry the caller's wire, so the session and trace ID propagate. An addon
 * can only call the addons it lists in `uses`.
 *
 * Runtimes create this through {@link rpcService}; apps reach it as `rpc` on the wire.
 *
 * @example snippet: rpcInternalCall
 */
export class PikkuRPCService<
  Services extends CoreServices,
  TypedRPC = PikkuRPC,
> {
  getContextRPCService(
    services: Services,
    wire: PikkuRawWire,
    requiresAuthOrOptions?:
      | boolean
      | {
          requiresAuth?: boolean
          sessionService?: SessionService<CoreUserSession>
        }
      | undefined,
    depth: number = 0,
    packageName: string | null = null
  ): TypedRPC {
    const options =
      typeof requiresAuthOrOptions === 'object' &&
      requiresAuthOrOptions !== null
        ? requiresAuthOrOptions
        : { requiresAuth: requiresAuthOrOptions }
    const serviceRPC = new ContextAwareRPCService(
      services,
      wire as PikkuWire,
      options,
      packageName
    )
    // `TypedRPC` is named by the caller from its generated RPC map. Nothing
    // concrete can satisfy a type the caller has not chosen yet.
    return new ContextRPCView(serviceRPC, depth) as TypedRPC
  }
}

/**
 * The per-invocation `wire.rpc`.
 *
 * A class rather than an object literal because `agent` has to stay lazy — most
 * requests never touch it — and an accessor declared on an object literal is
 * defined per instance, which drops the literal off V8's fast construction
 * path. Measured at ~1.15µs per request as a literal against ~0.47µs here, on
 * the hot path every request takes.
 *
 * knowledge: decisions/internals/the-per-invocation-rpc-view-is-a-class.md
 */
class ContextRPCView {
  public readonly global = false
  public readonly invoke: ContextAwareRPCService['rpc']
  public readonly mesh: ContextAwareRPCService['mesh']
  public readonly exposed: ContextAwareRPCService['rpcExposed']
  public readonly startWorkflow: ContextAwareRPCService['startWorkflow']
  public readonly rpcWithWire: ContextAwareRPCService['rpcWithWire']

  constructor(
    private readonly serviceRPC: ContextAwareRPCService,
    public readonly depth: number
  ) {
    this.invoke = serviceRPC.rpc.bind(serviceRPC)
    this.mesh = serviceRPC.mesh.bind(serviceRPC)
    this.exposed = serviceRPC.rpcExposed.bind(serviceRPC)
    this.startWorkflow = serviceRPC.startWorkflow.bind(serviceRPC)
    this.rpcWithWire = serviceRPC.rpcWithWire.bind(serviceRPC)
  }

  get agent() {
    return this.serviceRPC.agent
  }
}

/** The shared {@link PikkuRPCService}. Function runners call `getContextRPCService` on it to give each invocation its own `rpc`. */
export const rpcService = new PikkuRPCService()
