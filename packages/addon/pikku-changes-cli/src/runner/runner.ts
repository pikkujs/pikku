import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  queue,
  type Queue,
  type QueueChange,
  type QueueGroup,
} from './commands.js'
import {
  checkCommandOf,
  gitDirOf,
  mainCli,
  prepareWorktree,
  refreshCheckout,
  runStep,
  setupCheckout,
  type CheckoutSetup,
} from './prepare.js'
import { defaultPrompts } from './prompts.js'
import { selfCheck } from './self-check.js'
import { writeShims } from './shims.js'
import { AgentWatch, stallOf, watchInterval } from './watchdog.js'
import type {
  AgentChange,
  AgentKind,
  AgentLauncher,
  AgentRun,
  LocalCli,
  NextRoute,
  RunnerCommands,
  RunnerEvent,
  RunnerOptions,
  RunnerPrompts,
  RunResult,
} from './types.js'

export const MAX_PARALLEL = 3

export interface RunnerDeps {
  launcher: AgentLauncher
  commands: RunnerCommands
  onEvent?: (event: RunnerEvent) => void
  /** Points a checkout's @pikku/* at the local CLI (default relinkPikku). */
  relink?: (cwd: string, cli: LocalCli) => void
  now?: () => number
}

/** A changeset an agent builds; `run` is unset while its worktree is being prepared. */
interface Lane {
  change: AgentChange
  run?: AgentRun
  watch?: AgentWatch
}

interface MainTurn {
  kind: Exclude<AgentKind, 'build'>
  run: AgentRun
  watch: AgentWatch
}

/** What one run has counted: starts and setup failures per change, turns, repairs, conflict turns per branch, and what was said once. */
interface Book {
  tries: Map<string, number>
  prepFails: Map<string, number>
  turns: number
  repairs: number
  conflicts: Map<string, number>
  abandoned: Set<string>
  conflictTurn: boolean
  /** The main checkout's HEAD when it was last installed: dependencies changed since are installed before its check. */
  mainHead?: string
  red?: string
  said: Set<string>
}

interface Outcome {
  reason: string
  error: boolean
}

const CONFLICT_HEAD = /^# Merge conflict/m

/**
 * Keeps up to `parallel` agents building the changes queue, each in its own
 * changeset worktree. A fill merges finished changesets (`changes next
 * --parallel`), checks the main checkout after a merge (a red one gets a
 * repair turn before any new agent starts), and claims, prepares and starts
 * agents for the ready changes. When an agent ends its lease goes back at
 * once; a change not done is picked up again in the same worktree, up to
 * `tries` starts, and then its worktree is given up (its branch kept). A merge
 * conflict gets `conflictTries` agent turns and is then given up, ending the
 * run. The run ends when a fill starts nothing and no agent is running.
 */
export class ChangesRunner {
  private readonly lanes = new Map<string, Lane>()
  private main?: MainTurn
  private readonly book: Book = {
    tries: new Map(),
    prepFails: new Map(),
    turns: 0,
    repairs: 0,
    conflicts: new Map(),
    abandoned: new Set(),
    conflictTurn: false,
    said: new Set(),
  }
  private checkMain = false
  private stopped?: Outcome
  private filling?: Promise<void>
  private refill = false
  private outcome: Outcome = { reason: 'Nothing to do', error: false }
  private readonly merged: string[] = []
  private result?: Promise<RunResult>
  private finish!: (result: RunResult) => void
  private timers: ReturnType<typeof setTimeout>[] = []
  private readonly q: Queue
  private readonly setup: CheckoutSetup
  private readonly prompts: RunnerPrompts
  private readonly now: () => number
  private shimDir?: string

  constructor(
    private readonly deps: RunnerDeps,
    private readonly options: RunnerOptions
  ) {
    if (!(options.parallel >= 1 && options.parallel <= MAX_PARALLEL))
      throw new Error(
        `parallel is 1 to ${MAX_PARALLEL}, not ${options.parallel}`
      )
    this.now = deps.now ?? Date.now
    // The runner's own CLI calls speak as the builder side (a fresh intake marker does not refuse its claims) and are offered every unblocked change at once.
    this.q = queue(deps.commands, options.cwd, () => ({
      ...options.env,
      PIKKU_CHANGES_BUILDER: '1',
      PIKKU_CHANGES_MIXED: '1',
    }))
    this.setup = {
      commands: deps.commands,
      localCli: options.localCli,
      setupCommand: options.setupCommand,
      checkCommand: options.checkCommand,
      node: options.node,
      relink: deps.relink,
    }
    this.prompts = { ...defaultPrompts, ...options.prompts }
  }

