import type {
  CoreServices,
  CoreSecretlessSingletonServices,
  CoreUserSession,
  PikkuWire,
  SecretlessServices,
} from '../types/core.types.js'
import type { CorePikkuMiddleware } from '../middleware/middleware.types.js'
import type { PickRequired } from '../utils.js'
import type { PikkuRPC } from '../wirings/rpc/rpc-types.js'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { PikkuError } from '../errors/error-handler.js'
import type { CoreNodeConfig } from '../wirings/node/node.types.js'
import type { ScenarioSurface } from '../wirings/workflow/scenario-step.types.js'
import type { Safe } from '../classification/secret-value.js'

export type CorePikkuFunction<
  In,
  Out,
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Session extends CoreUserSession = CoreUserSession,
  Wire extends PikkuWire<In, Out, true, Session, PikkuRPC, null, string> =
    PikkuWire<In, Out, true, Session>,
> = (
  services: Services,
  data: In,
  wire: Wire
) => Wire['channel'] extends null
  ? Promise<Safe<Out>>
  : Promise<Safe<Out>> | Promise<void>

export type CorePikkuFunctionSessionless<
  In,
  Out,
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Session extends CoreUserSession = CoreUserSession,
  Wire extends PikkuWire<In, Out, false, Session, PikkuRPC, null, string> =
    PikkuWire<In, Out, false, Session>,
> = (
  services: Services,
  data: In,
  wire: Wire
) => Wire['channel'] extends null
  ? Promise<Safe<Out>>
  : Promise<Safe<Out>> | Promise<void>

export type CorePikkuPermission<
  In = any,
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Wire extends PikkuWire<In, never, false, any, PikkuRPC, never, never> =
    PikkuWire<In, never, false, any, PikkuRPC, never, never>,
> = (services: Services, data: In, wire: Wire) => Promise<boolean>

export type CorePikkuPermissionConfig<
  In = any,
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Wire extends PikkuWire<In, never, false, any, PikkuRPC, never, never> =
    PikkuWire<In, never, false, any, PikkuRPC, never, never>,
> = {
  func: CorePikkuPermission<In, Services, Wire>
  name?: string
  description?: string
}

export const pikkuPermission = <
  In = any,
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Wire extends PickRequired<
    PikkuWire<In, never, false, any, PikkuRPC, never, never>,
    'session'
  > = PickRequired<
    PikkuWire<In, never, false, any, PikkuRPC, never, never>,
    'session'
  >,
>(
  permission:
    | CorePikkuPermission<In, Services, Wire>
    | CorePikkuPermissionConfig<In, Services, Wire>
): CorePikkuPermission<In, Services, Wire> => {
  return typeof permission === 'function' ? permission : permission.func
}

export type CorePikkuPermissionFactory<
  In = any,
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Wire extends PikkuWire<In, never, false, any, PikkuRPC, never, never> =
    PikkuWire<In, never, false, any, PikkuRPC, never, never>,
> = (input: In) => CorePikkuPermission<any, Services, Wire>

export const pikkuPermissionFactory = <In = any>(
  factory: CorePikkuPermissionFactory<In>
): CorePikkuPermissionFactory<In> => {
  return factory
}

/**
 * Renders a human-readable approval prompt for an AI agent, in place of the
 * raw tool arguments.
 */
export type CorePikkuApprovalDescription<
  In = any,
  Services extends CoreSecretlessSingletonServices =
    CoreSecretlessSingletonServices,
> = (services: Services, data: In) => Promise<string>

export const pikkuApprovalDescription = <
  In = any,
  Services extends CoreSecretlessSingletonServices =
    CoreSecretlessSingletonServices,
>(
  fn: CorePikkuApprovalDescription<In, Services>
): CorePikkuApprovalDescription<In, Services> => {
  return fn
}

export type CorePikkuAuth<
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Session extends CoreUserSession = CoreUserSession,
> = (services: Services, session: Session) => Promise<boolean> | boolean

export type CorePikkuAuthConfig<
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Session extends CoreUserSession = CoreUserSession,
> = {
  func: CorePikkuAuth<Services, Session>
  name?: string
  description?: string
}

/**
 * Marks a permission produced by `pikkuAuth`, so agent tool filtering can tell a
 * session check apart from an ordinary permission.
 *
 * knowledge: decisions/security/permission-auth-filtering-requires-live-permission-functions.md
 */
export type AuthBranded = { __pikkuAuth?: true }

export const pikkuAuth = <
  Services extends CoreSecretlessSingletonServices =
    SecretlessServices<CoreServices>,
  Session extends CoreUserSession = CoreUserSession,
>(
  auth:
    CorePikkuAuth<Services, Session> | CorePikkuAuthConfig<Services, Session>
): CorePikkuPermission<any, Services, any> => {
  const fn = typeof auth === 'function' ? auth : auth.func
  const wrapper: CorePikkuPermission<any, Services, any> & AuthBranded = async (
    services: Services,
    _data: any,
    wire: any
  ) => {
    const session = wire.session
    if (!session) return false
    return fn(services, session as Session)
  }
  wrapper.__pikkuAuth = true
  return wrapper
}

