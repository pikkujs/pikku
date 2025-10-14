import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { FunctionsMeta, FunctionsRuntimeMeta } from '@pikku/core'

export const serializeFunctionImports = (
  outputPath: string,
  functionsMap: Map<string, { path: string; exportedName: string }>,
  functionsMeta: FunctionsMeta,
  packageMappings: Record<string, string> = {}
) => {
  const serializedImports: string[] = [
    `/* Import and register functions used by RPCs */`,
    `import { addFunction } from '@pikku/core'`,
  ]

  const serializedRegistrations: string[] = []

  // Sort by function name for consistent output
  const sortedEntries = Array.from(functionsMap.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  for (const [name, { path, exportedName }] of sortedEntries) {
    const filePath = getFileImportRelativePath(
      outputPath,
      path,
      packageMappings
    )

    // pikkuFunc/pikkuSessionlessFunc/pikkuVoidFunc always return config objects
    // For directly exported functions, we can just import and register them
    if (name === exportedName) {
      serializedImports.push(`import { ${exportedName} } from '${filePath}'`)
      serializedRegistrations.push(`addFunction('${name}', ${exportedName})`)
    }
    // For renamed functions, we need to import and alias them
    else {
      serializedImports.push(
        `import { ${exportedName} as ${name} } from '${filePath}'`
      )
      serializedRegistrations.push(`addFunction('${name}', ${name})`)
    }
  }

  // Add a blank line between imports and registrations
  if (serializedImports.length > 0 && serializedRegistrations.length > 0) {
    serializedImports.push('')
  }

  // Combine the imports and registrations
  return [...serializedImports, ...serializedRegistrations].join('\n')
}

export const generateRuntimeMeta = (
  functions: FunctionsMeta
): FunctionsRuntimeMeta => {
  const runtimeMeta: FunctionsRuntimeMeta = {}

  for (const [
    key,
    { pikkuFuncName, inputSchemaName, outputSchemaName, expose },
  ] of Object.entries(functions)) {
    runtimeMeta[key] = {
      pikkuFuncName,
      inputSchemaName,
      outputSchemaName,
      expose,
    }
  }

  return runtimeMeta
}
