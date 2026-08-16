import { join } from 'path'
import { getFileImportRelativePath } from './file-import-path.js'

/**
 * The import path a generated file uses to reach one wiring's leaf.
 *
 * Scaffolds used to reach `pikku-types.gen.ts`, which re-exported every leaf —
 * so a project with one scaffold pulled every wiring's core dependencies into
 * its module graph whether it wired them or not. Naming the leaf keeps a
 * scaffold's imports to the wirings it actually uses.
 *
 * Relative rather than `#pikku/<leaf>`: a scaffold can be written into a
 * different package to the one that declares the alias, and `#` specifiers are
 * private to the package that declares them.
 */
export const getLeafImportPath = (
  from: string,
  leaf: string,
  config: { outDir: string; packageMappings: Record<string, string> }
) =>
  getFileImportRelativePath(
    from,
    join(config.outDir, leaf, 'index.ts'),
    config.packageMappings
  )
