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
}