export type CorePermissionGroup<PikkuPermission = CorePikkuPermission<any>> =
  Record<string, PikkuPermission | PikkuPermission[]> | undefined

/**
 * A lifecycle hook: same call signature as the function it hangs off, return
 * value discarded. Setup/teardown, not a step — no id, no meta, no schema, so
 * it is never recorded and never replayed.
 */
export type CorePikkuFunctionHook<Services = any, Data = any, Wire = any> = (
  services: Services,
  data: Data,
  wire: Wire
) => Promise<void> | void

export type CorePikkuFunctionConfig<
  PikkuFunction extends
    | CorePikkuFunction<any, any, any, any, any>
    | CorePikkuFunctionSessionless<any, any, any, any, any>,
  PikkuPermission extends CorePikkuPermission<any, any, any> =
    CorePikkuPermission<any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
  Scope extends string = string,
> = {
  title?: string
  description?: string
  /** Explicit logical name override; lets multiple exports share a versioned base */
  override?: string
  version?: number
  tags?: string[]
  expose?: boolean
  /**
   * The permission check for this function lives in its body — verifying a
   * signed token, checking a webhook signature, matching an invite code — so
   * it is not open despite declaring no session, scope or permission.
   *
   * A last resort. Prefer `permissions`, which are declared, inspectable, and
   * reusable; reach for this only when the check cannot be expressed as one.
   *
   * Purely declarative — it grants nothing, and asserting it falsely disables
   * the audit that would have caught the mistake. Requires
   * `allow.permissionsInBody` in `pikku.config.json`.
   */
  permissionsInBody?: boolean
  remote?: boolean
  mcp?: boolean
  readonly?: boolean
  deploy?: 'serverless' | 'server' | 'auto'
  approvalRequired?: boolean
  /** When true, workflow steps calling this function are dispatched via the queue. No queue service configured is a hard error. Defaults to false (inline). */
  workflowQueued?: boolean
  /** Number of retry attempts when this function is used as a workflow step. */
  workflowRetries?: number
  /** Timeout for this function when used as a workflow step (e.g. '30s', '5m'). */
  workflowTimeout?: string
  /**
   * Scenario steps only: which surfaces this step declares a binding for. The
   * runner uses it to pick a binding, decide whether to provision a browser,
   * and report how much of the flow each surface actually covers.
   */
  surfaces?: ScenarioSurface[]
  /**
   * Scenario steps only: this step is driven by a persona, so the runner injects
   * `wire.actor` and refuses to dispatch it without one. Set by the definer from
   * a `browser` binding or an explicit `actor: true`, never written by hand.
   */
  requiresActor?: boolean
  audit?:
    | boolean
    | {
        durability?: 'best-effort' | 'transactional'
      }
  approvalDescription?: any
  func: PikkuFunction
  /**
   * Scenarios only: runs before the scenario body, with the scenario's own
   * signature. Throwing skips the body and fails the run, but `after` still
   * runs.
   */
  before?: CorePikkuFunctionHook
  /**
   * Scenarios only: always runs after the body, in a `finally`. Throwing fails
   * an otherwise-passing run; on an already-failed run it attaches as `cause`
   * and never replaces the original error.
   */
  after?: CorePikkuFunctionHook
  /**
   * Scenarios only: why this scenario is held out of a default run. Reported
   * as skipped rather than quietly omitted; naming it in `--flows` runs it.
   */
  skip?: string
  auth?: boolean
  /**
   * Scopes the session must hold; all are required (AND) and checked before
   * `permissions`, which OR together — a scope can only narrow access.
   * Narrowed to the generated `ScopeId` union, so an undeclared scope is a
   * compile error. Requires a session — see
   * {@link CorePikkuSessionlessFunctionConfig}.
   */
  scopes?: Scope[]
  permissions?: CorePermissionGroup<PikkuPermission>
  middleware?: PikkuMiddleware[]
  input?: InputSchema
  output?: OutputSchema
  node?: CoreNodeConfig
  errors?: Array<typeof PikkuError>
}

/**
 * {@link CorePikkuFunctionConfig} for a function that runs without a session.
 *
 * Identical, minus `scopes`. Scopes are AND-ed and `verifyScopes` fails closed,
 * so an anonymous caller holds none and satisfies none — a sessionless function
 * with scopes rejects every caller it exists to serve. Gate it with
 * `permissions`, which receive the optional session and may pass anonymous.
 */
export type CorePikkuSessionlessFunctionConfig<
  PikkuFunction extends CorePikkuFunctionSessionless<any, any, any, any, any>,
  PikkuPermission extends CorePikkuPermission<any, any, any> =
    CorePikkuPermission<any>,
  PikkuMiddleware extends CorePikkuMiddleware<any, any> = CorePikkuMiddleware<
    any,
    any
  >,
  InputSchema extends StandardSchemaV1 | undefined = undefined,
  OutputSchema extends StandardSchemaV1 | undefined = undefined,
> = Omit<
  CorePikkuFunctionConfig<
    PikkuFunction,
    PikkuPermission,
    PikkuMiddleware,
    InputSchema,
    OutputSchema
  >,
  'scopes'
>
