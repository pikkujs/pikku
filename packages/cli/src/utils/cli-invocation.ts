import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export type CliInvocation = { command: string; args: string[] }

/**
 * How to start this same CLI again. A `bun build --compile` binary embeds its
 * script under a virtual `$bunfs` (`B:/~BUN` on Windows) root, and its
 * `execPath` is the pikku binary itself, so it is started directly. Otherwise
 * the runtime runs the CLI's own bin, resolved relative to this module.
 */
export const resolveCliInvocation = ({
  execPath,
  execArgv,
  moduleUrl,
  argv1,
  exists,
}: {
  execPath: string
  execArgv: string[]
  moduleUrl: string
  argv1: string | undefined
  exists: (path: string) => boolean
}): CliInvocation => {
  if (moduleUrl.includes('$bunfs') || moduleUrl.includes('~BUN')) {
    return { command: execPath, args: [] }
  }
  const bin = fileURLToPath(new URL('../../bin/pikku.js', moduleUrl))
  const script = exists(bin) ? bin : argv1
  return { command: execPath, args: script ? [...execArgv, script] : [] }
}

export const currentCliInvocation = (): CliInvocation =>
  resolveCliInvocation({
    execPath: process.execPath,
    execArgv: process.execArgv,
    moduleUrl: import.meta.url,
    argv1: process.argv[1],
    exists: existsSync,
  })
