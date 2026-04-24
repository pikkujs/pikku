import { getFileImportRelativePath } from '../../../utils/file-import-path.js'

export interface PackageFactoryInfo {
  file: string
  variable: string
}

export interface CredentialMetaForPackage {
  name: string
  displayName: string
  type: 'singleton' | 'wire'
  oauth2?: boolean
}

export const serializePackageFactories = (
  outputPath: string,
  packageName: string,
  configFactory: PackageFactoryInfo | undefined,
  singletonServicesFactory: PackageFactoryInfo | undefined,
  wireServicesFactory: PackageFactoryInfo | undefined,
  packageMappings: Record<string, string> = {},
  credentialsMeta?: Record<string, CredentialMetaForPackage>,
  requiredParentServices?: string[]
) => {
  const imports: string[] = [
    `import { pikkuState } from '@pikku/core/internal'`,
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

  const credentialsLine =
    credentialsMeta && Object.keys(credentialsMeta).length > 0
      ? `\npikkuState('${packageName}', 'package', 'credentialsMeta', ${JSON.stringify(credentialsMeta)})\n`
      : ''

  const requiredParentServicesLine =
    requiredParentServices && requiredParentServices.length > 0
      ? `\npikkuState('${packageName}', 'package', 'requiredParentServices', ${JSON.stringify(requiredParentServices)})\n`
      : ''

  return `${imports.join('\n')}

pikkuState('${packageName}', 'package', 'factories', {
${factoryEntries.join('\n')}
})
${credentialsLine}${requiredParentServicesLine}`
}
