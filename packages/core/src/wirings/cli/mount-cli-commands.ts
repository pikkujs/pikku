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
}: CLICommandMount): void => {
  const programMeta = pikkuState(null, 'cli', 'meta').programs?.[program]
  if (!programMeta) {
    throw new Error(`CLI program "${program}" has no metadata to mount into`)
  }
  if (programMeta.commands[name]) {
    throw new Error(`CLI command "${name}" is already defined on "${program}"`)
  }
  if (packageName) assertRegistered(meta, packageName, [name])
  programMeta.commands[name] = packageName
    ? stampPackage(meta, packageName)
    : meta
  registerCLICommands(
    { [name]: { subcommands: commands } },
    [],
    options ?? programMeta.options ?? {},
    program
  )
}

export const mountCLIExtension = (
  program: string,
  extension: CLIExtension
): void => mountCLICommands({ program, ...extension })
