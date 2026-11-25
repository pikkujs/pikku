import chalk from 'chalk'
import { spawnSync, type StdioOptions } from 'child_process'
import { writeFileSync } from 'fs'
import path from 'path'
import { preparePackageJsonForYarnLink } from './utils.js'

/** A step the scaffold needs did not succeed; the message is for the user. */
export class SetupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SetupError'
  }
}

export type RunCommand = (
  command: string,
  args: string[],
  options: { cwd?: string; stdio: StdioOptions }
) => { status: number | null; signal?: string | null; error?: Error }

export function runStep(
  command: string,
  args: string[],
  cwd: string,
  consequence: string,
  run: RunCommand = spawnSync
): void {
  const { status, signal, error } = run(command, args, {
    cwd,
    stdio: 'inherit',
  })
  if (!error && status === 0) return

  const step = [command, ...args].join(' ')
  const reason = error
    ? `could not be run: ${error.message}`
    : signal
      ? `was stopped by ${signal}`
      : `failed with exit code ${status}`
  throw new SetupError(`\`${step}\` ${reason} in ${cwd}. ${consequence}`)
}

export function assertBunAvailable(run: RunCommand = spawnSync): void {
  const { status, error } = run('bun', ['--version'], { stdio: 'ignore' })
  if (error || status !== 0) {
    throw new SetupError(
      'The starter template uses Bun, and `bun` could not be run. Install it from https://bun.sh and run this again, or pass --skip-install to only create the files.'
    )
  }
}

/** The starter is a Bun workspace, so any other package manager is refused. */
export function starterPackageManager({
  packageManager,
  yarnLink,
}: {
  packageManager?: string
  yarnLink?: string
}): 'bun' {
  if (packageManager && packageManager !== 'bun') {
    throw new SetupError(
      `The starter template uses Bun, so --package-manager ${packageManager} is not supported. Omit --package-manager (or pass bun), or choose another --template.`
    )
  }
  if (yarnLink) {
    throw new SetupError(
      'The starter template uses Bun, so --yarn-link is not supported. Omit --yarn-link, or choose another --template.'
    )
  }
  return 'bun'
}

/** The starter's first run: its database is created before the dev server. */
export function starterNextSteps(name: string, installed: boolean): string[] {
  return [
    `cd ${name}`,
    ...(installed ? [] : ['bun install', 'bunx --bun pikku all']),
    'bunx --bun pikku db generate',
    'bunx --bun pikku db migrate',
    'bun run dev',
  ]
}

export type InstallOptions = {
  template: string
  packageManager: string
  install: boolean
  yarnLink?: string
}

export async function installDependencies(
  targetPath: string,
  { packageManager, install, yarnLink, template }: InstallOptions,
  run: RunCommand = spawnSync
) {
  if (!install) return

  const step = (command: string, args: string[]) =>
    runStep(
      command,
      args,
      targetPath,
      'Project setup is not complete. The project files were created; fix the error above, then finish the setup in that directory.',
      run
    )

  if (yarnLink) {
    writeFileSync(
      path.join(targetPath, '.yarnrc.yml'),
      [
        'compressionLevel: mixed',
        'enableGlobalCache: false',
        'nodeLinker: node-modules',
      ].join('\n')
    )
    // Remove version constraints from @pikku/* packages to prevent yarn
    // from trying to fetch unreleased versions from npm
    preparePackageJsonForYarnLink(targetPath)
  }

  console.log(chalk.blue('📦 Installing dependencies...'))
  const installArgs = ['install']
  if (packageManager === 'yarn') {
    installArgs.push('--no-immutable')
  }
  step(packageManager, installArgs)

  if (yarnLink) {
    if (packageManager !== 'yarn') {
      throw new SetupError(
        '⚠️ Yarn link is only supported with yarn package manager'
      )
    }
    console.log(chalk.blue('🔗 Linking to Pikku'))
    // Resolve to absolute path from current working directory
    const absoluteYarnLinkPath = path.resolve(yarnLink)
    step('yarn', ['link', '--all', '--private', absoluteYarnLinkPath])
  }

  console.log(chalk.blue('🦎 Running pikku...'))
  // The starter has no `pikku` script. `--bun` runs the CLI on Bun despite its
  // node shebang, and `--no-install` keeps bunx from fetching a registry
  // package called `pikku` when the project's own CLI is missing.
  const codegen: [string, string[]] =
    template === 'starter-template'
      ? ['bun', ['x', '--bun', '--no-install', 'pikku', '--silent']]
      : [packageManager, ['pikku', '--silent']]
  step(...codegen)

  if (template === 'cli') {
    console.log(
      chalk.blue('🚀 Running pikku again to setup up the remote channel.')
    )
    step(...codegen)
  }
}
