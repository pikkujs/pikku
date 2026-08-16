import type {
  CoreConfig,
  CoreServices,
  CoreSingletonServices,
  CoreUserSession,
} from '@pikku/core/types'
import type { WorkflowService } from '@pikku/core/workflow'
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
  /** `unfiltered` skips the CLI filters (`--tags`, `--types`, …), which narrow
   *  what gets generated. A command that RUNS the project rather than
   *  generating from it needs the whole project: `--tags` on `pikku scenario
   *  run` selects which scenarios to run, and narrowing the state by it would
   *  strip out the very step functions the run is about to call. */
  getInspectorState: (
    refresh?: boolean,
    setupOnly?: boolean,
    bootstrapMode?: boolean,
    unfiltered?: boolean
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
