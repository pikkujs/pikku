import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import type { InspectorMiddlewareState } from '@pikku/inspector'

export const serializeMiddlewareImports = (
  outputPath: string,
  middlewareState: InspectorMiddlewareState,
  packageMappings: Record<string, string> = {}
) => {
  const serializedImports: string[] = [
    `/* Import and register middleware functions */`,
    `import { registerMiddleware } from '@pikku/core'`,
  ]

  const serializedRegistrations: string[] = []

  // Filter out inline middleware (those with exportedName === null)
  // and sort by pikkuFuncName for consistent output
  const exportableMiddleware = Object.entries(middlewareState.meta)
    .filter(([, meta]) => meta.exportedName !== null)
    .sort((a, b) => a[0].localeCompare(b[0]))

  for (const [pikkuFuncName, meta] of exportableMiddleware) {
    const { sourceFile, exportedName } = meta

    // exportedName is guaranteed to be non-null due to filter above
    const filePath = getFileImportRelativePath(
      outputPath,
      sourceFile,
      packageMappings
    )

    // pikkuMiddleware always returns config objects
    // For directly exported middleware, we can just import and register them
    if (pikkuFuncName === exportedName) {
      serializedImports.push(`import { ${exportedName} } from '${filePath}'`)
      serializedRegistrations.push(
        `registerMiddleware('${pikkuFuncName}', ${exportedName})`
      )
    }
    // For renamed middleware, we need to import and alias them
    else {
      serializedImports.push(
        `import { ${exportedName} as ${pikkuFuncName} } from '${filePath}'`
      )
      serializedRegistrations.push(
        `registerMiddleware('${pikkuFuncName}', ${pikkuFuncName})`
      )
    }
  }

  // Add a blank line between imports and registrations
  if (serializedImports.length > 0 && serializedRegistrations.length > 0) {
    serializedImports.push('')
  }

  // Combine the imports and registrations
  return [...serializedImports, ...serializedRegistrations].join('\n')
}
