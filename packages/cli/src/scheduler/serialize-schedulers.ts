import { ScheduledTasksMeta } from '@pikku/core/scheduler'
import { getFileImportRelativePath } from '../utils.js'

export const serializeSchedulers = (
  outputPath: string,
  filesWithScheduledTasks: Set<string>,
  packageMappings: Record<string, string> = {}
) => {
  const serializedOutput: string[] = [
    '/* The files with an addSerializedTasks function call */',
  ]

  Array.from(filesWithScheduledTasks)
    .sort()
    .forEach((path) => {
      const filePath = getFileImportRelativePath(
        outputPath,
        path,
        packageMappings
      )
      serializedOutput.push(`import '${filePath}'`)
    })

  return serializedOutput.join('\n')
}

export const serializeSchedulerMeta = (
  scheduledTasksMeta: ScheduledTasksMeta
) => {
  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    `pikkuState('scheduler', 'meta', ${JSON.stringify(scheduledTasksMeta, null, 2)})`
  )
  if (scheduledTasksMeta.length > 0) {
    serializedOutput.push(
      `export type ScheduledTaskNames = '${scheduledTasksMeta.map((s) => s.name).join("' | '")}'`
    )
  }
  return serializedOutput.join('\n')
}
