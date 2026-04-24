import { getFileImportRelativePath } from './file-import-path.js'

export const serializeFileImports = (
  importType: string,
  outputPath: string,
  files: Set<string>,
  packageMappings: Record<string, string> = {}
) => {
  const serializedOutput: string[] = [
    `/* The files with an ${importType} function call */`,
  ]

  Array.from(files)
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
