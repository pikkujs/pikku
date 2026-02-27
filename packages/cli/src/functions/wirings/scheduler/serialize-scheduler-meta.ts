import type { ScheduledTasksMeta } from '@pikku/core/scheduler'
import { serializeMetaTS } from '../../../utils/serialize-meta-ts.js'

export const serializeSchedulerMeta = (
  scheduledTasksMeta: ScheduledTasksMeta
) => {
  return scheduledTasksMeta
}

export const serializeSchedulerMetaTS = (
  scheduledTasksMeta: ScheduledTasksMeta,
  jsonImportPath: string,
  supportsImportAttributes: boolean
) => {
  const base = serializeMetaTS({
    jsonImportPath,
    supportsImportAttributes,
    pikkuStateNamespace: 'scheduler',
    pikkuStateKey: 'meta',
    metaTypeImport: '@pikku/core/scheduler',
    metaTypeName: 'ScheduledTasksMeta',
  })

  const scheduledTasksMetaValues = Object.values(scheduledTasksMeta)
  if (scheduledTasksMetaValues.length > 0) {
    return (
      base +
      '\n\n' +
      `export type ScheduledTaskNames = '${scheduledTasksMetaValues.map((s) => s.name).join("' | '")}'`
    )
  }
  return base
}
