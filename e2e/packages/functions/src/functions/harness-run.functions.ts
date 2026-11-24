/**
 * The pieces `harnessRunWorkflow` runs the harness engine with, in a throwaway git repo: a scripted
 * agent that edits and commits by attempt, the declared `e2eHarness` (the addon's oxlint gate and a
 * formatter fixer), and `markDone`.
 *
 * Every effect here may run twice (a step caught by a kill runs again after the restart), so each
 * one checks whether it already happened: the agent looks for its own commit, `markDone` for its
 * line in the effect ledger, and a hold (a pause a test kills the server in) happens once.
 */
import { realpathSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pikkuHarness, pikkuHarnessGate } from '@pikku/core/harness'
import {
  gitIn,
  HARNESS_RUN,
  oxlintGate,
  parseOxfmtWrite,
} from '@pikku/addon-changes-cli/harness'
import { pikkuSessionlessFunc } from '#pikku/function'
import { readEffects, recordEffect } from './chaos-ledger.js'

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../..'
)

/** The slice 3 stand-in tool: `sleep` holds for 30 s, `write <file> <content>` writes a file. */
const FAKE_CLI = join(
  REPO_ROOT,
  'packages/addon/pikku-changes-cli/src/harness/fixtures/fake-cli.mjs'
)

/** What `harnessRunWorkflow` builds. */
export type HarnessRunInput = {
  /** Absolute path of the worktree the changeset is built in. */
  worktree: string
  base: string
  changeId: string
  shortId: string
  changeset: string
  tries: number
  /** The scripted agent's script, with any holds: `lint-then-clean+hold-agent-2`. */
  script: string
}

export const harnessStartRun = pikkuSessionlessFunc<
  HarnessRunInput,
  { runId: string }
>({
  description:
    'Start harnessRunWorkflow as a harness run: its wire is flagged harness and the caller owns it',
  expose: true,
  func: async (_services, data, { rpc, pikkuUserId }) =>
    rpc.startWorkflow('harnessRunWorkflow', data, {
      wire: { type: HARNESS_RUN, ...(pikkuUserId ? { pikkuUserId } : {}) },
    }),
})

/** The tools the run pins, found once per run so a replay uses the same ones: the real oxlint and the fake CLI. */
export const findHarnessTools = (): Record<string, string> => ({
  oxlint: realpathSync(join(REPO_ROOT, 'node_modules/.bin/oxlint')),
  'fake-cli': FAKE_CLI,
})

type Variables = {
  get: (name: string) => Promise<string | undefined> | string | undefined
}

/** HARNESS_LEDGER_DIR, or the worktree's own git dir when it is unset. */
const ledgerDirFor = async (variables: Variables, worktree: string) =>
  (await variables.get('HARNESS_LEDGER_DIR')) ??
  join(worktree, '.git', 'pikku-harness')

/**
 * A script is a name and the holds to make, joined by `+`: `lint-then-clean+hold-oxlint-1` holds
 * the first oxlint run of attempt 1, `lint-then-clean+hold-agent-2` the agent of attempt 2 once it
 * has committed.
 */
const parseScript = (script: string) => {
  const [name, ...holds] = script.split('+')
  return { name: name!, holds: new Set(holds) }
}

/** Per attempt, the files the agent writes. */
const SCRIPTS: Record<string, Record<string, string>[]> = {
  // attempt 1 leaves spacing for the formatter and a `debugger` for oxlint; attempt 2 is clean
  'lint-then-clean': [
    { 'src/a.ts': 'export  const  a  =  1\ndebugger\n' },
    { 'src/a.ts': 'export const a = 2;\n' },
  ],
}

/** Holds once per change: the first caller records the hold in the ledger and waits. */
const holdOnce = async (
  ledgerDir: string,
  hold: string,
  changeId: string,
  wait: () => Promise<unknown>
) => {
  const key = `hold:${hold}:${changeId}`
  if ((await readEffects(ledgerDir)).some((entry) => entry.key === key)) return
  await recordEffect(ledgerDir, {
    key,
    runId: changeId,
    attempt: 1,
    at: Date.now(),
  })
  await wait()
}

