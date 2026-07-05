import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { IstanbulCoverageService } from './istanbul-coverage-service.js'

const FILE = '/proj/src/things.function.ts'

const seedCoverage = () => {
  ;(globalThis as any).__coverage__ = {
    [FILE]: {
      path: FILE,
      statementMap: {
        '0': { start: { line: 2, column: 2 }, end: { line: 2, column: 20 } },
        '1': { start: { line: 3, column: 4 }, end: { line: 3, column: 30 } },
        '2': { start: { line: 5, column: 2 }, end: { line: 6, column: 18 } },
      },
      s: { '0': 3, '1': 0, '2': 3 },
      branchMap: {},
      b: {},
      fnMap: {},
      f: {},
    },
  }
}

afterEach(() => {
  delete (globalThis as any).__coverage__
})

describe('IstanbulCoverageService', () => {
  test('takeCoverage converts __coverage__ statement counts into line hits', async () => {
    seedCoverage()
    const service = new IstanbulCoverageService()
    await service.start()
    const snapshot = await service.takeCoverage()
    assert.equal(snapshot.kind, 'line-hits')
    if (snapshot.kind !== 'line-hits') return
    const hits = snapshot.lineHits.get(FILE)
    assert.ok(hits, 'file should have line hits')
    assert.equal(hits.get(2), 3)
    assert.equal(hits.get(3), 0)
    assert.equal(hits.get(5), 3)
    assert.equal(
      hits.get(6),
      undefined,
      'counts attach to statement start lines only'
    )
  })

  test('reset zeroes counters so per-scenario attribution is possible', async () => {
    seedCoverage()
    const service = new IstanbulCoverageService()
    await service.reset()
    const snapshot = await service.takeCoverage()
    if (snapshot.kind !== 'line-hits') return assert.fail('expected line-hits')
    const hits = snapshot.lineHits.get(FILE)
    assert.equal(hits?.get(2), 0)
    assert.equal(hits?.get(5), 0)
  })

  test('takeCoverage with no __coverage__ global returns an empty snapshot', async () => {
    const service = new IstanbulCoverageService()
    const snapshot = await service.takeCoverage()
    if (snapshot.kind !== 'line-hits') return assert.fail('expected line-hits')
    assert.equal(snapshot.lineHits.size, 0)
  })
})
