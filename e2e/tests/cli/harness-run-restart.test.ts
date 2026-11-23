/**
 * `harnessRunWorkflow` runs the harness engine (`runHarness` from @pikku/addon-changes-cli) inside
 * one complex workflow, with every agent turn, gate run, write-guard snapshot, fix commit and
 * `markDone` recorded as a `workflow.do` step. Each change is built in its own throwaway git repo:
 * attempt 1 commits a file the formatter fixes and oxlint fails (a `debugger`), attempt 2 commits a
 * clean one.
 *
 * What this proves: killed with SIGKILL during the oxlint gate, during the agent of attempt 2, or
 * between the fix commit and the step that records it, and started again on the same SQLite file,
 * the run ends `done` with the feedback history and the commits (tree and subject) of an
 * uninterrupted run: one agent commit per attempt, one fix commit, one `markDone`. So the engine
 * loop, the write guard and the commits survive recovery. It uses e2e's own SQLite workflow
 * services (src/services.ts), not the services a generated `pikku serve` builds (#2503).
 *
 * The working directory, the SQLite file, the effect ledger and the throwaway repos are under the
 * repo's git-ignored `.tmp/`.
 */
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { startBackend } from '../../bin/backend-harness.js'

const repoTmp = fileURLToPath(new URL('../../../.tmp/', import.meta.url))
mkdirSync(repoTmp, { recursive: true })
const dir = mkdtempSync(join(repoTmp, 'harness-run-restart-'))
process.env.SQLITE_PATH = join(dir, 'runs.sqlite')
process.env.HARNESS_LEDGER_DIR = dir
process.env.WORKFLOW_RECOVERY_MS = '1000'

const WORKFLOW = 'harnessRunWorkflow'
const SCRIPT = 'lint-then-clean'
const SHORT_ID = 'k3x9'
const RECOVERY_MS = 180_000

let server: Awaited<ReturnType<typeof startBackend>> | undefined
let apiUrl: string | undefined
const held: number[] = []

const stopHeld = () => {
  for (const pid of held.splice(0)) {
    try {
      process.kill(pid, 'SIGTERM')
    } catch {}
  }
}

after(() => {
  server?.kill('SIGKILL')
  stopHeld()
  rmSync(dir, { recursive: true, force: true })
})

type Entry = { key: string; runId: string; attempt: number }

