import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { isDependencyFile } from '../lib/migration-files.js'
import { otherCli, relinkPikku } from './relink.js'
import type { LocalCli, RunnerCommands } from './types.js'

/** How a checkout is set up and checked, and how its @pikku packages are pointed at a local CLI. */
export interface CheckoutSetup {
  commands: RunnerCommands
  localCli?: LocalCli
  /** Replaces the default setup; '' is none. */
  setupCommand?: string
  /** Default `pikku check`; '' is none. */
  checkCommand?: string
  node?: string
  relink?: (cwd: string, cli: LocalCli) => void
}

const READY = 'pikku-worktree-ready'

/** Where a checkout keeps its own git state (a worktree's `.git` is a file naming it): the ready marker lives there, never in the tree. */
export const gitDirOf = async (cwd: string): Promise<string> => {
  const found = (
    await readFile(join(cwd, '.git'), 'utf8').catch(() => '')
  ).match(/^gitdir: (.+)$/m)
  return found ? resolve(cwd, found[1]!.trim()) : join(cwd, '.git')
}

/** The worktree that has `branch` checked out (never `main` itself), or undefined. */
export const worktreeOf = async (
  commands: RunnerCommands,
  main: string,
  branch: string
): Promise<string | undefined> => {
  const entry = (
    await commands.git(main, ['worktree', 'list', '--porcelain'])
  ).output
    .split('\n\n')
    .find((e) => e.includes(`\nbranch refs/heads/${branch}`))
  const worktree = entry?.match(/^worktree (.+)$/m)?.[1]
  return worktree && worktree !== main ? worktree : undefined
}

/** Work of its own in a worktree: commits the main checkout does not have, or changes not committed. */
export const hasOwnWork = async (
  commands: RunnerCommands,
  cwd: string,
  main: string
): Promise<boolean> => {
  const head = (await commands.git(main, ['rev-parse', 'HEAD'])).output
  const ahead = await commands.git(cwd, [
    'rev-list',
    '--count',
    'HEAD',
    '--not',
    head,
  ])
  const status = await commands.git(cwd, ['status', '--porcelain'])
  return (ahead.code === 0 && Number(ahead.output) > 0) || !!status.output
}

/** A shell step; resolves with its failure text, or null. */
export const runStep = async (
  setup: CheckoutSetup,
  cwd: string,
  command: string,
  label: string,
  seconds: number
): Promise<string | null> => {
  const { code, output } = await setup.commands.shell(cwd, command, seconds)
  return code === 0
    ? null
    : `${label} failed (${command}): ${output.trim().split('\n').slice(-6).join(' ')}`
}

const localPikku = (setup: CheckoutSetup, args: string) =>
  `${JSON.stringify(setup.node ?? process.execPath)} ${JSON.stringify(setup.localCli!.bin)} ${args}`

/** The command that checks a checkout, on the local CLI when it is a pikku command; '' is none. */
export const checkCommandOf = (setup: CheckoutSetup): string => {
  const check = (setup.checkCommand ?? 'pikku check').trim()
  return setup.localCli && check.startsWith('pikku ')
    ? localPikku(setup, check.slice(6))
    : check
}

/**
 * Installs a checkout: the setup command when one is given ('' is none);
 * else with a local CLI `bun install --frozen-lockfile`, @pikku/* relinked
 * to it, `pikku all` and `pikku db migrate` (a worktree's dev database is not
 * in git and starts empty); else `bun install`. Resolves with the failure, or null.
 */
export const setupCheckout = async (
  setup: CheckoutSetup,
  cwd: string,
  where: string
): Promise<string | null> => {
  if (setup.setupCommand !== undefined)
    return setup.setupCommand.trim()
      ? runStep(setup, cwd, setup.setupCommand, `the install in ${where}`, 600)
      : null
  if (!setup.localCli)
    return runStep(setup, cwd, 'bun install', `the install in ${where}`, 600)
  const cli = setup.localCli
  const relink = setup.relink ?? relinkPikku
  return (
    (await runStep(
      setup,
      cwd,
      'bun install --frozen-lockfile',
      `the install in ${where}`,
      600
    )) ??
    (() => {
      try {
        relink(cwd, cli)
        return null
      } catch (error) {
        return `relinking @pikku/* to the local build failed: ${error instanceof Error ? error.message : String(error)}`
      }
    })() ??
    (await runStep(
      setup,
      cwd,
      localPikku(setup, 'all'),
      `pikku all in ${where}`,
      600
    )) ??
    (await runStep(
      setup,
      cwd,
      localPikku(setup, 'db migrate'),
      `pikku db migrate in ${where}`,
      300
    ))
  )
}

