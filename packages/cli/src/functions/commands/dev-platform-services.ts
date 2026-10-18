import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadUserModule } from './load-user-project.js'

export const mergeDevPlatformServices = async <T extends Record<string, any>>(
  localServices: T,
  rootDir: string,
  devPlatformServicesFile: string,
  env: Record<string, string | undefined> = process.env
): Promise<T & Record<string, any>> => {
  if (env.NODE_ENV === 'production') return localServices
  const tsPath = resolve(rootDir, devPlatformServicesFile)
  const path = [tsPath, tsPath.replace(/\.ts$/, '.js')].find((candidate) =>
    existsSync(candidate)
  )
  if (!path) return localServices
  const { createPlatformServices } = await loadUserModule(path)
  return { ...localServices, ...(await createPlatformServices(env)) }
}
