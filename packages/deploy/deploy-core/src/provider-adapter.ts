/**
 * Provider adapter interface for the deploy pipeline.
 *
 * Each provider (Cloudflare, AWS, etc.) implements this to handle
 * the provider-specific parts of deployment: entry generation,
 * infrastructure manifests, and config files.
 *
 * The generic pipeline handles: analysis, codegen, bundling, plan/apply.
 */

import type { DeploymentManifest, DeploymentUnit } from './manifest.js'

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
  /**
   * `import mcpJson from '…/mcp.gen.json' with { type: 'json' }` when the unit
   * has a non-empty mcp.gen.json, else ''. Pair with `mcpServerOption`.
   */
  mcpImport: string
  /**
   * `'mcpJson, '` to splice into the PikkuNodeHTTPServer *third* (options) arg —
   * the server reads `this.options.mcpJson`, NOT the first config arg — so it
   * mounts /mcp. Else ''. Empty is safe — trailing commas are valid.
   */
  mcpServerOption: string
  /**
   * The mount for a frontend the deploy is serving from the server's own
   * origin, or undefined when the project configured none.
   *
   * Only the mount's shape travels here — where the built files end up is the
   * provider's business, because it differs per runtime: node reads a directory
   * copied beside the bundle, while a compiled bun binary has no directory at
   * all and reads an embedded asset map instead.
   */
  frontend?: {
    urlPrefix: string
    spaFallback: boolean
  }
  /**
   * The database the generated entry has to open for itself, or undefined when
   * the project has none.
   *
   * A hosted runtime hands `kysely` to `createSingletonServices` — `pikku dev`
   * builds one, and a Cloudflare deploy binds one — so app code is written
   * expecting it and typically throws without it. A standalone artifact has no
   * such host: it IS the runtime, and until this existed it started an app whose
   * services factory had nothing to connect to.
   *
   * Only the engine and where to find the coercion map travel here. Which
   * dialect package to import, and how to reach the database, is the provider's
   * business — a compiled bun binary and a node bundle do not open SQLite the
   * same way, and Postgres is reached by URL rather than by path at all.
   */
  db?: {
    engine: 'sqlite' | 'postgres'
    /**
     * Import specifier for the generated `coercionMap`, relative to unitDir.
     *
     * Absent when the app generates no coercion map. It is not a SQLite
     * concern: the map is built from `db/annotations.ts` rather than from the
     * dialect, and a Postgres app that annotates a column needs it attached for
     * the same reason.
     */
    coercionImportPath?: string
  }

  /**
   * The app's `pikkuServerLifecycle` export, when it declares one.
   *
   * Only `pikku dev` and `pikku serve` have ever called these hooks, so an app
   * that seeds its first admin account or opens a connection pool in
   * `beforeStart` did that in development and silently skipped it everywhere it
   * was actually deployed. A generated entry is the app's real host and owes it
   * the same lifecycle the dev server gives it.
   */
  lifecycle?: {
    /** Import specifier for the lifecycle module, relative to unitDir. */
    importPath: string
    /** The exported name to call the hooks on. */
    variable: string
  }
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
   * Generate the entry file source for a `target: 'server'` (container) unit.
   *
   * Optional. When a provider implements it, the deploy pipeline uses it
   * instead of the provider-agnostic `generateServerEntrySource`, so the
   * provider can inject the SAME platform services (kysely, secrets, …) into
   * the container that it injects into its serverless workers — sourcing the
   * bindings from `process.env` instead of a runtime `env` object. When
   * omitted, the pipeline falls back to the generic generator (no platform
   * injection), which is correct for providers whose containers carry no
   * platform services.
   */
  generateServerEntrySource?(ctx: EntryGenerationContext): string

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
   * Regex sources for modules to stub to `export {}` during bundling — modules
   * this provider's runtime never executes (e.g. the `postgres` driver on CF
   * Workers, which use a libsql/Turso dialect). Unlike `getExternals`, a stub
   * removes the bytes entirely rather than leaving a runtime import to resolve.
   */
  getStubModules?(): string[]

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
    /** Names of the deployed units, as they appear on the provider. */
    workersDeployed?: string[]
    /** Identifiers of the resources provisioned for this deploy. */
    resourcesCreated?: string[]
    errors: Array<{ step: string; error: string }>
  }>
}
