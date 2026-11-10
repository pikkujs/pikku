import { pikkuSessionlessFunc } from '#pikku/function'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { addonMockSources } from '../../mocks/addon-mocks.js'
import { mocksToGlob, serializeMocksModule } from './serialize-mocks-module.js'
import { serializeReactQueryHooks } from './serialize-react-query-hooks.js'
import { readStubMocks } from './read-stub-mocks.js'

/** True when `name` resolves from `dir` the way a bundler would: some `node_modules` above it holds it. */
export const canResolvePackage = (dir: string, name: string): boolean => {
  let current = dir
  for (;;) {
    if (existsSync(join(current, 'node_modules', name, 'package.json'))) {
      return true
    }
    const parent = dirname(current)
    if (parent === current) return false
    current = parent
  }
}

/** The hooks import these two; a project without them cannot compile the file. */
const REACT_QUERY_PACKAGES = ['@tanstack/react-query', '@pikku/react']

export const pikkuReactQuery = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config, getInspectorState }) => {
    const reactQueryFile = config.clientFiles?.reactQueryFile
    const {
      rpcMapDeclarationFile,
      workflowMapDeclarationFile,
      packageMappings,
    } = config

    if (!reactQueryFile) {
      logger.debug({
        message:
          "Skipping generating React Query hooks since reactQueryFile isn't set in the pikku config.",
        type: 'skip',
      })
      return
    }

    // Every backend's SDK names this file now, so a project that does not use
    // React Query would otherwise get a file importing packages it lacks.
    const missing = REACT_QUERY_PACKAGES.filter(
      (name) => !canResolvePackage(config.configDir, name)
    )
    if (missing.length > 0) {
      logger.debug({
        message: `Skipping React Query hooks: ${missing.join(' and ')} not installed for ${config.configDir}.`,
        type: 'skip',
      })
      return
    }

    const { workflows, auth, rpc } = await getInspectorState()
    const hasWorkflows = Object.keys(workflows?.meta ?? {}).length > 0

    const rpcMapPath = getFileImportRelativePath(
      reactQueryFile,
      rpcMapDeclarationFile,
      packageMappings
    )

    let workflowMapPath: string | undefined
    if (hasWorkflows) {
      workflowMapPath = getFileImportRelativePath(
        reactQueryFile,
        workflowMapDeclarationFile,
        packageMappings
      )
    }

    const addons = addonMockSources(rpc.wireAddonDeclarations, [
      dirname(config.outDir),
      config.rootDir,
    ])
    const stubs = await readStubMocks(join(config.rootDir, '.mocks'), addons)

    // `useSession` only exists for an app that has auth at all.
    const content = serializeReactQueryHooks(
      rpcMapPath,
      workflowMapPath,
      !!auth.definition,
      stubs
    )
    await writeFileInDir(logger, reactQueryFile, content)

    const mocks = mocksToGlob(join(config.rootDir, '.mocks'), addons)
    if (mocks) {
      const mocksFile = join(dirname(reactQueryFile), 'mocks.gen.ts')
      await writeFileInDir(
        logger,
        mocksFile,
        serializeMocksModule(
          mocksFile,
          getFileImportRelativePath(mocksFile, reactQueryFile, packageMappings),
          join(config.rootDir, '.mocks'),
          mocks.addons,
          mocks.app
        )
      )
    }
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating React Query hooks',
      commandEnd: 'Generated React Query hooks',
    }),
  ],
})
