import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, sep } from 'node:path'
import { PikkuError } from '@pikku/core/errors'
import type { CiRun } from './schemas.js'

export class PikkuCiFailedError extends PikkuError {}

const SKIPPED_DIRS = new Set(['node_modules', '.pikku', 'dist'])
const DECLARES_SCOPE = /declareScopes\s*\(\s*\[[^\]]*['"]pikku:console['"]/
const CONSOLE_ADDON = '@pikku/addon-console'

const tsFiles = (dir: string, skip = SKIPPED_DIRS): string[] => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory())
      return skip.has(entry.name) ? [] : tsFiles(path, skip)
    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const appSource = ({ srcDirectories, scaffoldDir }: CiRun) =>
  srcDirectories
    .flatMap((dir) => tsFiles(dir))
    .filter(
      (file) =>
        !file.includes(`${sep}scaffold${sep}`) &&
        relative(scaffoldDir, file).startsWith('..')
    )
    .map((file) => readFileSync(file, 'utf-8'))

/** A grant of pikku:console needs a declaration that survives the removal. */
const assertConsoleScopeDeclared = (run: CiRun) => {
  const source = appSource(run)
  if (!source.some((text) => text.includes('pikku:console'))) return
  const declared = source.some(
    (text) => DECLARES_SCOPE.test(text) || text.includes(CONSOLE_ADDON)
  )
  if (declared) return
  throw new PikkuCiFailedError(
    "A role grants pikku:console but nothing in the app declares it. Add `import { declareScopes } from '@pikku/core/scope'` and `declareScopes(['pikku:console'])` to your scopes file (roles stay as they are): the console scaffold is removed from deployed bundles, so the scope cannot come from it."
  )
}

/**
 * The deployed app has no console. Only `scaffold/console` goes, not every
 * generated scaffold file: `auth-secrets.gen.ts` beside it is still imported.
 */
export const removeConsoleScaffold = (run: CiRun) => {
  assertConsoleScopeDeclared(run)
  const config = JSON.parse(readFileSync(run.configFile, 'utf-8'))
  config.scaffold = { ...config.scaffold, console: false }
  writeFileSync(run.configFile, `${JSON.stringify(config, null, 2)}\n`)
  rmSync(join(run.scaffoldDir, 'console'), { recursive: true, force: true })
}

export const assertConsoleRemoved = ({ scaffoldDir, outDir, dir }: CiRun) => {
  const leftovers = [
    ...tsFiles(scaffoldDir),
    ...tsFiles(outDir, new Set()),
  ].filter((file) => readFileSync(file, 'utf-8').includes(CONSOLE_ADDON))
  if (leftovers.length === 0) return
  throw new PikkuCiFailedError(
    `scaffold.console is disabled but the console addon is still wired, so ${CONSOLE_ADDON} would be bundled into every unit:\n${leftovers
      .map((file) => `  ${relative(dir, file)}`)
      .join('\n')}`
  )
}
