import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { glob } from 'tinyglobby'

// A pikkuBetterAuth(...) call. Used as a cheap, AST-free signal during bootstrap
// (when the inspector hasn't run yet) to decide whether to pre-write the
// auth.types.ts stub + hub re-export. The full inspect does the authoritative
// detection later; a false negative just falls back to the old behaviour.
const PIKKU_BETTER_AUTH_CALL = /\bpikkuBetterAuth\s*\(/

/**
 * Cheaply scan the project source for a `pikkuBetterAuth(...)` call without
 * runtime-importing any user file (which would deadlock during bootstrap, since
 * those files import the not-yet-written `#pikku` hub). Returns true on the
 * first match.
 */
export async function projectDeclaresBetterAuth(
  rootDir: string,
  srcDirectories: string[],
  ignoreFiles: string[] = []
): Promise<boolean> {
  const files = (
    await Promise.all(
      srcDirectories.map((dir) =>
        glob(`${path.join(rootDir, dir)}/**/*.ts`, {
          ignore: ignoreFiles,
          absolute: true,
        })
      )
    )
  ).flat()

  for (const file of files) {
    if (file.includes('/.pikku/')) continue
    // An unreadable file (race/permission) just can't match — treat as empty.
    const content = await readFile(file, 'utf-8').catch(() => '')
    if (PIKKU_BETTER_AUTH_CALL.test(content)) return true
  }
  return false
}
