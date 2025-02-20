import fs from 'fs'
import path from 'path'

export const lazymkdir = async (path: string) => {
  try {
    await fs.mkdirSync(path, { recursive: true })
  } catch {
    // Already exists so ignore
  }
}
/**
 * Moves files from srcDir into destDir, then deletes srcDir.
 */
export function mergeDirectories(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return

  fs.readdirSync(srcDir).forEach((file) => {
    const srcPath = path.join(srcDir, file)
    const destPath = path.join(destDir, file)

    if (fs.statSync(srcPath).isDirectory()) {
      lazymkdir(destPath)
      mergeDirectories(srcPath, destPath)
    } else {
      fs.renameSync(srcPath, destPath)
    }
  })

  fs.rmSync(srcDir, { recursive: true })
}

/**
 * Merges JSON files (package.json, pikku.config.json) by combining properties.
 */
export function mergeJsonFiles(targetPath: string, fileName: string): void {
  const filePath = path.join(targetPath, fileName)

  if (!fs.existsSync(filePath)) return

  let mergedData: Record<string, any> = {}

  // Read all JSON files in the target directory
  fs.readdirSync(targetPath)
    .filter((file) => file === fileName)
    .forEach((file) => {
      const fileContent = JSON.parse(
        fs.readFileSync(path.join(targetPath, file), 'utf-8')
      )
      mergedData = { ...mergedData, ...fileContent }
    })

  // Write merged JSON back
  fs.writeFileSync(filePath, JSON.stringify(mergedData, null, 2))
}

/**
 * Replaces all occurrences of '../functions' with './' in all project files.
 */
export function replaceFunctionReferences(targetPath: string): void {
  const replaceInFile = (filePath: string): void => {
    let content = fs.readFileSync(filePath, 'utf-8')
    const updatedContent = content
      .replaceAll('../../functions/src/', './')
      .replaceAll('../functions/src/', './')
      .replaceAll('../../functions/.pikku/', '../.pikku/')
    fs.writeFileSync(filePath, updatedContent)
  }

  const scanAndReplace = (dir: string): void => {
    fs.readdirSync(dir).forEach((file) => {
      const fullPath = path.join(dir, file)
      if (fs.statSync(fullPath).isDirectory()) {
        scanAndReplace(fullPath)
      } else {
        replaceInFile(fullPath)
      }
    })
  }

  scanAndReplace(targetPath)
}
