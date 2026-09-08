import { describe, test, after, before } from 'node:test'
import assert from 'node:assert/strict'
import { V8CoverageService } from './v8-coverage-service.js'

const service = new V8CoverageService()

function coveredProbe(n: number): number {
  return n * 2
}

/**
 * Precise coverage is read through the inspector's Debugger domain, which not
 * every runtime that offers `node:inspector` implements — bun answers
 * `Debugger.enable` with "requires an active inspector". The service is node
 * tooling, so elsewhere there is nothing to assert rather than something to
 * fix, and probing the domain itself keeps a genuine node regression failing.
 */
const debuggerDomainAvailable = async (): Promise<boolean> => {
  const inspector = await import('node:inspector')
  const session = new inspector.Session()
  session.connect()
  try {
    await new Promise<void>((resolve, reject) => {
      session.post('Debugger.enable', (error) =>
        error ? reject(error) : resolve()
      )
    })
    return true
  } catch {
    return false
  } finally {
    session.disconnect()
  }
}

let available = true

describe('V8CoverageService', () => {
  before(async () => {
    available = await debuggerDomainAvailable()
  })

  after(async () => {
    if (available) await service.stop()
  })

  test('start + takeCoverage reports call counts for functions invoked after start', async (t) => {
    if (!available) return t.skip('inspector has no Debugger domain')
    await service.start()
    coveredProbe(21)

    const snapshot = await service.takeCoverage()
    assert.equal(snapshot.kind, 'v8-scripts')
    if (snapshot.kind !== 'v8-scripts') return
    const own = snapshot.scripts.find((s) =>
      s.url.includes('v8-coverage-service.test')
    )
    assert.ok(own, 'own test script should appear in precise coverage')
    const probe = own.functions.find((f) =>
      f.functionName.includes('coveredProbe')
    )
    assert.ok(probe, 'coveredProbe should be tracked')
    assert.ok(
      probe.ranges[0].count >= 1,
      `coveredProbe should have been counted, got ${probe.ranges[0].count}`
    )
  })

  test('reset clears call counts so attribution per run is possible', async (t) => {
    if (!available) return t.skip('inspector has no Debugger domain')
    coveredProbe(1)
    await service.reset()
    const snapshot = await service.takeCoverage()
    if (snapshot.kind !== 'v8-scripts') return assert.fail('expected scripts')
    const own = snapshot.scripts.find((s) =>
      s.url.includes('v8-coverage-service.test')
    )
    const probe = own?.functions.find((f) =>
      f.functionName.includes('coveredProbe')
    )
    const count = probe?.ranges[0].count ?? 0
    assert.equal(
      count,
      0,
      `after reset coveredProbe count should be 0, got ${count}`
    )
  })

  test('getScriptSource returns the executed source for mapping', async (t) => {
    if (!available) return t.skip('inspector has no Debugger domain')
    const snapshot = await service.takeCoverage()
    if (snapshot.kind !== 'v8-scripts') return assert.fail('expected scripts')
    const own = snapshot.scripts.find((s) =>
      s.url.includes('v8-coverage-service.test')
    )
    assert.ok(own)
    const source = await snapshot.getScriptSource(own.scriptId)
    assert.ok(
      source.includes('coveredProbe'),
      'script source should contain the probe function'
    )
  })
})