/** After a merge: the main checkout's generated code and dev database are rebuilt (local CLI and default setup only; a setup command owns setup itself). */
export const refreshCheckout = async (
  setup: CheckoutSetup,
  cwd: string
): Promise<string | null> => {
  if (!setup.localCli || setup.setupCommand !== undefined) return null
  return (
    (await runStep(
      setup,
      cwd,
      localPikku(setup, 'all'),
      'pikku all in the main checkout',
      600
    )) ??
    (await runStep(
      setup,
      cwd,
      localPikku(setup, 'db migrate'),
      'pikku db migrate in the main checkout',
      300
    ))
  )
}

/**
 * Before each check of the main checkout its @pikku/* point at the local
 * build again (an install puts published copies back), and its own pikku
 * must then be the local build's. Resolves with why not, or null.
 */
export const mainCli = (setup: CheckoutSetup, cwd: string): string | null => {
  if (!setup.localCli || !existsSync(join(cwd, 'node_modules'))) return null
  try {
    ;(setup.relink ?? relinkPikku)(cwd, setup.localCli)
  } catch (error) {
    return `The main checkout's @pikku/* could not be pointed at the local build, so the run stopped: ${error instanceof Error ? error.message : String(error)}`
  }
  const wrong = otherCli(cwd, setup.localCli)
  return wrong ? `The main checkout, so the run stopped: ${wrong}` : null
}

export type MainRefresh = {
  head: string
  /** The HEAD the checkout is now installed at: `head`, or the earlier one when the install failed. */
  installedAt: string
  /** package.json or the lockfile changed since `installedAt`, so it was installed again. */
  installed: boolean
  /** What failed: the install or the rebuild (`red`, which an agent can repair), or the CLI it runs (`cli`, which it cannot). */
  failed?: { kind: 'red' | 'cli'; message: string }
}

/**
 * The main checkout after a merge, before its check: installed again when
 * package.json or the lockfile changed since `installedAt` (the setup command
 * when one is given; `onInstall` is told first), its generated code and dev
 * database rebuilt, and its @pikku/* pointed at the local build again.
 */
export const refreshMain = async (
  setup: CheckoutSetup,
  cwd: string,
  installedAt: string | undefined,
  onInstall?: () => void
): Promise<MainRefresh> => {
  const git = (args: string[]) => setup.commands.git(cwd, args)
  const head = (await git(['rev-parse', 'HEAD'])).output
  const changed =
    installedAt && installedAt !== head
      ? (await git(['diff', '--name-only', installedAt, head])).output.split(
          '\n'
        )
      : []
  const installed = changed.some(isDependencyFile)
  if (installed) {
    onInstall?.()
    const failed = await setupCheckout(setup, cwd, 'the main checkout')
    if (failed)
      return {
        head,
        installedAt: installedAt ?? head,
        installed,
        failed: { kind: 'red', message: failed },
      }
  }
  // A merged changeset may add tables or functions: the generated code and the dev database are rebuilt here as in a fresh worktree.
  const refreshed = await refreshCheckout(setup, cwd)
  if (refreshed)
    return {
      head,
      installedAt: head,
      installed,
      failed: { kind: 'red', message: refreshed },
    }
  const wrongCli = mainCli(setup, cwd)
  return {
    head,
    installedAt: head,
    installed,
    ...(wrongCli
      ? { failed: { kind: 'cli' as const, message: wrongCli } }
      : {}),
  }
}

export interface Prepared {
  failed: string | null
  /** The check passed here just now. */
  clean: boolean
  /** The worktree had no work of its own. */
  fresh: boolean
}

/**
 * A fresh worktree has no installed packages and must start clean: it is set
 * up, and the check runs on it; one that fails is not handed to an agent, so
 * the errors an agent meets are its own. Once both pass a marker in the
 * worktree's git dir says so, and an agent picking the change up again starts
 * at once. A worktree an agent already worked in is set up (when it has no
 * node_modules) but not judged by the check: what fails there is that
 * change's to fix.
 */
export const prepareWorktree = async (
  setup: CheckoutSetup,
  cwd: string,
  main: string
): Promise<Prepared> => {
  const marker = join(await gitDirOf(cwd), READY)
  if (existsSync(marker)) return { failed: null, clean: false, fresh: false }
  const fresh = !(await hasOwnWork(setup.commands, cwd, main))
  if (fresh || !existsSync(join(cwd, 'node_modules'))) {
    const failed = await setupCheckout(setup, cwd, 'the worktree')
    if (failed) return { failed, clean: false, fresh }
  }
  const wrongCli = otherCli(cwd, setup.localCli)
  if (wrongCli)
    return { failed: `${wrongCli} No agent was started.`, clean: false, fresh }
  const check = checkCommandOf(setup)
  let clean = false
  if (check && fresh) {
    const dirty = await runStep(setup, cwd, check, 'the clean-start check', 600)
    if (dirty)
      return {
        failed: `the worktree does not start clean, so no agent was started. ${dirty}`,
        clean: false,
        fresh,
      }
    clean = true
  }
  await writeFile(marker, clean ? 'clean\n' : 'unchecked\n').catch(
    () => undefined
  )
  return { failed: null, clean, fresh }
}
