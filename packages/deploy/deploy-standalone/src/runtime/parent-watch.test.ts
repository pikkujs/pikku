import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'

import { PARENT_PID_ENV, watchParentProcess } from './parent-watch.js'

const tick = () => delay(12)

describe('a sidecar that outlives the shell that spawned it', () => {
  it('does not watch when no parent pid was handed down', async () => {
    let orphaned = 0
    const watch = watchParentProcess({
      env: {},
      onOrphaned: () => orphaned++,
      intervalMs: 1,
    })
    try {
      assert.equal(watch.watching, false)
      await tick()
      assert.equal(orphaned, 0)
    } finally {
      watch.stop()
    }
  })

  it('ignores a pid that is not a positive integer', async () => {
    for (const value of ['', 'abc', '0', '-1', '1.5']) {
      const watch = watchParentProcess({
        env: { [PARENT_PID_ENV]: value },
        onOrphaned: () => assert.fail(`pid ${value} should not be watched`),
        intervalMs: 1,
      })
      assert.equal(watch.watching, false, `pid ${JSON.stringify(value)}`)
      await tick()
      watch.stop()
    }
  })

  it('stays quiet while the parent is alive', async () => {
    let orphaned = 0
    const watch = watchParentProcess({
      env: { [PARENT_PID_ENV]: '4242' },
      isAlive: () => true,
      onOrphaned: () => orphaned++,
      intervalMs: 1,
    })
    try {
      assert.equal(watch.watching, true)
      await tick()
      assert.equal(orphaned, 0)
    } finally {
      watch.stop()
    }
  })

  it('fires once when the parent goes away, and stops polling', async () => {
    let alive = true
    let orphaned = 0
    let probes = 0
    const watch = watchParentProcess({
      env: { [PARENT_PID_ENV]: '4242' },
      isAlive: () => {
        probes++
        return alive
      },
      onOrphaned: () => orphaned++,
      intervalMs: 1,
    })
    try {
      await tick()
      assert.equal(orphaned, 0)
      alive = false
      await tick()
      assert.equal(orphaned, 1, 'the orphan handler must run')
      const probesAtDeath = probes
      await tick()
      assert.equal(orphaned, 1, 'it must not fire again')
      assert.equal(probes, probesAtDeath, 'polling must stop after it fires')
    } finally {
      watch.stop()
    }
  })

  it('reads the pid the shell passes through the environment', () => {
    const watch = watchParentProcess({
      env: { [PARENT_PID_ENV]: String(process.pid) },
      onOrphaned: () => {},
      intervalMs: 60_000,
    })
    try {
      assert.equal(watch.watching, true)
      assert.equal(watch.parentPid, process.pid)
    } finally {
      watch.stop()
    }
  })

  it('treats this very process as alive by default, and a reaped pid as gone', () => {
    const watch = watchParentProcess({
      env: { [PARENT_PID_ENV]: String(process.pid) },
      onOrphaned: () => assert.fail('our own pid is alive'),
      intervalMs: 60_000,
    })
    watch.stop()

    // A pid that cannot exist: the default probe must report it gone rather
    // than throwing, or an orphaned sidecar would never notice.
    let orphaned = 0
    const dead = watchParentProcess({
      env: { [PARENT_PID_ENV]: '2147483646' },
      onOrphaned: () => orphaned++,
      intervalMs: 60_000,
    })
    dead.checkNow()
    dead.stop()
    assert.equal(orphaned, 1)
  })

  it('never keeps the process alive on its own', () => {
    const watch = watchParentProcess({
      env: { [PARENT_PID_ENV]: '4242' },
      isAlive: () => true,
      onOrphaned: () => {},
      intervalMs: 60_000,
    })
    try {
      assert.equal(
        watch.holdsProcessOpen,
        false,
        'the poll timer must be unref-ed'
      )
    } finally {
      watch.stop()
    }
  })

  it('is safe to stop twice', () => {
    const watch = watchParentProcess({
      env: { [PARENT_PID_ENV]: '4242' },
      isAlive: () => true,
      onOrphaned: () => {},
      intervalMs: 60_000,
    })
    watch.stop()
    watch.stop()
    assert.equal(watch.watching, false)
  })
})