const ledger = (): Entry[] => {
  try {
    return readFileSync(
      join(dir, 'private', 'chaos', 'chaos-ledger.jsonl'),
      'utf8'
    )
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

const count = (key: string) =>
  ledger().filter((entry) => entry.key === key).length

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const waitFor = async (
  check: () => boolean | Promise<boolean>,
  what: string,
  timeoutMs = 60_000
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await sleep(100)
  }
  assert.fail(`Timed out waiting for ${what}: ${JSON.stringify(ledger())}`)
}

const git = (repo: string, args: string[]) =>
  execFileSync('git', args, { cwd: repo, encoding: 'utf8' })

/** A throwaway repo with an oxlint config that makes `debugger` an error. */
const throwawayRepo = (name: string) => {
  const repo = join(dir, name)
  mkdirSync(join(repo, 'src'), { recursive: true })
  git(repo, ['init', '-q', '-b', 'main'])
  git(repo, ['config', 'user.name', 'Harness Test'])
  git(repo, ['config', 'user.email', 'harness-test@example.invalid'])
  git(repo, ['config', 'commit.gpgsign', 'false'])
  writeFileSync(join(repo, 'README.md'), 'repo\n')
  writeFileSync(
    join(repo, '.oxlintrc.json'),
    '{"rules":{"no-debugger":"error"}}'
  )
  writeFileSync(join(repo, 'src/a.ts'), 'export const a = 0;\n')
  git(repo, ['add', '-A'])
  git(repo, ['commit', '-q', '-m', 'init'])
  return repo
}

/** Tree and subject of every commit, oldest first: equal for equal work, whatever the dates. */
const commits = (repo: string) =>
  git(repo, ['log', '--reverse', '--format=%T %s']).trim().split('\n')

const request = async (
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
) => {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-user-id': 'harness-run-user',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  assert.ok(response.ok, `${path}: ${response.status} ${text}`)
  return text ? JSON.parse(text) : undefined
}

const startRun = async (changeId: string, repo: string, script: string) =>
  (
    await request('POST', `/workflow/${WORKFLOW}/start`, {
      data: {
        worktree: repo,
        base: 'main',
        changeId,
        shortId: SHORT_ID,
        changeset: `cs-${changeId}`,
        tries: 3,
        script,
      },
    })
  ).runId as string

const finished = async (runId: string, timeoutMs: number) => {
  let last: any
  await waitFor(
    async () => {
      last = await request('GET', `/workflow/${WORKFLOW}/status/${runId}`)
      assert.notEqual(last.status, 'failed', JSON.stringify(last))
      return last.status === 'completed'
    },
    `run ${runId} to complete`,
    timeoutMs
  )
  return last.output
}

const boot = async () => {
  server = await startBackend(apiUrl ? { apiUrl } : undefined)
  await server.waitUntilReady({ timeoutMs: 120_000 })
  apiUrl = server.apiUrl
}

const kill = async () => {
  server!.kill('SIGKILL')
  server = undefined
  stopHeld()
  await sleep(500)
}

/** The output and commits of the change with nothing interrupted. */
let baseline: { output: any; commits: string[] }

/** What every run must end with, killed or not. */
const assertSameEnd = (changeId: string, repo: string, output: any) => {
  assert.equal(output.status, 'done')
  assert.equal(output.attempts, 2)
  assert.deepEqual(output.feedbackHistory, baseline.output.feedbackHistory)
  assert.deepEqual(commits(repo), baseline.commits)
  const subjects = commits(repo).map((line) => line.slice(41))
  assert.equal(subjects.filter((s) => s.startsWith('style(')).length, 1)
  assert.equal(
    subjects.filter((s) => s === `feat(agent): #${SHORT_ID} attempt 1`).length,
    1
  )
  assert.equal(
    subjects.filter((s) => s === `feat(agent): #${SHORT_ID} attempt 2`).length,
    1
  )
  assert.equal(count(`done:${changeId}`), 1, 'markDone effects')
  assert.equal(git(repo, ['status', '--porcelain', '-uall']), '')
}

before(boot)

test(
  'an uninterrupted run is done on attempt 2 with one fix commit',
  { timeout: 120_000 },
  async () => {
    const repo = throwawayRepo('baseline')
    const output = await finished(
      await startRun('c-baseline', repo, SCRIPT),
      60_000
    )
    baseline = { output, commits: commits(repo) }
    assert.equal(output.status, 'done')
    assert.equal(output.attempts, 2)
    assert.equal(output.feedbackHistory.length, 1)
    assert.match(
      output.feedbackHistory[0],
      /^Attempt 1 did not pass the gates\. Fix these findings:\n\noxlint \(1\):\n- src\/a\.ts:2 \[high\] eslint\/no-debugger: /
    )
    assert.deepEqual(
      baseline.commits.map((line) => line.slice(41)),
      [
        'init',
        `feat(agent): #${SHORT_ID} attempt 1`,
        process.env.OXFMT_BIN
          ? `style(oxfmt): #${SHORT_ID} apply oxfmt fixes (attempt 1)`
          : `style(fakefmt): #${SHORT_ID} apply fakefmt fixes (attempt 1)`,
        `feat(agent): #${SHORT_ID} attempt 2`,
      ]
    )
    assertSameEnd('c-baseline', repo, output)
    assert.equal(count('agent:1:c-baseline'), 1)
    assert.equal(count('agent:2:c-baseline'), 1)
    assert.equal(count('gate:oxlint:1:c-baseline'), 1)
  }
)

test(
  'killed during the oxlint gate, the run ends as the uninterrupted one',
  { timeout: 300_000 },
  async () => {
    const changeId = 'c-kill-oxlint'
    const repo = throwawayRepo(changeId)
    const runId = await startRun(changeId, repo, `${SCRIPT}+hold-oxlint-1`)
    await waitFor(
      () => count(`hold:oxlint-1:${changeId}`) === 1,
      'the oxlint hold'
    )
    await sleep(500)
    await kill()
    await boot()
    assertSameEnd(changeId, repo, await finished(runId, RECOVERY_MS))
    assert.equal(
      count(`gate:oxlint:1:${changeId}`),
      2,
      'the caught gate ran again'
    )
    assert.equal(
      count(`agent:1:${changeId}`),
      1,
      'the settled agent step did not'
    )
    assert.equal(count(`agent:2:${changeId}`), 1)
  }
)

test(
  'killed during the agent of attempt 2, the run ends as the uninterrupted one',
  { timeout: 300_000 },
  async () => {
    const changeId = 'c-kill-agent'
    const repo = throwawayRepo(changeId)
    const runId = await startRun(changeId, repo, `${SCRIPT}+hold-agent-2`)
    await waitFor(
      () => count(`hold:agent-2:${changeId}`) === 1,
      'the agent hold'
    )
    await sleep(500)
    await kill()
    await boot()
    assertSameEnd(changeId, repo, await finished(runId, RECOVERY_MS))
    assert.equal(count(`agent:2:${changeId}`), 2, 'the caught agent ran again')
    assert.equal(count(`agent:1:${changeId}`), 1)
    assert.equal(count(`gate:oxlint:1:${changeId}`), 1)
    assert.equal(count(`gate:oxlint:2:${changeId}`), 1)
  }
)

test(
  'killed after the fix commit, before its step is recorded, the run ends as the uninterrupted one',
  { timeout: 300_000 },
  async () => {
    const changeId = 'c-kill-fix-commit'
    const repo = throwawayRepo(changeId)
    // Holds the engine's fix commit (made with --no-verify, which still runs post-commit) once,
    // after git has written it and before the step returns.
    const marker = join(repo, '.git', 'held-fix-commit')
    const hook = join(repo, '.git', 'hooks', 'post-commit')
    writeFileSync(
      hook,
      `#!/bin/sh\ngit log -1 --format=%s | grep -q '^style(' || exit 0\n[ -e '${marker}' ] && exit 0\necho $$ > '${marker}'\nexec sleep 120\n`
    )
    chmodSync(hook, 0o755)
    const runId = await startRun(changeId, repo, SCRIPT)
    await waitFor(
      () => existsSync(marker) && readFileSync(marker, 'utf8').trim() !== '',
      'the fix commit hold'
    )
    held.push(Number(readFileSync(marker, 'utf8').trim()))
    await sleep(500)
    assert.match(git(repo, ['log', '-1', '--format=%s']), /^style\(/)
    await kill()
    await boot()
    assertSameEnd(changeId, repo, await finished(runId, RECOVERY_MS))
    assert.equal(count(`agent:1:${changeId}`), 1)
    assert.equal(
      count(`gate:oxlint:1:${changeId}`),
      1,
      'the gate after the commit ran once'
    )
  }
)
