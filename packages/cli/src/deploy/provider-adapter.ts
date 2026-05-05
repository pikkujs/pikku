/**
 * Provider adapter interface for the deploy pipeline.
 *
 * Each provider (Cloudflare, AWS, etc.) implements this to handle
 * the provider-specific parts of deployment: entry generation,
 * infrastructure manifests, and config files.
 *
 * The generic pipeline handles: analysis, codegen, bundling, plan/apply.
 */

import type { DeploymentManifest, DeploymentUnit } from './analyzer/manifest.js'

export interface EntryGenerationContext {
  /** The unit being generated */
  unit: DeploymentUnit
  /** Absolute path to the unit's output directory */
  unitDir: string
  /** Relative path to the unit's pikku-bootstrap.gen.js */
  bootstrapPath: string
  /** Import statement for createConfig */
  configImport: string
  /** Variable name for createConfig */
  configVar: string
  /** Import statement for createSingletonServices */
  servicesImport: string
  /** Variable name for createSingletonServices */
  servicesVar: string
  /** Import statement for SingletonServices type (or empty string) */
  singletonServicesImport: string
  /** Type expression for Partial<SingletonServices> (or fallback) */
  servicesType: string
}

export interface ProviderAdapter {
  /** Provider name (e.g. 'cloudflare', 'aws') */
  readonly name: string

  /** Subdirectory name under .deploy/ (e.g. 'cloudflare') */
  readonly deployDirName: string

  /**
   * When true, skips per-unit decomposition and bundles everything
   * into a single unit using the project's full .pikku/ directory.
   * Used by standalone adapter.
   */
  readonly singleUnit?: boolean

  /**
   * Whether the provider's workflow runtime needs synthesized per-step
   * dispatch queues. Defaults to `true`.
   *
   * - `true` (default): The deploy pipeline synthesizes a `wf-orchestrator-*`
   *   queue and a `wf-step-*` queue for every workflow step, plus producer
   *   bindings, so the workflow runtime can fan out via queues.
   * - `false`: No synthetic workflow queues are emitted into the manifest
   *   or per-unit codegen. Use this when the provider's workflow runtime
   *   dispatches steps natively (e.g. Cloudflare's Durable-Object-based
   *   `CloudflareWorkflowService`, where the orchestrator DO advances
   *   steps directly without a queue hop). Queues created via explicit
   *   `wireQueue(...)` user code are unaffected.
   */
  readonly workflowQueues?: boolean

  /**
   * Generate the entry file source for a deployment unit.
   * Called once per unit.
   */
  generateEntrySource(ctx: EntryGenerationContext): string

  /**
   * Generate provider-specific config files per unit (e.g. wrangler.toml).
   * Returns a map of filename → content to write into the unit directory.
   */
  generateUnitConfigs(
    unit: DeploymentUnit,
    manifest: DeploymentManifest,
    projectId: string
  ): Map<string, string>

  /**
   * Generate provider-level infrastructure manifest (e.g. infra.json).
   * Returns file content, or null if not applicable.
   */
  generateInfraManifest(manifest: DeploymentManifest): string | null

  /**
   * External modules for esbuild bundling.
   * Defaults to ['node:*'] if not provided.
   */
  getExternals?(): string[]

  /**
   * Module aliases for esbuild bundling (e.g. { crypto: 'node:crypto' }).
   * Used to remap bare imports to platform-compatible paths.
   */
  getAliases?(): Record<string, string>

  /**
   * esbuild define map for compile-time constants (e.g. { 'process.env.NODE_ENV': '"production"' }).
   */
  getDefine?(): Record<string, string>

  /**
   * esbuild platform target. Defaults to 'node'.
   * Cloudflare Workers should use 'neutral'.
   */
  getPlatform?(): 'node' | 'neutral' | 'browser'

  /**
   * esbuild output format. Defaults to 'esm'.
   * pkg requires 'cjs' for standalone binaries.
   */
  getFormat?(): 'esm' | 'cjs'

  /**
   * Skip the createRequire banner. CF Workers should return true —
   * `import.meta.url` is undefined there and the banner crashes at boot.
   */
  getNoRequireShim?(): boolean

  /**
   * Generate additional provider-level config files (e.g. serverless.yml).
   * Returns a map of filename → content to write into the deploy directory.
   */
  generateProviderConfigs?(manifest: DeploymentManifest): Map<string, string>

  /**
   * Emit any provider-specific artifacts that aren't tied to a single user
   * unit — e.g. a synthesized proxy Worker that fronts a CF Container.
   * Called after the infra manifest is written so providers can read it
   * and key off resources that were provisioned in earlier steps.
   */
  emitSideArtifacts?(options: {
    buildDir: string
    manifest: DeploymentManifest
    logger: { info(msg: string): void; error(msg: string): void }
  }): Promise<void>

  /**
   * Deploy the built artifacts to the provider.
   * Optional — if not implemented, the CLI just outputs the build directory.
   */
  deploy?(options: {
    buildDir: string
    logger: { info(msg: string): void; error(msg: string): void }
    onProgress?: (step: string, detail: string) => void
  }): Promise<{
    success: boolean
    workersDeployed?: Array<{ name: string }>
    resourcesCreated?: Array<{ type: string; name: string }>
    errors: Array<{ step: string; error: string }>
  }>
}
