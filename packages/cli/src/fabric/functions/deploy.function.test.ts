import { describe, test } from 'node:test'
import assert from 'node:assert'
import { branchFromHead, renderDeployApply } from './deploy.function.js'

describe('branchFromHead', () => {
  test('takes the checked-out branch as the deploy target', () => {
    assert.strictEqual(branchFromHead('feat/thing'), 'feat/thing')
  })

  // `rev-parse --abbrev-ref HEAD` answers the literal 'HEAD' when detached,
  // which would otherwise travel on as a branch name and come back as
  // "local branch HEAD does not exist".
  test('refuses a detached HEAD by name', () => {
    assert.throws(() => branchFromHead('HEAD'), /HEAD is detached/)
  })

  test('refuses an empty answer rather than deploying nothing', () => {
    assert.throws(() => branchFromHead(''), /HEAD is detached/)
  })
})

describe('renderDeployApply on a failure', () => {
  const printed = (result: Record<string, unknown>): string => {
    const lines: string[] = []
    const log = console.log
    console.log = (...args: unknown[]) => lines.push(args.join(' '))
    try {
      renderDeployApply(null, {
        event: 'result',
        outcome: 'failed',
        projectId: 'proj',
        deploymentId: 'dep-1',
        branch: 'main',
        status: 'failed',
        ...result,
      } as any)
    } finally {
      console.log = log
    }
    return lines.join('\n')
  }

  test("prints the tail of the builder's own log", () => {
    const buildLog = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join(
      '\n'
    )
    const out = printed({ buildLog })
    assert.match(out, /build log:/)
    assert.match(out, /line 25/)
    assert.doesNotMatch(out, /line 5\b/)
    assert.match(out, /5 earlier line\(s\)/)
    assert.doesNotMatch(out, /recorded no reason/)
  })

  test('points at the explicit log command rather than printing the whole log', () => {
    const out = printed({})
    assert.match(out, /pikku fabric deploy logs dep-1/)
    assert.doesNotMatch(out, /recorded no reason/)
  })

  test('says a missing log means the build never started, not that the project is broken', () => {
    assert.match(printed({}), /failed before a build started/)
  })
})
