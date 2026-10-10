import { pikkuState } from '../../pikku-state.js'
import type { CLICommandMeta, CLIOption } from './cli.types.js'
import { registerCLICommands } from './cli-runner.js'

export type CLICommandMount = {
  program: string
  name: string
  meta: CLICommandMeta
  commands: Record<string, any>
  options?: Record<string, CLIOption>
  packageName?: string
}

export type CLIExtension = Omit<CLICommandMount, 'program'>

export type CLIMountHandle = {
  added: string[]
  unmount: () => string[]
}

const collectFuncIds = (meta: CLICommandMeta, into: Set<string>): void => {
  if (meta.pikkuFuncId) into.add(meta.pikkuFuncId)
  for (const sub of Object.values(meta.subcommands ?? {})) {
    collectFuncIds(sub, into)
  }
}

const stampPackage = (
  meta: CLICommandMeta,
  packageName: string
): CLICommandMeta => ({
  ...meta,
  packageName: meta.pikkuFuncId ? packageName : meta.packageName,
  subcommands: meta.subcommands
    ? Object.fromEntries(
        Object.entries(meta.subcommands).map(([name, sub]) => [
          name,
          stampPackage(sub, packageName),
        ])
      )
    : undefined,
})

const assertRegistered = (
  meta: CLICommandMeta,
  packageName: string,
  path: string[]
): void => {
  if (meta.pikkuFuncId) {
    const registered =
      pikkuState(packageName, 'function', 'functions').has(meta.pikkuFuncId) &&
      pikkuState(packageName, 'function', 'meta')[meta.pikkuFuncId]
    if (!registered) {
      throw new Error(
        `CLI command "${path.join(' ')}" uses function "${meta.pikkuFuncId}" which package "${packageName}" has not registered; import its generated bootstrap from the CLI entry`
      )
    }
  }
  for (const [name, sub] of Object.entries(meta.subcommands ?? {})) {
    assertRegistered(sub, packageName, [...path, name])
  }
}

export const mountCLICommands = ({
  program,
  name,
  meta,
  commands,
  options,
  packageName,
}: CLICommandMount): CLIMountHandle => {
  const programMeta = pikkuState(null, 'cli', 'meta').programs?.[program]
  if (!programMeta) {
    throw new Error(`CLI program "${program}" has no metadata to mount into`)
  }
  if (programMeta.commands[name]) {
    throw new Error(`CLI command "${name}" is already defined on "${program}"`)
  }
  if (packageName) assertRegistered(meta, packageName, [name])
  const funcIds = new Set<string>()
  collectFuncIds(meta, funcIds)
  const previousConfigs = new Map<string, any>()
  const owner = packageName ?? null
  const registered = pikkuState(owner, 'function', 'functions')
  for (const id of funcIds) {
    if (registered.has(id)) previousConfigs.set(id, registered.get(id))
  }
  const mounted = packageName ? stampPackage(meta, packageName) : meta
  programMeta.commands[name] = mounted
  registerCLICommands(
    { [name]: { subcommands: commands } },
    [],
    options ?? programMeta.options ?? {},
    program
  )
  let removed = false
  return {
    added: [name],
    unmount: () => {
      if (removed) return [name]
      removed = true
      if (programMeta.commands[name] === mounted) {
        delete programMeta.commands[name]
      }
      const state = pikkuState(null, 'cli', 'programs')[program]
      const owns = (id: string) => id === name || id.startsWith(`${name}.`)
      for (const table of [
        state?.commandOptions,
        state?.commandMiddleware,
        state?.renderers,
      ]) {
        if (!table) continue
        for (const id of Object.keys(table)) {
          if (owns(id)) delete table[id]
        }
      }
      if (state?.commandOptions && !Object.keys(state.commandOptions).length) {
        delete state.commandOptions
      }
      if (
        state?.commandMiddleware &&
        !Object.keys(state.commandMiddleware).length
      ) {
        delete state.commandMiddleware
      }
      for (const id of funcIds) {
        if (previousConfigs.has(id)) registered.set(id, previousConfigs.get(id))
        else registered.delete(id)
      }
      return [name]
    },
  }
}

export const mountCLIExtension = (
  program: string,
  extension: CLIExtension
): CLIMountHandle => mountCLICommands({ program, ...extension })
