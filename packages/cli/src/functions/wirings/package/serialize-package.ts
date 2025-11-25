import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface PackageFactoryInfo {
  file: string
  variable: string
}

export const serializePackageFactories = (
  outputPath: string,
  packageName: string,
  configFactory: PackageFactoryInfo | undefined,
  singletonServicesFactory: PackageFactoryInfo | undefined,
  wireServicesFactory: PackageFactoryInfo | undefined,
  packageMappings: Record<string, string> = {}
) => {
  const imports: string[] = [
    `import { addPackageServiceFactories } from '@pikku/core'`,
  ]

  const factoryEntries: string[] = []

  if (configFactory) {
    const filePath = getFileImportRelativePath(
      outputPath,
      configFactory.file,
      packageMappings
    )
    imports.push(
      `import { ${configFactory.variable} as createConfig } from '${filePath}'`
    )
    factoryEntries.push(`  createConfig,`)
  }

  if (singletonServicesFactory) {
    const filePath = getFileImportRelativePath(
      outputPath,
      singletonServicesFactory.file,
      packageMappings
    )
    imports.push(
      `import { ${singletonServicesFactory.variable} as createSingletonServices } from '${filePath}'`
    )
    factoryEntries.push(`  createSingletonServices,`)
  }

  if (wireServicesFactory) {
    const filePath = getFileImportRelativePath(
      outputPath,
      wireServicesFactory.file,
      packageMappings
    )
    imports.push(
      `import { ${wireServicesFactory.variable} as createWireServices } from '${filePath}'`
    )
    factoryEntries.push(`  createWireServices,`)
  }

  // Only generate if at least one factory is defined
  if (factoryEntries.length === 0) {
    return null
  }

  return `${imports.join('\n')}

addPackageServiceFactories('${packageName}', {
${factoryEntries.join('\n')}
})
`
}
