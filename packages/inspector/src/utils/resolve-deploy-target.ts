import type { FunctionMeta } from '@pikku/core/services'

/**
 * Thrown when a function's explicit `deploy: 'serverless'` conflicts
 * with one of its services being declared `serverlessIncompatible`.
 * The user has to either remove the explicit flag (let it auto-resolve
 * to 'server'), or set `deploy: 'server'` explicitly.
 */
export class IncompatibleDeployTargetError extends Error {
  constructor(
    public readonly functionName: string,
    public readonly incompatibleServices: string[]
  ) {
    super(
      `Function '${functionName}' is declared deploy: 'serverless' but uses ` +
        `serverless-incompatible service(s) [${incompatibleServices.join(', ')}]. ` +
        `Either remove deploy: 'serverless' (will auto-resolve to 'server'), ` +
        `or set deploy: 'server' explicitly.`
    )
    this.name = 'IncompatibleDeployTargetError'
  }
}

/**
 * The function's services that are declared `serverlessIncompatible`. A
 * non-empty result is exactly the condition that crosses a function to
 * 'server', so callers that need to explain a target — rather than only
 * resolve it — read the reason from here.
 */
export function incompatibleServicesFor(
  funcMeta: Pick<FunctionMeta, 'services'>,
  serverlessIncompatible: Set<string>
): string[] {
  const hits: string[] = []
  for (const svc of funcMeta.services?.services ?? []) {
    if (serverlessIncompatible.has(svc)) hits.push(svc)
  }
  return hits
}

/**
 * Determine the effective deploy target for a function.
 *
 * Resolution order:
 *   1. If any of the function's services is in `serverlessIncompatible`:
 *      - throw if the function explicitly declares `deploy: 'serverless'`
 *      - otherwise target is 'server'
 *   2. Explicit `funcMeta.deploy: 'serverless' | 'server'`
 *   3. `defaultTarget` (sourced from `pikku.config.json` →
 *      `deploy.defaultTarget`, falling back to 'serverless')
 *
 * Used both by the per-unit deploy analyzer (when bucketing functions
 * into deployment units) and by `filterInspectorState` (when
 * `pikku all --deploy <target>` is used to emit a target-scoped set
 * of gen files).
 */
export function resolveDeployTarget(
  funcMeta: Pick<FunctionMeta, 'deploy' | 'services'>,
  serverlessIncompatible: Set<string>,
  functionName = '<unknown>',
  defaultTarget: 'serverless' | 'server' = 'serverless'
): 'serverless' | 'server' {
  // Service compatibility wins over the explicit flag — a serverless
  // bundle of a function that needs (e.g.) node:fs would crash at runtime.
  const incompatibleHits = incompatibleServicesFor(
    funcMeta,
    serverlessIncompatible
  )

  if (incompatibleHits.length > 0) {
    if (funcMeta.deploy === 'serverless') {
      throw new IncompatibleDeployTargetError(functionName, incompatibleHits)
    }
    return 'server'
  }

  if (funcMeta.deploy === 'server') return 'server'
  if (funcMeta.deploy === 'serverless') return 'serverless'
  return defaultTarget
}
