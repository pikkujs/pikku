import { pikkuSessionlessFunc } from '#pikku/function'
import { existsSync } from 'fs'
import { readdir, rm } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { serializeLeafIndex } from './serialize-leaf-index.js'

/**
 * The leaf name a wiring's entry file is reached by. An addon never generates
 * the wiring leaves, so those indexes are simply absent and `#pikku/http`
 * fails to resolve rather than resolving to a module missing the export.
 */
const leafEntries = [
  ['function', 'functionTypesFile'],
  ['error', 'errorTypesFile'],
  ['http', 'httpTypesFile'],
  ['channel', 'channelsTypesFile'],
  ['gateway', 'gatewaysTypesFile'],
  ['trigger', 'triggersTypesFile'],
  ['scheduler', 'schedulersTypesFile'],
  ['queue', 'queueTypesFile'],
  ['workflow', 'workflowTypesFile'],
  ['scenarios', 'scenarioTypesFile'],
  ['mcp', 'mcpTypesFile'],
  ['agent', 'agentTypesFile'],
  ['cli', 'cliTypesFile'],
  ['addon', 'addonTypesFile'],
  ['secrets', 'secretTypesFile'],
  ['credentials', 'credentialsFile'],
  ['scopes', 'scopeTypesFile'],
  ['variables', 'variableTypesFile'],
  ['auth', 'authTypesFile'],
] as const

export const pikkuLeafIndexes = pikkuSessionlessFunc<void, void>({
  func: async ({ logger, config }) => {
    const written = new Set<string>()

    for (const [leaf, key] of leafEntries) {
      const entryFile = config[key]
      if (!entryFile || !existsSync(entryFile)) continue

      const indexFile = join(dirname(entryFile), 'index.ts')
      if (indexFile === entryFile) continue

      const entryImportPath = `./${basename(entryFile).replace(/\.ts$/, '.js')}`
      await writeFileInDir(
        logger,
        indexFile,
        serializeLeafIndex(leaf, entryImportPath)
      )
      written.add(indexFile)
    }

    // This command owns the leaf surface outright. An index it did not write is
    // one whose entry file is gone — a wiring the project stopped generating,
    // or a directory that was never a leaf — and left in place it keeps
    // `#pikku/<name>` resolving to a module that no longer compiles.
    const outDirEntries = existsSync(config.outDir)
      ? await readdir(config.outDir, { withFileTypes: true })
      : []
    for (const entry of outDirEntries) {
      if (!entry.isDirectory()) continue
      const indexFile = join(config.outDir, entry.name, 'index.ts')
      if (written.has(indexFile) || !existsSync(indexFile)) continue
      await rm(indexFile, { force: true })
    }

    // `console/pikku-node-types.gen.ts` held only `NodeCategory` and
    // `NodeRPCName`, which nothing derived from. A project generated before it
    // was dropped still has the file, and tsc compiles every file in the output
    // tree whether anything re-exports it or not.
    await rm(join(config.outDir, 'console', 'pikku-node-types.gen.ts'), {
      force: true,
    })

    // The re-export hub every leaf now replaces. A project generated before the
    // split still has it, and it would keep resolving `#pikku` while pulling in
    // every wiring's core dependencies.
    await rm(join(config.outDir, 'pikku-types.gen.ts'), { force: true })
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Creating leaf subpath entries',
      commandEnd: 'Created leaf subpath entries',
    }),
  ],
})
