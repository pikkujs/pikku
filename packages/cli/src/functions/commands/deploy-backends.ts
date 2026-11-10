import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { FrontendKind, ProviderAdapter } from '@pikku/deploy'
import { filterInspectorState } from '@pikku/inspector'
import type { InspectorState } from '@pikku/inspector'
import type { Logger } from '@pikku/core/services'

import type { Bundler } from '../../deploy/bundler/bundler.interface.js'
import { runBuildPipeline } from '../../deploy/build-pipeline.js'
import {
  resolveDeploy,
  type ResolvedDeploy,
} from '../../deploy/resolve-deploy.js'
import { parseCLIFilters } from '../../utils/parse-cli-filters.js'
import { selectBackends } from '../../utils/select-backends.js'
import { servedFrontend } from '../../utils/frontend.js'

/** One backend, with everything `deploy plan` and `deploy apply` need to build it. */
export type BackendDeploy = {
  name: string
  resolved: ResolvedDeploy
  providerName: string
  /** `.deploy` for a lone backend, `.deploy/<name>` once there are several. */
  deployDir: string
  /** The backend's filtered tree, `.pikku/backends/<name>`. */
  backendDir: string
  /** More than one backend is declared, so outputs are told apart by name. */
  many: boolean
}

type DeployConfig = Parameters<typeof resolveDeploy>[0] & {
  rootDir: string
  outDir: string
  backends?: Record<string, unknown>
}

/**
 * The backends a deploy run covers, each with its resolved provider. A
 * backend that names no provider deploys with the default, `standalone`.
 */
export const planBackendDeploys = (
  config: DeployConfig,
  options: { backend?: string; provider?: string }
): BackendDeploy[] => {
  const declared = Object.keys(config.backends ?? {})
  const names = selectBackends(config.backends, options.backend)
  const many = declared.length > 1
  return names.map((name) => {
    const resolved = resolveDeploy(config, { backend: name }, options.provider)
    return {
      name,
      resolved,
      providerName: resolved.provider,
      deployDir: many
        ? join(config.rootDir, '.deploy', name)
        : join(config.rootDir, '.deploy'),
      backendDir: join(config.outDir, 'backends', name),
      many,
    }
  })
}

/** One frontend a deploy run covers, with the provider it deploys through. */
export type FrontendDeploy = {
  name: string
  kind: FrontendKind
  providerName: string
  dir: string
  /** Set when `serve` ships it inside a backend's bundle. */
  embedded: boolean
}

type FrontendsConfig = Parameters<typeof resolveDeploy>[0] & {
  frontends?: Record<
    string,
    {
      kind?: FrontendKind
      dist?: string
      deploy?: unknown
      serve?: unknown
    }
  >
}

/**
 * The frontends a deploy run covers, each with its resolved provider.
 * `deploy: false` leaves one out. A `serve` frontend ships inside its backend's
 * bundle, so it must use that backend's provider.
 */
export const planFrontendDeploys = (
  config: FrontendsConfig,
  options: { provider?: string },
  backends: BackendDeploy[]
): FrontendDeploy[] => {
  const plans: FrontendDeploy[] = []
  for (const [name, frontend] of Object.entries(config.frontends ?? {})) {
    if (frontend.deploy === false) continue
    const resolved = resolveDeploy(config, { frontend: name }, options.provider)
    const embedded = Boolean(frontend.serve)
    if (embedded) {
      const own =
        typeof frontend.deploy === 'object' && frontend.deploy
          ? (frontend.deploy as { provider?: string }).provider
          : undefined
      const served = [...new Set(backends.map((b) => b.providerName))]
      if (
        own &&
        !options.provider &&
        served.length > 0 &&
        !served.includes(own)
      ) {
        throw new Error(
          `Frontend '${name}' sets serve, so it deploys inside its backend's bundle with that backend's provider (${served.join(', ')}), but frontends.${name}.deploy.provider is '${own}'. Remove frontends.${name}.deploy.provider, or remove serve.`
        )
      }
    }
    plans.push({
      name,
      kind: frontend.kind ?? 'spa',
      providerName: resolved.provider,
      dir: frontend.dist ?? 'dist',
      embedded,
    })
  }
  return plans
}

