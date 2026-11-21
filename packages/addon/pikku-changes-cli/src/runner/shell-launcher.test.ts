import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { shellLauncher } from './shell-launcher.js'
import type { AgentExit } from './types.js'

const dirs: string[] = []
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const change = (worktree: string) => ({
  id: '7',
  title: '#7 Seven',
  groupId: 'g-7',
  worktree,
})

describe('shellLauncher', () => {
  test('runs the command in the agent directory with the prompt on stdin and the change in its environment; output is activity', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pikku-agent-'))
    dirs.push(cwd)
    const logDir = join(cwd, 'logs')
    const run = await shellLauncher(
      'cat > prompt.txt; echo "$PIKKU_CHANGE_ID $EXTRA"; exit 3',
      { logDir }
    ).start({
      cwd,
      env: { PIKKU_CHANGE_ID: '7', EXTRA: 'x' },
      prompt: 'build #7',
      change: change(cwd),
      kind: 'build',
    })
    let activity = 0
    run.onActivity(() => (activity += 1))
    const exit = await new Promise<AgentExit>((done) => run.onExit(done))
    expect(exit.code).toBe(3)
    expect(readFileSync(join(cwd, 'prompt.txt'), 'utf8')).toBe('build #7')
    expect(activity).toBeGreaterThan(0)
    // A listener added after the end still hears it.
    expect(
      (await new Promise<AgentExit>((done) => run.onExit(done))).code
    ).toBe(3)
    await new Promise((r) => setTimeout(r, 50))
    const { readdirSync } = await import('node:fs')
    const [log] = readdirSync(logDir)
    expect(log).toMatch(/^build-7-\d+\.log$/)
    expect(readFileSync(join(logDir, log!), 'utf8')).toBe('7 x\n')
  })

  test('a stop takes the processes the agent started with it', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'pikku-agent-'))
    dirs.push(cwd)
    const run = await shellLauncher('sleep 30 & echo $! > child.pid; wait', {
      killGraceMs: 200,
    }).start({ cwd, env: {}, prompt: '', change: null, kind: 'repair' })
    for (
      const end = Date.now() + 5000;
      !existsSync(join(cwd, 'child.pid')) && Date.now() < end;
    )
      await new Promise((r) => setTimeout(r, 20))
    const child = Number(readFileSync(join(cwd, 'child.pid'), 'utf8'))
    expect(alive(child)).toBe(true)
    const exited = new Promise<AgentExit>((done) => run.onExit(done))
    run.stop()
    const exit = await exited
    expect(exit.signal ?? exit.code).toBeTruthy()
    for (const end = Date.now() + 3000; alive(child) && Date.now() < end;)
      await new Promise((r) => setTimeout(r, 20))
    expect(alive(child)).toBe(false)
  })
})
