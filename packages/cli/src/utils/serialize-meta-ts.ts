export function serializeMetaTS({
  jsonImportPath,
  supportsImportAttributes,
  pikkuStateNamespace,
  pikkuStateKey,
  metaTypeImport,
  metaTypeName,
}: {
  jsonImportPath: string
  supportsImportAttributes: boolean
  pikkuStateNamespace: string
  pikkuStateKey: string
  metaTypeImport: string
  metaTypeName: string
}): string {
  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(`import { ${metaTypeName} } from '${metaTypeImport}'`)
  serializedOutput.push(importStatement)
  serializedOutput.push('')
  serializedOutput.push(
    `pikkuState(null, '${pikkuStateNamespace}', '${pikkuStateKey}', metaData as ${metaTypeName})`
  )
  return serializedOutput.join('\n')
}
