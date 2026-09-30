import path from 'node:path'
import { glob } from 'tinyglobby'

/**
 * Every `.ts` file under each of `srcDirectories`, as absolute paths.
 *
 * The directory goes in `cwd`, never into the pattern: a path is not a glob.
 * On Windows every separator is a backslash, which a glob reads as an escape,
 * so a pattern built from the path matched nothing at all there.
 */
export const findSourceFiles = async (
  rootDir: string,
  srcDirectories: string[],
  ignoreFiles: string[]
): Promise<string[]> =>
  (
    await Promise.all(
      srcDirectories.map((dir) =>
        glob('**/*.ts', {
          cwd: path.join(rootDir, dir),
          ignore: ignoreFiles,
          absolute: true,
        })
      )
    )
  ).flat()
