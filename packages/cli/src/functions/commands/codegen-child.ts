import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type CodegenChildOptions = {
  command: string[]
  config?: string
  outDir?: string
  logLevel?: string
  output?: string
  security?: boolean
  inheritStdout: boolean
}

export const codegenStateFile = (): string =>
  join(tmpdir(), `pikku-state-${randomBytes(8).toString('hex')}.json`)

export const runCodegenChild = (
  stateFile: string,
  options: CodegenChildOptions
): Promise<void> => {
  const args = [
    ...process.execArgv,
    process.argv[1]!,
    ...options.command,
    `--stateOutput=${stateFile}`,
  ]
  if (options.config) args.push(`--config=${options.config}`)
  if (options.outDir) args.push(`--outDir=${options.outDir}`)
  if (options.logLevel) args.push(`--logLevel=${options.logLevel}`)
  if (options.output) args.push(`--output=${options.output}`)
  if (options.security) args.push('--security')

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      stdio: [
        'ignore',
        options.inheritStdout ? 'inherit' : 'ignore',
        'inherit',
      ],
      env: { ...process.env, PIKKU_NO_LOGO: '1' },
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else
        reject(
          new Error(
            `pikku ${options.command.join(' ')} failed (${signal ?? `exit ${code}`})`
          )
        )
    })
  })
}

export const hasChangesSince = (
  directories: string[],
  since: number
): boolean => {
  const visit = (dir: string): boolean => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return false
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.git')) {
        continue
      }
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (visit(path)) return true
        continue
      }
      if (/\.gen\.tsx?$/.test(entry.name)) continue
      try {
        if (statSync(path).mtimeMs > since) return true
      } catch {}
    }
    return false
  }
  return directories.some(visit)
}