  private get cap() {
    return this.options.parallel
  }
  private get tries() {
    return this.options.tries ?? 2
  }
  private get claimant() {
    return this.options.claimant ?? 'pikku-changes-run'
  }
  private get lease() {
    return this.options.leaseMinutes ?? 120
  }

  /** Runs until nothing is left to build, a limit is hit, or stop() is called. */
  run(): Promise<RunResult> {
    this.result ??= new Promise<RunResult>((done) => {
      this.finish = done
      void this.begin()
    })
    return this.result
  }

  /** No new agent starts; every running one is stopped and its lease given back. */
  stop(reason = 'The run was stopped', kind: 'stopped' | 'limit' = 'stopped') {
    if (this.stopped) return
    this.stopped = { reason, error: true }
    this.emit(kind === 'limit' ? 'error' : 'info', kind, reason)
    for (const lane of this.lanes.values()) lane.run?.stop()
    this.main?.run.stop()
    this.settle()
  }

  private emit(
    level: RunnerEvent['level'],
    kind: RunnerEvent['kind'],
    text: string,
    change?: string
  ) {
    this.deps.onEvent?.({ level, kind, text, ...(change ? { change } : {}) })
  }

  /** Says something once per run. */
  private once(
    level: RunnerEvent['level'],
    kind: RunnerEvent['kind'],
    text: string
  ) {
    if (this.book.said.has(text)) return
    this.book.said.add(text)
    this.emit(level, kind, text)
  }

  private async begin() {
    if (this.options.selfCheck !== false) {
      const { problems, done } = await selfCheck({
        commands: this.deps.commands,
        cwd: this.options.cwd,
        localCli: this.options.localCli,
        browser: this.options.browser,
        strayIgnore: this.options.strayIgnore,
        extraChecks: this.options.extraChecks,
      }).catch((error) => ({
        problems: [String(error instanceof Error ? error.message : error)],
        done: [],
      }))
      for (const line of done) this.emit('info', 'self-check', line)
      if (problems.length) {
        const reason = `The runner did not start. Fix these first:\n${problems.map((p) => `- ${p}`).join('\n')}`
        this.emit('error', 'self-check', reason)
        this.outcome = { reason, error: true }
        return this.end()
      }
    }
    if (this.options.localCli && this.options.shimDir)
      this.shimDir = await writeShims(
        this.options.shimDir,
        this.options.localCli,
        {
          node: this.options.node,
          relinkScript: this.options.relinkScript,
        }
      )
    const quiet = (this.options.stallMinutes ?? 10) * 60_000
    const toolMax = (this.options.toolMaxMinutes ?? 45) * 60_000
    const watchdog = setInterval(
      () => this.watchStalls(quiet, toolMax),
      watchInterval(quiet, toolMax)
    )
    watchdog.unref?.()
    this.timers.push(watchdog)
    if (this.options.maxMinutes) {
      const limit = setTimeout(
        () =>
          this.stop(
            `The time limit of ${this.options.maxMinutes} minute(s) is up: the running agents were stopped and their leases given back.`,
            'limit'
          ),
        this.options.maxMinutes * 60_000
      )
      limit.unref?.()
      this.timers.push(limit)
    }
    this.requestFill()
  }

  private end() {
    for (const timer of this.timers) clearTimeout(timer)
    const outcome = this.stopped ?? this.outcome
    if (!outcome.error) this.emit('info', 'idle', outcome.reason)
    this.finish({
      ok: !outcome.error,
      reason: outcome.reason,
      merged: [...this.merged],
      turns: this.book.turns,
    })
  }

  /** Ends the run once nothing is filling and no agent runs. */
  private settle() {
    if (this.filling || this.main || this.lanes.size || !this.finish) return
    if (!this.stopped && this.refill) return this.requestFill()
    this.end()
  }

