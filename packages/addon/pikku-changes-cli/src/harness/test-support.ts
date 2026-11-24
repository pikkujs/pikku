import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InMemoryWorkflowService } from '@pikku/core/services/in-memory-workflow'
import { pikkuState } from '@pikku/core/state'
import { addWorkflow, type PikkuWorkflowWire } from '@pikku/core/workflow'
import {
  HARNESS_RUN,
  runHarness,
  type HarnessResult,
  type RunHarnessOptions,
} from './engine.js'
import type { HarnessGate } from './gate.js'
import { parseOxfmtWrite } from './gates/oxfmt-parser.js'
import { gitIn } from './git.js'

const here = dirname(fileURLToPath(import.meta.url))

/** The repository root; throwaway repos go in its git-ignored `.tmp/`. */
export const REPO_ROOT = resolve(here, '../../../../..')
export const FAKE_CLI = join(here, 'fixtures', 'fake-cli.mjs')

const made: string[] = []

/** A fresh `git init` repo under `.tmp/` with one commit holding `files`. */
export const throwawayRepo = async (
  files: Record<string, string> = {}
): Promise<string> => {
  const parent = join(REPO_ROOT, '.tmp')
  await mkdir(parent, { recursive: true })
  const dir = await mkdtemp(join(parent, 'harness-test-'))
  made.push(dir)
  const git = gitIn(dir)
  await git(['init', '-q', '-b', 'main'])
  await git(['config', 'user.name', 'Harness Test'])
  await git(['config', 'user.email', 'harness-test@example.invalid'])
  await git(['config', 'commit.gpgsign', 'false'])
  for (const [path, content] of Object.entries({
    'README.md': 'repo\n',
    ...files,
  })) {
    await mkdir(dirname(join(dir, path)), { recursive: true })
    await writeFile(join(dir, path), content)
  }
  await git(['add', '-A'])
  await git(['commit', '-q', '-m', 'init'])
  return dir
}

export const removeThrowaways = async () => {
  while (made.length) await rm(made.pop()!, { recursive: true, force: true })
}

/** Formats `file` by squeezing runs of spaces, through the fake CLI so it is a real child process. */
export const fakeFormatter = (file: string): HarnessGate => ({
  name: 'fakefmt',
  description: 'squeezes spaces',
  stage: 'fixer',
  failOn: 'medium',
  writes: ['**/*.{ts,tsx}'],
  run: async (wire) => {
    const source = await readFile(join(wire.worktree, file), 'utf8')
    const formatted = source.replace(/ {2,}/g, ' ')
    if (formatted === source) return []
    return wire.runCli(['write', file, formatted], {
      binary: FAKE_CLI,
      parse: parseOxfmtWrite,
    })
  },
})

const NO_RPC = undefined as never
let workflows = 0

/**
 * Runs `body` as a run of its own workflow on core's in-memory workflow service, inline, started
 * with the harness wire unless `wire` says otherwise. A run that suspends (on an approval, or a
 * test's stand-in for a kill) goes on with `replay`, which replays it from its recorded steps.
 */
export const workflowRun = async <T>(
  body: (workflow: PikkuWorkflowWire) => Promise<T>,
  wire: { type: string; pikkuUserId?: string } = { type: HARNESS_RUN }
) => {
  const name = `harnessTest${++workflows}`
  const service = new InMemoryWorkflowService()
  pikkuState(null, 'package', 'singletonServices', {
    logger: { error() {}, info() {}, warn() {}, debug() {} },
    // Nothing is queued: a resumed run is replayed by the test with `replay`.
    queueService: { add: async () => {} },
    // A run started by a user loads their session; the starter in these tests has a plain one.
    sessionStore: { get: async (userId: string) => ({ userId }) },
    workflowService: service,
  } as never)
  pikkuState(null, 'workflows', 'meta')[name] = {
    name,
    pikkuFuncId: name,
    source: 'complex',
    graphHash: `${name}-hash`,
  } as never
  pikkuState(null, 'function', 'meta')[name] = {
    name,
    sessionless: true,
    permissions: [],
  } as never
  addWorkflow(name, {
    func: async (_services: unknown, _data: unknown, { workflow }: any) =>
      body(workflow),
  } as never)
  let runId = ''
  await service.startWorkflow(name, {}, wire, NO_RPC, {
    inline: true,
    onRunCreated: (id) => {
      runId = id
    },
  })
  const run = async () => (await service.getRun(runId))!
  return {
    service,
    runId,
    run,
    output: async () => (await run()).output as T,
    replay: () => service.runWorkflowJob(runId, NO_RPC),
  }
}

/** `runHarness` in a harness run of its own, to its end: its result. */
export const harnessRun = async (
  options: Omit<RunHarnessOptions, 'workflow'>
): Promise<HarnessResult> =>
  (
    await workflowRun((workflow) => runHarness({ ...options, workflow }))
  ).output()
