import path from 'node:path'
import { escapePath, glob } from 'tinyglobby'
import { CONFIG_FILE, SKIP_DIRS } from './project-packages.js'

/**
 * Patterns for what a project never inspects. `ignoreFiles` from the config
 * replaces the loader's defaults, so these are added on top of it rather than
 * left to it: a user's `ignoreFiles` must not make a project walk into its
 * `node_modules` or into the package next door.
 */
const skippedPatterns = (): string[] => [
  ...[...SKIP_DIRS].map((name) => `**/${name}/**`),
  '**/.*/**',
]

/**
 * Every file matching `pattern` (`.ts` files by default) under each of `sourceDirs`, as absolute paths, leaving out
 * what a project never inspects: dependencies, build output, its generated
 * tree, and any directory that holds its own pikku.config.json.
 *
 * The directory goes in `cwd`, never into the pattern: a path is not a glob.
 * On Windows every separator is a backslash, which a glob reads as an escape,
 * so a pattern built from the path matched nothing at all there.
 */
export const findSourceFiles = async (
  rootDir: string,
  sourceDirs: string[],
  ignoreFiles: string[],
  pattern = '**/*.ts'
): Promise<string[]> =>
  (
    await Promise.all(
      sourceDirs.map(async (dir) => {
        const cwd = path.join(rootDir, dir)
        const skipped = skippedPatterns()
        const nested = (
          await glob(`**/${CONFIG_FILE}`, { cwd, ignore: skipped })
        )
          .map((file) => path.posix.dirname(file.split(path.sep).join('/')))
          .filter((nestedDir) => nestedDir !== '.')
          .map((nestedDir) => `${escapePath(nestedDir)}/**`)
        return glob(pattern, {
          cwd,
          ignore: [...ignoreFiles, ...skipped, ...nested],
          absolute: true,
        })
      })
    )
  ).flat()
