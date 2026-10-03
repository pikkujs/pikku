import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { lookAtPages, lookReport, parseCritique, type Critic } from './look.js'
import type { CommandRunner } from './loop.js'

const project = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'builder-look-'))
  mkdirSync(join(cwd, 'shots'))
  return cwd
}

const pages = (cwd: string, shots: Record<string, { status?: number; error?: string; bytes?: string }>): CommandRunner & { calls: string[][] } => {
  const calls: string[][] = []
  const run = async (_cwd: string, args: string[], env?: Record<string, string>) => {
    calls.push(args)
    const width = env?.E2E_VIEWPORT_WIDTH ?? 'desktop'
    return {
      code: 0,
      output: JSON.stringify({
        shots: Object.entries(shots).map(([path, shot]) => {
          const file = join(cwd, 'shots', `${width}${path.replace(/\//g, '_')}.png`)
          if (!shot.error) writeFileSync(file, shot.bytes ?? path)
          return { path, file: shot.error ? null : file, httpStatus: shot.status ?? 200, error: shot.error, problems: [] }
        }),
      }),
    }
  }
  return Object.assign(run, { calls })
}

const critic = (verdicts: Record<string, 'pass' | 'high'>): Critic & { routes: string[] } => {
  const routes: string[] = []
  const grade: Critic = async ({ route, shots }) => {
    routes.push(route)
    assert.equal(shots.length, 2)
    return verdicts[route] === 'high'
      ? { verdict: 'fix', findings: [{ severity: 'high', issue: 'Flat gray theme', fix: 'Commit to a palette' }] }
      : { verdict: 'pass', findings: [] }
  }
  return Object.assign(grade, { routes })
}

describe('parseCritique', () => {
  test('reads the JSON out of a chatty answer', () => {
    const critique = parseCritique('Here you go:\n{"verdict":"fix","findings":[{"severity":"HIGH","issue":"x","fix":"y"}]}\n')
    assert.deepEqual(critique, { verdict: 'fix', findings: [{ severity: 'high', issue: 'x', fix: 'y' }] })
  })

  test('an answer with no JSON is ungraded, not a pass', () => {
    assert.equal(parseCritique('looks great').verdict, 'ungraded')
  })
})

describe('lookAtPages', () => {
  const apps = [{ slug: 'app', url: 'http://localhost:1' }]

  test('photographs desktop and phone, signed in as the persona', async () => {
    const cwd = project()
    const run = pages(cwd, { '/': {} })
    await lookAtPages(cwd, { apps, persona: 'owner', milestone: 'm1', run, critic: critic({}) })
    assert.equal(run.calls.length, 2)
    assert.deepEqual(run.calls[0]!.slice(-2), ['--as', 'owner'])
  })

  test('a page that fails to load is a HIGH finding without asking the critic', async () => {
    const cwd = project()
    const grade = critic({})
    const looks = await lookAtPages(cwd, { apps, milestone: 'm1', run: pages(cwd, { '/': { status: 500 } }), critic: grade })
    assert.deepEqual(grade.routes, [])
    assert.match(lookReport(looks) ?? '', /HTTP 500/)
  })

  test('a passed page is not graded again, a failing one is once it changes', async () => {
    const cwd = project()
    const first = critic({ '/': 'pass', '/app': 'high' })
    const looks = await lookAtPages(cwd, { apps, milestone: 'm1', run: pages(cwd, { '/': {}, '/app': {} }), critic: first })
    assert.match(lookReport(looks) ?? '', /\/app[\s\S]*Flat gray theme/)

    const unchanged = critic({})
    await lookAtPages(cwd, { apps, milestone: 'm1', run: pages(cwd, { '/': { bytes: 'new' }, '/app': {} }), critic: unchanged })
    assert.deepEqual(unchanged.routes, [])

    const fixed = critic({ '/app': 'pass' })
    const after = await lookAtPages(cwd, { apps, milestone: 'm1', run: pages(cwd, { '/': {}, '/app': { bytes: 'fixed' } }), critic: fixed })
    assert.deepEqual(fixed.routes, ['/app'])
    assert.equal(lookReport(after), null)
  })

  test('a new milestone grades every page again', async () => {
    const cwd = project()
    await lookAtPages(cwd, { apps, milestone: 'm1', run: pages(cwd, { '/': {} }), critic: critic({}) })
    const next = critic({})
    await lookAtPages(cwd, { apps, milestone: 'm2', run: pages(cwd, { '/': {} }), critic: next })
    assert.deepEqual(next.routes, ['/'])
  })
})