  /** Fills are one at a time; one asked for meanwhile runs again after it. */
  private requestFill() {
    if (this.filling) {
      this.refill = true
      return
    }
    this.filling = (async () => {
      do {
        this.refill = false
        if (this.stopped) break
        this.outcome = await this.fill()
      } while (this.refill && !this.stopped)
    })()
      .catch((error) => {
        const reason = error instanceof Error ? error.message : String(error)
        const identity =
          /please tell me who you are|unable to auto-detect email|empty ident|user\.email/i.test(
            reason
          )
        const text = identity
          ? `The run failed: git has no identity in this project, so the runner cannot commit a merge. Set one (git config user.email <email> and git config user.name <name>) and start it again. ${reason}`
          : `The run failed: ${reason}`
        this.emit('error', 'failed', text)
        this.outcome = { reason: text, error: true }
      })
      .finally(() => {
        this.filling = undefined
        this.settle()
      })
  }

  private watchStalls(quiet: number, toolMax: number) {
    const now = this.now()
    const watched: [string, AgentRun, AgentWatch, string | undefined][] = []
    for (const lane of this.lanes.values())
      if (lane.run && lane.watch)
        watched.push([
          `#${lane.change.id}: the agent`,
          lane.run,
          lane.watch,
          lane.change.id,
        ])
    if (this.main)
      watched.push([
        'The agent in the main checkout',
        this.main.run,
        this.main.watch,
        undefined,
      ])
    for (const [who, run, watch, change] of watched) {
      const why = stallOf(watch, now, quiet, toolMax)
      if (!why) continue
      this.emit(
        'info',
        'stalled',
        `${who} ${why}${change ? ' and the change goes back in the queue' : ''}`,
        change
      )
      watch.reset()
      run.stop()
    }
  }

  /** Gives a changeset's lease back; a failure is said, never swallowed (the lease would hold the change until it ran out). */
  private async release(groupId: string, what: string) {
    try {
      return await this.q.release(groupId)
    } catch (error) {
      this.emit(
        'error',
        'release-failed',
        `${what}: could not give the lease of changeset ${groupId} back, so it holds its changes until it runs out (\`pikku changes release ${groupId}\` gives it back now): ${error instanceof Error ? error.message : String(error)}`
      )
      return null
    }
  }

  /** Removes a worktree, keeping its branch: a claim of its changeset re-attaches the branch in a new one. */
  private async dropWorktree(worktree: string, why: string, change?: string) {
    const removed = await this.deps.commands.git(this.options.cwd, [
      'worktree',
      'remove',
      '--force',
      worktree,
    ])
    if (removed.code)
      this.emit(
        'error',
        'abandoned',
        `${why}, but its worktree ${worktree} could not be removed: ${removed.output}`,
        change
      )
    else
      this.emit(
        'info',
        'abandoned',
        `${why}: its worktree ${worktree} was removed, its branch kept`,
        change
      )
  }

  /** The worktree of a change that used its tries goes, branch kept; what was not committed there is saved as a patch first. */
  private async abandon(change: AgentChange) {
    const git = (args: string[]) =>
      this.deps.commands.git(change.worktree, args)
    let saved = ''
    if ((await git(['status', '--porcelain'])).output) {
      await git(['add', '-A'])
      const diff = await git(['diff', '--cached', '--binary', 'HEAD'])
      const patch = join(
        await gitDirOf(this.options.cwd),
        `pikku-abandoned-${change.groupId.slice(0, 8)}-${this.now()}.patch`
      )
      saved =
        !diff.code &&
        (await writeFile(patch, `${diff.output}\n`).then(
          () => true,
          () => false
        ))
          ? ` (what it had not committed is saved in ${patch})`
          : ' (what it had not committed could not be saved and is gone)'
    }
    await this.dropWorktree(
      change.worktree,
      `#${change.id}: used its ${this.tries} tries this run${saved}`,
      change.id
    )
  }

  /** Why no more agent may start this run, said once; null while there is room. */
  private overBudget(): string | null {
    const max = this.options.maxTurns ?? 40
    if (this.book.turns < max) return null
    const reason = `The run stopped: it started ${this.book.turns} agent turns (builds, repairs and merge conflicts together; the limit is ${max}). Start it again to go on.`
    this.once('error', 'limit', reason)
    return reason
  }

