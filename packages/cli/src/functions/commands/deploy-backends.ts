import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { ProviderAdapter } from '@pikku/deploy'
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
        `A frontend sets serve, and ${provider.name} ships it inside one backend's bundle, but this project declares several backends and no key says which one. Deploy with a single backend, or remove serve.`
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
