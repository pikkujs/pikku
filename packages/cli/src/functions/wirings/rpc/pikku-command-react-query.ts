import { pikkuSessionlessFunc } from '#pikku/function'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { dirname, join } from 'node:path'
import { addonMockSources } from '../../mocks/addon-mocks.js'
import { serializeMocksModule } from './serialize-mocks-module.js'
import { serializeReactQueryHooks } from './serialize-react-query-hooks.js'
import { readStubMocks } from './read-stub-mocks.js'

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

    const mocksFile = join(dirname(reactQueryFile), 'mocks.gen.ts')
    await writeFileInDir(
      logger,
      mocksFile,
      serializeMocksModule(
        mocksFile,
        getFileImportRelativePath(mocksFile, reactQueryFile, packageMappings),
        join(config.rootDir, '.mocks'),
        addons
      )
    )
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Generating React Query hooks',
      commandEnd: 'Generated React Query hooks',
    }),
  ],
})
