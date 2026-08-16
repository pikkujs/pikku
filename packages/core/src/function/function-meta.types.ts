import type { MiddlewareMetadata } from '../middleware/middleware.types.js'
import type { AuditDurability } from '../services/audit-service.js'
import type {
  ScenarioStepKind,
  ScenarioSurface,
} from '../wirings/workflow/scenario-step.types.js'
import type { CommonWireMeta } from '../types/core.types.js'

export interface FunctionServicesMeta {
  optimized: boolean
  services: string[]
}

export interface FunctionWiresMeta {
  optimized: boolean
  wires: string[]
}

/**
 * A reference to a permission function, resolved by name. Function-scoped
 * only: there are no wire- or tag-level permission references.
 */
export type PermissionMetadata = {
  type: 'wire'
  name: string
  inline?: boolean
}

export type FunctionRuntimeMeta = {
  pikkuFuncId: string
  inputSchemaName: string | null
  outputSchemaName: string | null
  /** Scopes the session must hold to run this function. All are required (AND). */
  scopes?: string[]
  expose?: boolean
  /**
   * A sessionless function's own `auth: true`. `sessionless` carries the
   * baseline — a `pikkuFunc` always requires a session — and this carries the
   * tightening a `pikkuSessionlessFunc` applies to itself. Both are needed to
   * know whether a function is gated without running it.
   */
  auth?: boolean
  /**
   * The author's declaration that this function's permission check lives in its
   * own body. Carries no runtime effect — it records a gate codegen cannot see,
   * so an audit is not left to guess whether a sessionless function is open.
   * Refused unless `allow.permissionsInBody` is set in `pikku.config.json`.
   */
  permissionsInBody?: boolean
  remote?: boolean
  /**
   * A step RPC: invoked by name only from a scenario run and refused
   * everywhere else, so it is never network-callable.
   */
  scenarioStep?: boolean
  /**
   * The body of a `pikkuScenario(...)`. Only ever run by `pikku scenario run`,
   * so it is held back from the app bootstrap and from every deployed unit.
   */
  scenario?: boolean
  mcp?: boolean
  readonly?: boolean
  deploy?: 'serverless' | 'server' | 'auto'
  sessionless?: boolean
  /** When true, workflow steps calling this function are dispatched via the queue. No queue service configured is a hard error. */
  workflowQueued?: boolean
  /** Retry count when this function is used as a workflow step. */
  workflowRetries?: number
  /** Timeout when this function is used as a workflow step (e.g. '30s', '5m'). */
  workflowTimeout?: string
  /**
   * Scenario steps only: which surfaces this step declares a binding for.
   *
   * The reporter derives coverage from this — a `then` with no binding for the
   * surface the run targeted was never actually witnessed there, which is a gap
   * worth counting rather than excusing.
   */
  scenarioStepSurfaces?: ScenarioSurface[]
  /**
   * Scenario steps only: who acts. Absent means `persona` — the ordinary step,
   * and the only kind that existed before the other two.
   *
   * A `platform` or `addon` step is the app or a third-party system acting, and
   * it must never reach a virtual user's catalogue. That is not tidiness: a
   * virtual user that can invoke "Stripe's webhook arrives" can forge its own
   * payment success, and every finding downstream of that is worthless.
   */
  scenarioStepKind?: ScenarioStepKind
  /** Addon steps only: the addon whose system acts — `wireAddon`'s `name`. */
  scenarioStepAddon?: string
  /** Scenario steps only: the prose a reporter renders, with `{placeholders}` filled from the step's recorded input. */
  scenarioStepTemplate?: string
  /**
   * The function's `audit` config, resolved — `audit: true` reads as
   * `{ durability: 'best-effort' }`. Absent means the function records nothing:
   * `auditLog.write()` from an unmarked function is dropped with a warning, so
   * this is the only place a reader can see which functions have a trail at all
   * without running them.
   *
   * Informational. The runner resolves audit from the live function config, not
   * from here, so meta and runtime cannot disagree about whether audit is on.
   */
  audit?: {
    durability: AuditDurability
  }
  version?: number
  approvalRequired?: boolean
  approvalDescription?: string
  implementationHash?: string
  contractHash?: string
  inputHash?: string
  outputHash?: string
}

export type FunctionMeta = FunctionRuntimeMeta &
  Partial<
    {
      name: string
      /** `remote`: a contract with no local body, answered by a connected client. */
      functionType: 'user' | 'inline' | 'helper' | 'remote'
      funcWrapper: string
      services: FunctionServicesMeta
      wires: FunctionWiresMeta
      inputs: string[] | null
      outputs: string[] | null
      middleware: MiddlewareMetadata[]
      permissions: PermissionMetadata[]
      isDirectFunction: boolean
      sourceFile: string
      exportedName: string
      /** File containing the handler body when it differs from sourceFile (imported handlers) */
      bodySourceFile?: string
      /** 1-indexed first line of the handler body (verbose meta; coverage mapping) */
      bodyStart: number
      /** 1-indexed last line of the handler body (verbose meta; coverage mapping) */
      bodyEnd: number
    } & CommonWireMeta
  >

export type FunctionsRuntimeMeta = Record<string, FunctionRuntimeMeta>
export type FunctionsMeta = Record<string, FunctionMeta>
