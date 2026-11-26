import { mkdir, mkdtemp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const tmp = join(dirname(fileURLToPath(import.meta.url)), '../../.tmp')

/** A new directory under the package's own git-ignored `.tmp/`. */
export const crudTempDir = async (prefix: string): Promise<string> => {
  await mkdir(tmp, { recursive: true })
  return mkdtemp(join(tmp, prefix))
}
