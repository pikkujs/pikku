import { ScheduledTasksMeta } from '@pikku/core/scheduler'

export const serializeSchedulerMeta = (
  scheduledTasksMeta: ScheduledTasksMeta
) => {
  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    `pikkuState('scheduler', 'meta', ${JSON.stringify(scheduledTasksMeta, null, 2)})`
  )
  const scheduledTasksMetaValues = Object.values(scheduledTasksMeta)
  if (scheduledTasksMetaValues.length > 0) {
    serializedOutput.push(
      `export type ScheduledTaskNames = '${scheduledTasksMetaValues.map((s) => s.name).join("' | '")}'`
    )
  }
  return serializedOutput.join('\n')
}