  private async startAgent(
    kind: AgentKind,
    cwd: string,
    prompt: string,
    change: AgentChange | null
  ): Promise<AgentRun> {
    const env: Record<string, string> = {
      ...this.options.env,
      PIKKU_CHANGES_BUILDER: '1',
      PIKKU_CHANGES_PARALLEL: '1',
      PIKKU_AGENT_KIND: kind,
      ...(change
        ? {
            PIKKU_CHANGE_ID: change.id,
            PIKKU_CHANGESET_GROUP: change.groupId,
            PIKKU_CHANGESET_WORKTREE: change.worktree,
          }
        : {}),
      ...(this.shimDir
        ? {
            PATH: `${this.shimDir}:${this.options.env?.PATH ?? process.env.PATH ?? ''}`,
          }
        : {}),
    }
    return this.deps.launcher.start({ cwd, env, prompt, change, kind })
  }

  /** An agent in the main checkout: a repair or a merge conflict. When it ends the runner fills again. */
  private async startMain(kind: MainTurn['kind'], prompt: string) {
    const run = await this.startAgent(kind, this.options.cwd, prompt, null)
    const turn: MainTurn = { kind, run, watch: new AgentWatch(run, this.now) }
    this.main = turn
    run.onExit(() => {
      if (this.main === turn) this.main = undefined
      if (this.stopped) this.settle()
      else this.requestFill()
    })
  }

  /** An agent's process ended, done or not: its lease goes back now, never left to run out, and the slot is filled again. */
  private async endLane(lane: Lane) {
    this.lanes.delete(lane.change.groupId)
    const { change } = lane
    try {
      const released = await this.release(change.groupId, `#${change.id}`)
      const open = released?.open.map((id) => `#${id}`).join(', ')
      // A change that used its tries keeps its branch but not its worktree: an abandoned worktree would hold a place under the cap.
      const spent =
        !!open && (this.book.tries.get(change.id) ?? 0) >= this.tries
      if (released)
        this.emit(
          'info',
          'ended',
          !open
            ? `#${change.id}: the agent finished`
            : spent
              ? `#${change.id}: the agent stopped with ${open} open, and it has no tries left this run`
              : `#${change.id}: the agent stopped with ${open} open — back in the queue, its worktree kept`,
          change.id
        )
      if (spent) await this.abandon(change)
    } finally {
      if (this.stopped) this.settle()
      else this.requestFill()
    }
  }

  /**
   * The main checkout fails its check: no new agent starts, and once the
   * running agents have ended one agent repairs it there, at most
   * `repairTries` times a run.
   */
  private async repairMain(red: string): Promise<Outcome> {
    const book = this.book
    if (book.red !== red)
      this.emit(
        'error',
        'red',
        `The main checkout fails the check after a merge, so no new agent starts until it passes. ${red}`
      )
    book.red = red
    if (this.lanes.size)
      return {
        reason: `The main checkout fails the check: it is repaired after the ${this.lanes.size} running agent(s)`,
        error: false,
      }
    if (this.main)
      return { reason: 'The main checkout is being repaired', error: false }
    const max = this.options.repairTries ?? 2
    if (book.repairs >= max) {
      const reason = `The main checkout still fails the check after ${book.repairs} repairs, so the run stopped. Fix it and start the run again.`
      this.once('error', 'red', reason)
      return { reason, error: true }
    }
    if (this.stopped) return this.stopped
    const over = this.overBudget()
    if (over) return { reason: over, error: true }
    book.repairs += 1
    book.turns += 1
    this.emit(
      'info',
      'repair',
      `An agent is repairing the main checkout (repair ${book.repairs} of ${max})`
    )
    await this.startMain('repair', this.prompts.repair(red))
    return { reason: 'Repairing the main checkout', error: false }
  }

