import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { transform } from 'esbuild'

const roots = process.argv.slice(2)

if (roots.length === 0) {
  throw new Error('expected at least one root directory')
}

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    files.push(fullPath)
  }

  return files
}

const collectTargets = async (inputPath: string): Promise<string[]> => {
  const absolutePath = path.resolve(inputPath)
  const targetStat = await stat(absolutePath)

  if (targetStat.isDirectory()) {
    return await walk(absolutePath)
  }

  if (targetStat.isFile()) {
    return [absolutePath]
  }

  return []
}

const main = async () => {
  for (const root of roots) {
    const tsFiles = (await collectTargets(root)).filter((file) => {
      return (
        (file.endsWith('.ts') || file.endsWith('.tsx')) &&
        !file.endsWith('.d.ts') &&
        !file.endsWith('.js') &&
        !file.endsWith('.jsx')
      )
    })

    for (const tsFile of tsFiles) {
      const jsFile = tsFile.replace(/\.tsx?$/, '.js')
      const source = await readFile(tsFile, 'utf8')
      const result = await transform(source, {
        format: 'esm',
        target: 'es2022',
        jsx: 'automatic',
        loader: tsFile.endsWith('.tsx') ? 'tsx' : 'ts',
        sourcefile: path.basename(tsFile),
      })

      await writeFile(jsFile, result.code)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