/** Squeezes runs of spaces in src/a.ts through the fake CLI, as the slice 3 tests do. */
export const fakeFormatterGate = pikkuHarnessGate({
  name: 'fakefmt',
  description: 'Squeezes runs of spaces in src/a.ts',
  failOn: 'medium',
  writes: ['**/*.{ts,tsx}'],
  func: async (_services, _data, { gate }) => {
    const source = await readFile(join(gate.worktree, 'src/a.ts'), 'utf8')
    const formatted = source.replace(/ {2,}/g, ' ')
    if (formatted === source) return []
    return gate.runCli(['write', 'src/a.ts', formatted], {
      binary: gate.tool('fake-cli'),
      parse: parseOxfmtWrite,
    })
  },
})

/**
 * The addon's oxlint gate, which a `hold-oxlint-<attempt>` script (read from the run's input)
 * slows with the fake CLI's `sleep` first. Every run is recorded in the effect ledger.
 */
export const scriptedOxlintGate = pikkuHarnessGate({
  name: 'oxlint',
  description: 'The addon oxlint gate, held when the run script says so',
  failOn: 'high',
  writes: [],
  func: async ({ variables }, data, { gate }) => {
    const { script, worktree } = gate.input as HarnessRunInput
    const ledgerDir = await ledgerDirFor(variables, worktree)
    await recordEffect(ledgerDir, {
      key: `gate:oxlint:${gate.attempt}:${gate.changeId}`,
      runId: gate.changeId,
      attempt: gate.attempt,
      at: Date.now(),
    })
    if (parseScript(script).holds.has(`hold-oxlint-${gate.attempt}`))
      await holdOnce(ledgerDir, `oxlint-${gate.attempt}`, gate.changeId, () =>
        gate.runCli(['sleep'], {
          binary: gate.tool('fake-cli'),
          parse: () => [],
        })
      )
    return oxlintGate.func({}, data, { gate })
  },
})

/** The harness `harnessRunWorkflow` runs: oxlint, held by script, and a formatter fixer. */
export const e2eHarness = pikkuHarness({
  name: 'e2e',
  description: 'Lints and formats a scripted change in a throwaway repo',
  agent: { model: 'default' },
  gates: [scriptedOxlintGate, fakeFormatterGate],
})

export const harnessScriptedAgent = pikkuSessionlessFunc<
  {
    worktree: string
    changeId: string
    shortId: string
    script: string
    attempt: number
    feedback?: string
  },
  { outcome: 'done' | 'needs-answer' | 'failed' }
>({
  description:
    'Stand in for the builder: writes the files its script gives for the attempt and commits them once',
  func: async ({ variables }, data) => {
    const ledgerDir = await ledgerDirFor(variables, data.worktree)
    await recordEffect(ledgerDir, {
      key: `agent:${data.attempt}:${data.changeId}`,
      runId: data.changeId,
      attempt: data.attempt,
      at: Date.now(),
      detail: data.feedback ?? null,
    })
    const { name, holds } = parseScript(data.script)
    const turns = SCRIPTS[name]
    if (!turns) throw new Error(`No agent script named ${name}`)
    const edits = turns[data.attempt - 1]
    if (!edits) return { outcome: 'failed' }

    const subject = `feat(agent): #${data.shortId} attempt ${data.attempt}`
    const git = gitIn(data.worktree)
    const subjects = (await git(['log', '--format=%s'])).split('\n')
    if (!subjects.includes(subject)) {
      for (const [path, content] of Object.entries(edits)) {
        await mkdir(dirname(join(data.worktree, path)), { recursive: true })
        await writeFile(join(data.worktree, path), content)
      }
      await git(['add', '-A', '--', ...Object.keys(edits)])
      await git(['commit', '--no-verify', '-q', '-m', subject])
    }
    if (holds.has(`hold-agent-${data.attempt}`))
      await holdOnce(
        ledgerDir,
        `agent-${data.attempt}`,
        data.changeId,
        () => new Promise((done) => setTimeout(done, 600_000))
      )
    return { outcome: 'done' }
  },
})

export const harnessMarkChangeDone = pikkuSessionlessFunc<
  { worktree: string; changeId: string },
  { alreadyDone: boolean }
>({
  description:
    'Mark the change done once: a second call for the same change finds its ledger line and does nothing',
  func: async ({ variables }, data) => {
    const ledgerDir = await ledgerDirFor(variables, data.worktree)
    const key = `done:${data.changeId}`
    if ((await readEffects(ledgerDir)).some((entry) => entry.key === key))
      return { alreadyDone: true }
    await recordEffect(ledgerDir, {
      key,
      runId: data.changeId,
      attempt: 1,
      at: Date.now(),
    })
    return { alreadyDone: false }
  },
})
