import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type CommandRunner = (cwd: string, args: string[], env?: Record<string, string>) => Promise<{ code: number; output: string }>

export interface NextRoute {
  agent: 'changes' | 'intake' | 'knowledge' | 'upgrade' | null
  skill: string | null
  refs: string[]
  reason: string
  context: string | null
  merged: string[]
}

export interface ChangesReport {
  changes: Record<string, unknown>[]
  groups: Record<string, unknown>[]
}

const pikkuBin = (cwd: string): string[] => {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', '.bin', 'pikku')
    if (existsSync(bin)) return [bin]
    if (dirname(dir) === dir) return ['npx', '--no', 'pikku']
  }
}

export const runPikku: CommandRunner = (cwd, args, env = {}) =>
  new Promise((resolve) => {
    const [command, ...prefix] = pikkuBin(cwd)
    const child = spawn(command!, [...prefix, ...args], { cwd, env: { ...process.env, ...env, FORCE_COLOR: '0' } })
    let output = ''
    child.stdout.on('data', (chunk) => (output = (output + chunk).slice(-200000)))
    child.stderr.on('data', (chunk) => (output = (output + chunk).slice(-200000)))
    child.once('error', (error) => resolve({ code: 1, output: error.message }))
    child.once('close', (code) => resolve({ code: code ?? 1, output }))
  })

async function json<T>(cwd: string, args: string[], run: CommandRunner, env?: Record<string, string>): Promise<T> {
  const { code, output } = await run(cwd, [...args, '--json'], env)
  const line = output.trim().split('\n').findLast((l) => l.startsWith('{'))
  if (code !== 0 || !line) throw new Error(output.trim().split('\n').slice(-8).join('\n') || `pikku ${args[0]} failed (${code})`)
  return JSON.parse(line) as T
}

export const pikkuNext = (cwd: string, prompt?: string, run: CommandRunner = runPikku, env?: Record<string, string>) =>
  json<NextRoute>(cwd, prompt ? ['changes', 'next', '--prompt', prompt] : ['changes', 'next'], run, env)

export const changesReport = (cwd: string, run: CommandRunner = runPikku) =>
  json<ChangesReport>(cwd, ['changes', 'list', '--include-done'], run)

export const routeMessage = (route: NextRoute) =>
  [
    `You are the ${route.agent} agent for this project. Follow the ${route.skill} skill${route.refs.length ? `, and read ${route.refs.join(', ')} before you start` : ''}.`,
    '',
    route.context ?? '',
  ].join('\n')
