import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { delimiter, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LocalCli } from './types.js'

/** The built relink script next to this module (dist/src/runner/relink-bin.js). */
export const defaultRelinkScript = (): string | undefined => {
  const path = fileURLToPath(new URL('./relink-bin.js', import.meta.url))
  return existsSync(path) ? path : undefined
}

const findBun = (skip: string): string | undefined =>
  (process.env.PATH ?? '')
    .split(delimiter)
    .filter((p) => p && resolve(p) !== resolve(skip))
    .map((p) => join(p, 'bun'))
    .find((p) => {
      try {
        accessSync(p, constants.X_OK)
        return statSync(p).isFile()
      } catch {
        return false
      }
    })

/**
 * Writes the shims an agent's PATH starts with when worktrees use a local
 * CLI: `pikku` runs the local build, and `bun` runs the real bun and, after an
 * add, install, remove or update that succeeded, relinks @pikku/* to the local
 * build again (`bun add` puts the published copies back, and the agent's next
 * `pikku check` then fails in files it never touched). The bun shim is left
 * out when there is no bun on PATH or no built relink script. Resolves with
 * the directory.
 */
export const writeShims = async (
  dir: string,
  cli: LocalCli,
  options: { node?: string; relinkScript?: string } = {}
): Promise<string> => {
  const node = options.node ?? process.execPath
  await mkdir(dir, { recursive: true })
  const pikku = join(dir, 'pikku')
  await writeFile(
    pikku,
    `#!/bin/sh\nexec ${JSON.stringify(node)} ${JSON.stringify(cli.bin)} "$@"\n`
  )
  await chmod(pikku, 0o755)
  const bun = findBun(dir)
  const relink = options.relinkScript ?? defaultRelinkScript()
  if (!bun || !relink) return dir
  const file = join(dir, 'bun')
  await writeFile(
    file,
    [
      '#!/bin/sh',
      '# The real bun, then @pikku/* relinked to the local build after a change to node_modules.',
      `${JSON.stringify(bun)} "$@"`,
      'code=$?',
      'case "$1" in add|a|install|i|remove|rm|update|link|unlink)',
      '  if [ $code -eq 0 ] && top=$(git rev-parse --show-toplevel 2>/dev/null) && [ -d "$top/node_modules" ]; then',
      `    ${JSON.stringify(node)} ${JSON.stringify(relink)} "$top" ${JSON.stringify(cli.bin)} ${JSON.stringify(cli.checkout)} || echo "pikku changes run: relinking @pikku/* to the local build after bun $1 failed" >&2`,
      '  fi;;',
      'esac',
      'exit $code',
      '',
    ].join('\n')
  )
  await chmod(file, 0o755)
  return dir
}
