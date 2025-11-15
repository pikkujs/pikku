import { ScheduledTasksMeta } from '@pikku/core/scheduler'

export const serializeSchedulerMeta = (
  scheduledTasksMeta: ScheduledTasksMeta
) => {
  return scheduledTasksMeta
}

export const generateSchedulerRuntimeMeta = (
  scheduledTasksMeta: ScheduledTasksMeta
) => {
  const runtimeMeta: any = {}

  for (const [taskName, taskMeta] of Object.entries(scheduledTasksMeta)) {
    const { summary, description, errors, ...runtime } = taskMeta as any
    runtimeMeta[taskName] = runtime
  }

  return runtimeMeta
}

export const serializeSchedulerMetaTS = (
  scheduledTasksMeta: ScheduledTasksMeta,
  jsonImportPath: string,
  supportsImportAttributes: boolean = false
) => {
  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    "import { ScheduledTasksMeta } from '@pikku/core/scheduler'"
  )
  serializedOutput.push(importStatement)
  serializedOutput.push('')
  serializedOutput.push(
    "pikkuState('scheduler', 'meta', metaData as ScheduledTasksMeta)"
  )
  serializedOutput.push('')

  const scheduledTasksMetaValues = Object.values(scheduledTasksMeta)
  if (scheduledTasksMetaValues.length > 0) {
    serializedOutput.push(
      `export type ScheduledTaskNames = '${scheduledTasksMetaValues.map((s) => s.name).join("' | '")}'`
    )
  }
  return serializedOutput.join('\n')
}
