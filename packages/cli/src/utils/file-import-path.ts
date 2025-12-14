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

  const posixPath = filePath.replace(/\\/g, '/')

  if (posixPath.includes('node_modules/')) {
    const nodeModulesIndex = posixPath.indexOf('node_modules/')
    filePath = posixPath.substring(nodeModulesIndex + 'node_modules/'.length)

    if (filePath.startsWith('@types/')) {
      filePath = filePath.substring('@types/'.length)
      const parts = filePath.split('/')
      if (parts[0].includes('__')) {
        const [scope, name] = parts[0].split('__')
        parts[0] = `@${scope}/${name}`
        filePath = parts.join('/')
      }
    }

    if (filePath.endsWith('.d.ts')) {
      filePath = filePath.slice(0, -5)
    } else if (filePath.endsWith('.ts')) {
      filePath = filePath.slice(0, -3) + '.js'
    }

    filePath = filePath.replace(/\/index$/, '').replace(/\/index\.js$/, '')
    return filePath
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