  /** After a merge (or a conflict turn): install again when dependencies changed, rebuild, relink, and check. Null when it passes. */
  private async checkMainCheckout(): Promise<Outcome | null> {
    const { cwd } = this.options
    const git = (args: string[]) => this.deps.commands.git(cwd, args)
    const book = this.book
    const now = (await git(['rev-parse', 'HEAD'])).output
    const changed =
      book.mainHead && book.mainHead !== now
        ? (await git(['diff', '--name-only', book.mainHead, now])).output.split(
            '\n'
          )
        : []
    if (
      changed.some((file) => /(^|\/)package\.json$|^bun\.lockb?$/.test(file))
    ) {
      this.emit(
        'info',
        'note',
        'package.json or bun.lock changed in the main checkout: it is installed again before its check'
      )
      const failed = await setupCheckout(this.setup, cwd, 'the main checkout')
      if (failed) return this.repairMain(failed)
    }
    book.mainHead = now
    // A merged changeset may add tables or functions: the generated code and the dev database are rebuilt here as in a fresh worktree.
    const refreshed = await refreshCheckout(this.setup, cwd)
    if (refreshed) return this.repairMain(refreshed)
    const wrongCli = mainCli(this.setup, cwd)
    if (wrongCli) {
      this.once('error', 'failed', wrongCli)
      return { reason: wrongCli, error: true }
    }
    const check = checkCommandOf(this.setup)
    const red = check
      ? await runStep(
          this.setup,
          cwd,
          check,
          'the check of the main checkout',
          900
        )
      : null
    if (red) return this.repairMain(red)
    if (book.red) {
      this.emit(
        'info',
        'green',
        'The main checkout passes the check again, so agents start again'
      )
      this.refill = true // what was held back from merging while it failed goes in on the next fill
    }
    book.red = undefined
    this.checkMain = false
    return null
  }

  /** A changeset still in conflict after its conflict turns: its lease goes back, its worktree is removed (branch kept), and the run stops. */
  private async giveUpConflict(
    branch: string,
    title: string | undefined,
    groups: QueueGroup[],
    what: string
  ): Promise<Outcome> {
    const tries = this.options.conflictTries ?? 2
    const reason = `${what}, and ${tries} merge-conflict turns did not resolve it, so the run stopped. ${branch} is given up this run: its lease is back and its worktree removed (the branch is kept). Merge it by hand (\`git merge ${branch}\` in the main checkout) or drop it, then start the run again.`
    if (!this.book.abandoned.has(branch)) {
      this.book.abandoned.add(branch)
      const group = groups.find((g) => title !== undefined && g.title === title)
      if (group) await this.release(group.groupId, `${branch}, given up`)
      const entry = (
        await this.deps.commands.git(this.options.cwd, [
          'worktree',
          'list',
          '--porcelain',
        ])
      ).output
        .split('\n\n')
        .find((e) => e.includes(`\nbranch refs/heads/${branch}`))
      const worktree = entry?.match(/^worktree (.+)$/m)?.[1]
      if (worktree && worktree !== this.options.cwd)
        await this.dropWorktree(
          worktree,
          `${branch}: still in conflict after ${tries} merge-conflict turns`
        )
    }
    this.once('error', 'gave-up', reason)
    return { reason, error: true }
  }

  /** Not a list of changes: a merge conflict is the runner's own work; anything else (knowledge gaps, an upgrade) would grow the scope, so the run ends. */
  private async otherRoute(
    route: NextRoute,
    groups: QueueGroup[]
  ): Promise<Outcome> {
    const running = this.lanes.size
    if (!route.agent)
      return {
        reason: running ? `${running} agent(s) running` : route.reason,
        error: false,
      }
    const conflict = CONFLICT_HEAD.test(route.context ?? '')
    if (!conflict) {
      const reason = `The run ends here: nothing planned is left to build, and it does not start “${route.reason}” (${route.agent} work) on its own.`
      if (!running && !this.main) this.once('info', 'note', reason)
      return { reason, error: false }
    }
    if (running || this.main)
      return {
        reason: `${route.reason} — after the running agents`,
        error: false,
      }
    if (this.stopped) return this.stopped
    const named = (route.context ?? '').match(
      /^“(.*)” \(([^()\s]+)\) conflicts with /m
    )
    const branch = named?.[2] ?? route.reason
    const tries = this.options.conflictTries ?? 2
    if ((this.book.conflicts.get(branch) ?? 0) >= tries)
      return this.giveUpConflict(branch, named?.[1], groups, route.reason)
    const over = this.overBudget()
    if (over) return { reason: over, error: true }
    this.book.turns += 1
    this.book.conflicts.set(branch, (this.book.conflicts.get(branch) ?? 0) + 1)
    this.book.conflictTurn = true
    this.emit(
      'info',
      'conflict',
      `${route.reason}: an agent resolves it in the main checkout (merge-conflict turn ${this.book.conflicts.get(branch)} of ${tries})`
    )
    await this.startMain('conflict', this.prompts.conflict(route))
    return { reason: route.reason, error: false }
  }

