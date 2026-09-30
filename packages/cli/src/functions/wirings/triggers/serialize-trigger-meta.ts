import type {
  TriggerMeta,
  TriggerSourceMeta,
  WebhookSourcesMeta,
} from '@pikku/core/trigger'

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
  serializedOutput.push("import { pikkuState } from '@pikku/core/state'")
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

export const serializeTriggerSourceMeta = (sourceMeta: TriggerSourceMeta) => {
  return sourceMeta
}

export const serializeTriggerSourceMetaTS = (
  sourceMeta: TriggerSourceMeta,
  jsonImportPath: string,
  supportsImportAttributes: boolean
) => {
  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core/state'")
  serializedOutput.push(
    "import { TriggerSourceMeta } from '@pikku/core/trigger'"
  )
  serializedOutput.push(importStatement)
  serializedOutput.push('')
  serializedOutput.push(
    "pikkuState(null, 'trigger', 'sourceMeta', metaData as TriggerSourceMeta)"
  )
  return serializedOutput.join('\n')
}

export const serializeWebhookSourceMetaTS = (
  meta: WebhookSourcesMeta,
  jsonImportPath: string,
  supportsImportAttributes: boolean
) => {
  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  const names = Object.keys(meta)
  return [
    "import { pikkuState } from '@pikku/core/state'",
    "import { WebhookSourcesMeta } from '@pikku/core/trigger'",
    importStatement,
    '',
    "pikkuState(null, 'trigger', 'webhookSourceMeta', metaData as WebhookSourcesMeta)",
    '',
    ...(names.length > 0
      ? [`export type WebhookSourceNames = '${names.join("' | '")}'`]
      : []),
  ].join('\n')
}