/**
 * Throws unless the provider can host this frontend. Runs before any build so a
 * deploy that cannot ship a frontend fails with nothing built.
 */
export const assertFrontendSupported = (
  frontend: FrontendDeploy,
  provider: ProviderAdapter
): void => {
  const support = provider.frontends
  if (!support || !support.kinds.includes(frontend.kind)) {
    throw new Error(
      `Frontend '${frontend.name}' (kind ${frontend.kind}) cannot deploy to provider '${provider.name}': no ${frontend.kind} frontend support. Set frontends.${frontend.name}.deploy.provider to a provider that supports it, or deploy: false.`
    )
  }
  if (frontend.embedded) {
    if (!support.embedded) {
      throw new Error(
        `Frontend '${frontend.name}' sets serve, but provider '${provider.name}' cannot embed a frontend in a backend bundle. Remove serve and give it a provider that hosts frontends, or deploy: false.`
      )
    }
    return
  }
  if (typeof provider.deployFrontend !== 'function') {
    throw new Error(
      `Frontend '${frontend.name}' cannot deploy to provider '${provider.name}': the provider declares frontend support but does not implement deployFrontend. Add serve to deploy it inside a backend bundle, or set deploy: false.`
    )
  }
}

/** With several backends one result file would be overwritten by each. */
export const resultFileFor = (
  resultFile: string | undefined,
  backend: BackendDeploy
): string | undefined =>
  resultFile && backend.many
    ? resultFile.replace(/(\.json)?$/, `.${backend.name}$1`)
    : resultFile

/** The inspector state this backend's filter keeps. */
export const backendState = (
  config: Parameters<typeof parseCLIFilters>[1],
  state: InspectorState,
  backend: BackendDeploy,
  logger: Logger
): InspectorState =>
  filterInspectorState(
    state,
    parseCLIFilters({}, config, backend.name),
    logger as never
  ) as InspectorState

export const buildBackend = (args: {
  config: DeployConfig & {
    globalHTTPPrefix?: string
    srcDirectories?: string[]
    db?: { sqliteExtensions?: string[] }
    frontends?: Parameters<typeof servedFrontend>[0]
  }
  backend: BackendDeploy
  provider: ProviderAdapter
  projectId: string
  inspectorState: InspectorState
  getEntryContext: Parameters<typeof runBuildPipeline>[0]['getEntryContext']
  debugArtifacts: boolean
  logger: Logger
  bundler: Bundler
}) => {
  const { config, backend, provider } = args
  const frontend = servedFrontend(config.frontends)
  if (provider.singleUnit) {
    if (!existsSync(backend.backendDir)) {
      throw new Error(
        `${backend.backendDir} does not exist. Run \`pikku all\` first: a ${provider.name} deploy bundles the backend's own generated tree.`
      )
    }
    if (frontend && backend.many) {
      throw new Error(
        `Frontend '${frontend.name}' sets serve, and ${provider.name} ships it inside one backend's bundle, but this project declares several backends and no key says which one. Deploy one backend (--backend <name>), move the frontend to a provider that is not single-unit, or remove serve.`
      )
    }
  }
  const { resolved } = backend
  return runBuildPipeline({
    projectDir: config.rootDir,
    projectId: args.projectId,
    provider,
    inspectorState: args.inspectorState,
    serverlessIncompatible: resolved.serverlessIncompatible,
    defaultTarget: resolved.target,
    grouping: resolved.grouping,
    mangleIdentifiers: resolved.mangleIdentifiers,
    globalHTTPPrefix: config.globalHTTPPrefix,
    getEntryContext: args.getEntryContext,
    frontend,
    deployDir: backend.deployDir,
    outDir: config.outDir,
    backendDir: backend.backendDir,
    srcDirectories: config.srcDirectories,
    sqliteExtensions: config.db?.sqliteExtensions,
    embed: resolved.embed,
    debugArtifacts: args.debugArtifacts,
    logger: args.logger as never,
    bundler: args.bundler,
  })
}

/** Said when a deploy run covers no backend and no frontend. */
export const NOTHING_TO_DEPLOY =
  'Nothing to deploy: this project declares no backends, and no frontend is set to deploy.'
