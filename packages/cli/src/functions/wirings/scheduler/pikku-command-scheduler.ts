import { pikkuSessionlessFunc } from '../../../../.pikku/pikku-types.gen.js'
import { serializeFileImports } from '../../../utils/file-imports-serializer.js'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import {
  serializeSchedulerMetaTS,
  generateSchedulerRuntimeMeta,
} from './serialize-scheduler-meta.js'

export const pikkuScheduler: any = pikkuSessionlessFunc<
  void,
  boolean | undefined
>({
  func: async ({ logger, config, getInspectorState }) => {
    const visitState = await getInspectorState()
    const {
      schedulersWiringFile,
      schedulersWiringMetaFile,
      schedulersWiringMetaJsonFile,
      schedulersWiringMetaVerboseFile,
      schedulersWiringMetaVerboseJsonFile,
      packageMappings,
      schema,
    } = config
    const { scheduledTasks } = visitState

    const supportsImportAttributes = schema?.supportsImportAttributes ?? false
    const runtimeMeta = generateSchedulerRuntimeMeta(scheduledTasks.meta)

    // Write runtime JSON
    await writeFileInDir(
      logger,
      schedulersWiringMetaJsonFile,
      JSON.stringify(runtimeMeta, null, 2)
    )

    // Write runtime TS
    await writeFileInDir(
      logger,
      schedulersWiringMetaFile,
      serializeSchedulerMetaTS(
        scheduledTasks.meta,
        './pikku-schedulers-wirings-meta.gen.json',
        supportsImportAttributes
      )
    )

    // Write verbose JSON
    await writeFileInDir(
      logger,
      schedulersWiringMetaVerboseJsonFile,
      JSON.stringify(scheduledTasks.meta, null, 2)
    )

    // Write verbose TS
    const verboseImportStatement = supportsImportAttributes
      ? `import metaData from './pikku-schedulers-wirings-meta.verbose.gen.json' with { type: 'json' }`
      : `import metaData from './pikku-schedulers-wirings-meta.verbose.gen.json'`

    const verboseOutput: string[] = []
    verboseOutput.push("import { pikkuState } from '@pikku/core'")
    verboseOutput.push(
      "import { ScheduledTasksMeta } from '@pikku/core/scheduler'"
    )
    verboseOutput.push(verboseImportStatement)
    verboseOutput.push('')
    verboseOutput.push(
      "pikkuState('scheduler', 'meta', metaData as ScheduledTasksMeta)"
    )

    await writeFileInDir(
      logger,
      schedulersWiringMetaVerboseFile,
      verboseOutput.join('\n')
    )

    await writeFileInDir(
      logger,
      schedulersWiringFile,
      serializeFileImports(
        'addScheduledTasks',
        schedulersWiringFile,
        scheduledTasks.files,
        packageMappings
      )
    )

    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding Scheduled tasks',
      commandEnd: 'Found Scheduled tasks',
    }),
  ],
})
