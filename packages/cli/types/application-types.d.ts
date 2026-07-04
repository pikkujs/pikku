import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
  WorkflowService,
} from '@pikku/core'
import type { CLILogger } from '../src/services/cli-logger.service.js'
import type { PikkuCLIConfig } from '../types/config.d.ts'
import type { InspectorState } from '@pikku/inspector'
import type { Bundler } from '../src/deploy/bundler/bundler.interface.js'
import type { DevServerRunner } from '../src/server/dev-server-runner.interface.js'

export interface Config extends CoreConfig<PikkuCLIConfig> {
  // Preloaded inspector state from stateInput file (if provided)
  preloadedInspectorState?: Omit<InspectorState, 'typesLookup'>
  /** When true, generated imports use relative paths even when packageMappings
   *  would normally apply. Used by per-unit deploy codegen (--force-relative-imports)
   *  so .deploy/ bootstrap files don't emit package-name imports that the bundler
   *  can't resolve from outside the workspace. */
  forceRelativeImports?: boolean
}

export interface SingletonServices extends CoreSingletonServices<Config> {
  workflowService: WorkflowService
  logger: CLILogger
  getInspectorState: (
    refresh?: boolean,
    setupOnly?: boolean,
    bootstrapMode?: boolean
  ) => Promise<InspectorState>
  /** Marks the cached inspector state stale (a watcher saw a source-file
   *  change) so the next getInspectorState(refresh) truly re-inspects —
   *  refreshes are otherwise skipped when no generated .ts file changed. */
  invalidateInspectorState: () => void
  /** Runtime-specific deploy bundler (esbuild for node, Bun.build for bun). */
  bundler: Bundler
  /** Runtime-specific dev server runner (node http+ws, or bun-server). */
  devServerRunner: DevServerRunner
}

export interface Services extends CoreServices<SingletonServices> {}

export interface UserSession extends CoreUserSession {}
