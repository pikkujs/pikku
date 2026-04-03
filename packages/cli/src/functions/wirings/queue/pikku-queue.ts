import { pikkuSessionlessFunc } from '#pikku'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeQueueMeta,
  serializeQueueMetaTS,
} from './serialize-queue-meta.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

/**
 * Generates wireQueueWorker() + addFunction() calls for synthetic queue
 * workers (workflow orchestrators and step workers).
 */
function serializeSyntheticQueueWorkers(meta: Record<string, any>): string {
  const lines: string[] = []
  const imports = new Map<string, Set<string>>()
  let hasSynthetic = false
  let hasSleeper = false

  for (const queueMeta of Object.values(meta)) {
    if (!queueMeta.synthetic || !queueMeta.syntheticSource) continue
    hasSynthetic = true

    const src = queueMeta.syntheticSource
    if (!imports.has(src.importPath)) {
      imports.set(src.importPath, new Set())
    }
    imports.get(src.importPath)!.add(src.funcName)

    // If we have workflow workers, we also need the sleeper
    if (src.funcName === 'pikkuWorkflowOrchestratorFunc') {
      hasSleeper = true
      imports.get(src.importPath)!.add('pikkuWorkflowSleeperFunc')
    }
  }

  if (!hasSynthetic) return ''

  lines.push('')
  lines.push('/* Auto-generated wireQueueWorker calls for workflow queues */')
  lines.push("import { wireQueueWorker } from '@pikku/core/queue'")
  lines.push("import { addFunction } from '@pikku/core'")

  for (const [pkgPath, names] of imports) {
    lines.push(`import { ${[...names].join(', ')} } from '${pkgPath}'`)
  }
  lines.push('')

  for (const queueMeta of Object.values(meta)) {
    if (!queueMeta.synthetic || !queueMeta.syntheticSource) continue

    const src = queueMeta.syntheticSource
    lines.push(
      `addFunction('${queueMeta.pikkuFuncId}', { func: ${src.funcName} })`
    )
    lines.push(
      `wireQueueWorker({ name: '${queueMeta.name}', func: { func: ${src.funcName} } as any })`
    )
  }

  if (hasSleeper) {
    lines.push('')
    lines.push(
      `addFunction('pikkuWorkflowSleeper', { func: pikkuWorkflowSleeperFunc })`
    )
  }

  return lines.join('\n')
}

export const pikkuQueue = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      queueWorkersWiringFile,
      queueWorkersWiringMetaFile,
      queueWorkersWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config
    const { queueWorkers } = visitState

    if (
      queueWorkers.files.size === 0 ||
      Object.keys(queueWorkers.meta).length === 0
    ) {
      return false
    }

    // Write JSON file
    await writeFileInDir(
      logger,
      queueWorkersWiringMetaJsonFile,
      JSON.stringify(serializeQueueMeta(queueWorkers.meta), null, 2)
    )

    // Calculate relative path from TS file to JSON file
    const jsonImportPath = getFileImportRelativePath(
      queueWorkersWiringMetaFile,
      queueWorkersWiringMetaJsonFile,
      packageMappings
    )

    // Write TypeScript file that imports JSON
    await writeFileInDir(
      logger,
      queueWorkersWiringMetaFile,
      serializeQueueMetaTS(
        jsonImportPath,
        schema?.supportsImportAttributes ?? false
      )
    )

    const userFileImports = serializeFileImports(
      'addQueueWorkers',
      queueWorkersWiringFile,
      queueWorkers.files,
      packageMappings
    )
    const syntheticWorkers = serializeSyntheticQueueWorkers(queueWorkers.meta)

    await writeFileInDir(
      logger,
      queueWorkersWiringFile,
      userFileImports + syntheticWorkers
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding queues',
      commandEnd: 'Found queue',
    }),
  ],
})
