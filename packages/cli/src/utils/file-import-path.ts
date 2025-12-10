import { relative, dirname, resolve } from 'path'

export const getFileImportRelativePath = (
  from: string,
  to: string,
  packageMappings: Record<string, string>
): string => {
  let filePath = relative(dirname(from), to)
  if (!/^\.+\//.test(filePath)) {
    filePath = `./${filePath}`
  }

  // If the path includes node_modules, strip everything before and including node_modules/
  if (filePath.includes('node_modules')) {
    const nodeModulesIndex = filePath.indexOf('node_modules/')
    if (nodeModulesIndex !== -1) {
      filePath = filePath.substring(nodeModulesIndex + 'node_modules/'.length)
    }
    // For @types packages, strip @types/ prefix since TypeScript resolves them automatically
    if (filePath.startsWith('@types/')) {
      filePath = filePath.substring('@types/'.length)
    }
    return filePath.replace('.ts', '.js')
  }

  const absolutePath = resolve(dirname(from), to)
  const fromAbsolutePath = resolve(dirname(from))

  // Check if both files are in the same package directory
  // If so, skip packageMappings to use relative paths
  let inSamePackage = false
  for (const [path] of Object.entries(packageMappings)) {
    if (absolutePath.includes(path) && fromAbsolutePath.includes(path)) {
      inSamePackage = true
      break
    }
  }

  // Only apply packageMappings if files are not in the same package
  if (!inSamePackage) {
    // let usesPackageName = false
    for (const [path, packageName] of Object.entries(packageMappings)) {
      if (absolutePath.includes(path)) {
        // usesPackageName = true
        // Use string slicing instead of regex to avoid ReDoS and ensure correct behavior
        const pathIndex = absolutePath.indexOf(path)
        filePath = packageName + absolutePath.slice(pathIndex + path.length)
        break
      }
    }
  }

  // if (usesPackageName) {
  //   return filePath.replace('.ts', '')
  // }
  return filePath.replace('.ts', '.js')
}
