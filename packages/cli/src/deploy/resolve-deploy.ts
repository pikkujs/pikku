import type {
  PikkuBackendInput,
  PikkuCLIInput,
  PikkuDeployGrouping,
} from '../../types/config.js'

export type DeployTarget = 'serverless' | 'server'

/** What `pikku deploy` needs to know about one backend or frontend. */
export type ResolvedDeploy = {
  /** Undefined until a project default, an override or `-p` names one. */
  provider: string | undefined
  target: DeployTarget
  bundler: 'auto' | 'bun' | 'esbuild'
  mangleIdentifiers?: boolean
  serverlessIncompatible?: string[]
  grouping?: PikkuDeployGrouping
  embed?: Record<string, string>
}

type DeployConfig = {
  deploy?: PikkuCLIInput['deploy']
  backends?: Record<string, PikkuBackendInput>
  frontends?: Record<
    string,
    { deploy?: boolean | { provider?: string; target?: DeployTarget } }
  >
}

export type DeployUnitRef =
  { backend: string } | { frontend: string } | undefined

const frontendOverride = (deploy: unknown) =>
  deploy && typeof deploy === 'object'
    ? (deploy as { provider?: string; target?: DeployTarget })
    : undefined

/**
 * The deploy settings for one unit: the project's `deploy` is the default, and
 * the unit's own `deploy` overrides `provider` and `target`. `grouping` and
 * `embed` are per backend and have no project default.
 *
 * `cliProvider` is `-p`; it beats both.
 */
export const resolveDeploy = (
  config: DeployConfig,
  unit?: DeployUnitRef,
  cliProvider?: string
): ResolvedDeploy => {
  const base = config.deploy ?? {}
  let override: { provider?: string; target?: DeployTarget } | undefined
  let backend: PikkuBackendInput['deploy']
  if (unit && 'backend' in unit) {
    backend = config.backends?.[unit.backend]?.deploy
    override = backend
  } else if (unit && 'frontend' in unit) {
    override = frontendOverride(config.frontends?.[unit.frontend]?.deploy)
  }
  return {
    provider: cliProvider ?? override?.provider ?? base.provider,
    target: override?.target ?? base.target ?? 'serverless',
    bundler: base.bundler ?? 'auto',
    mangleIdentifiers: base.mangleIdentifiers,
    serverlessIncompatible: base.serverlessIncompatible,
    grouping: backend?.grouping,
    embed: backend?.embed,
  }
}

/**
 * A deploy with no provider is refused. There is no fallback provider: a
 * project that never named one has not chosen where it deploys.
 */
export const requireProvider = (
  resolved: ResolvedDeploy,
  unit?: DeployUnitRef
): string => {
  if (resolved.provider) return resolved.provider
  const label =
    unit && 'backend' in unit
      ? `backend '${unit.backend}'`
      : unit && 'frontend' in unit
        ? `frontend '${unit.frontend}'`
        : 'this project'
  const override =
    unit && 'backend' in unit
      ? `backends.${unit.backend}.deploy.provider`
      : unit && 'frontend' in unit
        ? `frontends.${unit.frontend}.deploy.provider`
        : undefined
  throw new Error(
    `No deploy provider for ${label}. Set "deploy": { "provider": "<name>" } in pikku.config.json${override ? ` (or ${override} for this one)` : ''}, or pass --provider.`
  )
}
