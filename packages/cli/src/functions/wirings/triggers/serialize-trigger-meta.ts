import { TriggerMeta } from '@pikku/core/trigger'

export const serializeTriggerMeta = (triggerMeta: TriggerMeta) => {
  return triggerMeta
}

export const serializeTriggerMetaTS = (
  triggerMeta: TriggerMeta,
  jsonImportPath: string,
  supportsImportAttributes: boolean
) => {
  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push("import { TriggerMeta } from '@pikku/core/trigger'")
  serializedOutput.push(importStatement)
  serializedOutput.push('')
  serializedOutput.push(
    "pikkuState(null, 'trigger', 'meta', metaData as TriggerMeta)"
  )
  serializedOutput.push('')

  const triggerMetaValues = Object.values(triggerMeta)
  if (triggerMetaValues.length > 0) {
    serializedOutput.push(
      `export type TriggerNames = '${triggerMetaValues.map((t) => t.name).join("' | '")}'`
    )
  }
  return serializedOutput.join('\n')
}