  private async fill(): Promise<Outcome> {
    const book = this.book
    const { changes: listed, groups } = await this.q.list()
    const owns =
      this.options.ownsLease ??
      ((by: string) => by === this.claimant || by === 'pikku-cli')
    for (const group of groups) {
      // Left by an agent no lane of this run holds (a restart): not while a main-checkout turn runs, which may hold one.
      const live =
        !!group.claimExpiresAt && Date.parse(group.claimExpiresAt) > this.now()
      if (
        group.claimedBy &&
        owns(group.claimedBy) &&
        live &&
        !this.lanes.has(group.groupId) &&
        !this.main
      )
        await this.release(group.groupId, 'A lease no running agent holds')
    }
    book.mainHead ??= (
      await this.deps.commands.git(this.options.cwd, ['rev-parse', 'HEAD'])
    ).output
    // While the main checkout fails its check nothing more is merged into it.
    const route = await this.q.next(
      book.red ? { PIKKU_CHANGES_NO_MERGE: '1' } : {}
    )
    for (const line of route.merged) {
      this.merged.push(line)
      this.emit('info', 'merged', `Merged ${line}`)
    }
    if (route.merged.length) this.checkMain = true
    // A conflict turn may have merged by hand, which route.merged never says.
    if (book.conflictTurn && !this.main) {
      book.conflictTurn = false
      this.checkMain = true
    }
    if (this.checkMain) {
      const held = await this.checkMainCheckout()
      if (held) return held
    }
    const ids =
      route.agent === 'changes'
        ? [...(route.context ?? '').matchAll(/^## #(\d+) /gm)].map((m) => m[1]!)
        : []
    if (!ids.length) return this.otherRoute(route, groups)
    return this.startLanes(route, ids, listed, groups)
  }

  private async startLanes(
    route: NextRoute,
    ids: string[],
    listed: QueueChange[],
    groups: QueueGroup[]
  ): Promise<Outcome> {
    const book = this.book
    const changes = new Map(listed.map((c) => [String(c.shortId), c]))
    const known = new Set(groups.map((g) => g.groupId))
    const groupOf = (id: string) => {
      const groupId = changes.get(id)?.groupId
      return groupId && known.has(groupId) ? groupId : undefined
    }
    const busy = (id: string) =>
      [...this.lanes.values()].some(
        (lane) => lane.change.id === id || lane.change.groupId === groupOf(id)
      )
    // Changes that already hold a worktree go first: they need no new place under the cap, and a new claim ahead of them would be refused by it.
    const trees = new Set(
      (
        await this.deps.commands.git(this.options.cwd, [
          'worktree',
          'list',
          '--porcelain',
        ])
      ).output
        .split('\n')
        .filter((line) => line.startsWith('branch '))
        .map((line) => line.slice('branch refs/heads/'.length))
    )
    const holdsTree = (id: string) => {
      const branch = groups.find((g) => g.groupId === groupOf(id))?.branch
      return !!branch && trees.has(branch)
    }
    const candidates = ids
      .filter(
        (id) =>
          !busy(id) &&
          (book.tries.get(id) ?? 0) < this.tries &&
          (book.prepFails.get(id) ?? 0) < this.tries
      )
      .sort(
        (a, b) =>
          Number(holdsTree(b)) - Number(holdsTree(a)) ||
          Number(!!groupOf(b)) - Number(!!groupOf(a))
      )
    let started = 0
    let reason: Outcome = { reason: route.reason, error: false }
    if (candidates.length && this.lanes.size < this.cap)
      await this.options.beforeClaim?.()
    for (const id of candidates) {
      if (this.lanes.size >= this.cap || this.stopped) break
      const over = this.overBudget()
      if (over) {
        reason = { reason: over, error: true }
        break
      }
      const listedChange = changes.get(id)
      let claim
      try {
        claim = await this.q.claim(
          { id, title: listedChange?.title ?? '', groupId: groupOf(id) },
          this.claimant,
          this.lease
        )
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error)
        this.emit('info', 'not-claimed', `#${id} not started: ${why}`, id)
        const full = why.match(
          /(\d+) changeset worktrees are live and the cap is (\d+): ([^\n]*?)\. /
        )
        // Refused by the cap with no agent of this run going: every place is held by a worktree nobody works in.
        if (full && !this.lanes.size) {
          const text = `No agent can start: the cap of ${full[2]} changeset worktrees is reached by ${full[1]} worktree(s) no agent is running in (${full[3]}). Merge or release them, remove them with \`git worktree remove --force <path>\` (their branches stay), or raise PIKKU_CHANGES_MAX_WORKTREES.`
          this.once('error', 'not-claimed', text)
          reason = { reason: text, error: true }
        }
        if (full || /the cap is/.test(why)) break
        continue
      }
      const change: AgentChange = {
        id,
        title: claim.group.title,
        groupId: claim.group.groupId,
        worktree: claim.worktree,
      }
      const lane: Lane = { change }
      this.lanes.set(change.groupId, lane)
      const tries = (book.tries.get(id) ?? 0) + 1
      this.emit(
        'info',
        'claimed',
        `#${id} ${listedChange?.title ?? ''}: agent ${this.lanes.size} of ${this.cap}${tries > 1 ? ', picked up again' : ''}, in ${claim.worktree}`,
        id
      )
      const prepared = await prepareWorktree(
        this.setup,
        claim.worktree,
        this.options.cwd
      )
      if (prepared.failed || this.stopped) {
        this.lanes.delete(change.groupId)
        await this.release(change.groupId, `#${id}`)
        if (this.stopped) {
          this.emit(
            'info',
            'stopped',
            `#${id}: not started, the run was stopped; its lease is back`,
            id
          )
          break
        }
        // Not a try: no agent ran. A fresh worktree is removed so it holds no place under the cap, and
        // one cut from the main checkout that fails its check says the main checkout may fail it too: that is checked next.
        book.prepFails.set(id, (book.prepFails.get(id) ?? 0) + 1)
        this.emit('error', 'prepare-failed', `#${id}: ${prepared.failed}`, id)
        if (prepared.fresh)
          await this.dropWorktree(
            claim.worktree,
            `#${id}: its worktree did not set up`,
            id
          )
        if (
          prepared.fresh &&
          /does not start clean/.test(prepared.failed ?? '')
        ) {
          this.checkMain = true
          this.refill = true
          break
        }
        continue
      }
      book.tries.set(id, tries)
      book.turns += 1
      try {
        const prompt = this.prompts.build({
          route,
          change,
          claimant: this.claimant,
          leaseMinutes: this.lease,
          clean: prepared.clean,
        })
        const run = await this.startAgent(
          'build',
          claim.worktree,
          prompt,
          change
        )
        lane.run = run
        lane.watch = new AgentWatch(run, this.now)
        this.emit(
          'info',
          'started',
          `#${id}: agent started (try ${tries} of ${this.tries})`,
          id
        )
        run.onExit(() => void this.endLane(lane))
        started += 1
      } catch (error) {
        this.lanes.delete(change.groupId)
        await this.release(change.groupId, `#${id}`)
        this.emit(
          'error',
          'failed',
          `#${id}: the agent could not start: ${error instanceof Error ? error.message : String(error)}`,
          id
        )
      }
    }
    // With places still free another fill asks again: one started here is leased, so it is not offered twice.
    if (started && this.lanes.size < this.cap && !this.stopped)
      this.refill = true
    if (started)
      return {
        reason: `${started} agent(s) started — ${route.reason}`,
        error: false,
      }
    if (this.lanes.size)
      return { reason: `${this.lanes.size} agent(s) running`, error: false }
    if (!candidates.length && !this.refill && !this.checkMain)
      return {
        reason: `Open changes are left that used their tries this run: ${ids.map((id) => `#${id}`).join(', ')}`,
        error: true,
      }
    return reason
  }
}
