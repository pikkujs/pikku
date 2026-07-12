import { existsSync } from 'fs'
import { dirname, join } from 'path'

export const createNestedProjectFilter = (rootDir: string) => {
  const cache = new Map<string, boolean>()
  return (fileName: string): boolean => {
    const pending: string[] = []
    let dir = dirname(fileName)
    let nested = false
    while (dir.startsWith(rootDir) && dir !== rootDir) {
      const cached = cache.get(dir)
      if (cached !== undefined) {
        nested = cached
        break
      }
      pending.push(dir)
      if (existsSync(join(dir, 'pikku.config.json'))) {
        nested = true
        break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    for (const d of pending) cache.set(d, nested)
    return nested
  }
}
