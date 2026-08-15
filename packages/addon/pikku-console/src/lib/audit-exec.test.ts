import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findBin, readAuditReport, spawnProcess } from './audit-exec.js'

const scratch = () => mkdtempSync(join(tmpdir(), 'pikku-audit-exec-'))

const executable = (dir: string, name: string, body: string) => {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, body)
  chmodSync(path, 0o755)
  return path
}

describe('findBin', () => {
  test('finds the binary in the nearest node_modules/.bin', () => {
    const root = scratch()
    const nested = join(root, 'packages', 'api')
    mkdirSync(nested, { recursive: true })
    const bin = executable(join(nested, 'node_modules', '.bin'), 'pikku', '')
    assert.equal(findBin('pikku', nested), bin)
  })

  test('walks up to a hoisted binary in the workspace root', () => {
    const root = scratch()
    const nested = join(root, 'packages', 'api', 'src')
    mkdirSync(nested, { recursive: true })
    const bin = executable(join(root, 'node_modules', '.bin'), 'pikku', '')
    assert.equal(findBin('pikku', nested), bin)
  })

  test('prefers the closest binary over the hoisted one', () => {
    const root = scratch()
    const nested = join(root, 'packages', 'api')
    mkdirSync(nested, { recursive: true })
    executable(join(root, 'node_modules', '.bin'), 'pikku', '')
    const local = executable(join(nested, 'node_modules', '.bin'), 'pikku', '')
    assert.equal(findBin('pikku', nested), local)
  })

  // Falling back to the bare name lets PATH resolve it — a globally installed
  // CLI still works rather than the call failing outright.
  test('falls back to the bare name when nothing is installed', () => {
    assert.equal(findBin('pikku', scratch()), 'pikku')
  })
})

describe('spawnProcess', () => {
  const sh = (body: string) => {
    const dir = scratch()
    return executable(dir, 'script.sh', `#!/bin/sh\n${body}`)
  }

  test('resolves when the process succeeds', async () => {
    await spawnProcess(sh('exit 0'), [], scratch())
  })

  // `pikku audit` exits non-zero precisely when it finds advisories, having
  // written a perfectly valid report — rejecting there would hide findings.
  test('is lenient about a non-zero exit by default', async () => {
    await spawnProcess(sh('exit 3'), [], scratch())
  })

  test('rejects on a non-zero exit when asked to', async () => {
    await assert.rejects(
      spawnProcess(sh('exit 3'), [], scratch(), { failOnNonZero: true }),
      /exit 3/
    )
  })

  test('includes stderr so the failure is diagnosable', async () => {
    await assert.rejects(
      spawnProcess(
        sh('echo "no matching version" >&2; exit 1'),
        [],
        scratch(),
        {
          failOnNonZero: true,
        }
      ),
      /no matching version/
    )
  })

  test('rejects when the command does not exist', async () => {
    await assert.rejects(
      spawnProcess(join(scratch(), 'nope'), [], scratch()),
      /ENOENT/
    )
  })

  // A hung `bun install` must not hold the console request open forever.
  test('kills and rejects a process that outruns its timeout', async () => {
    const started = Date.now()
    await assert.rejects(
      spawnProcess(sh('sleep 30'), [], scratch(), { timeoutMs: 250 }),
      /timed out after 250ms/
    )
    assert.ok(Date.now() - started < 5_000)
  })

  test('does not fire the timeout for a process that finished in time', async () => {
    await spawnProcess(sh('exit 0'), [], scratch(), { timeoutMs: 10_000 })
  })
})

describe('readAuditReport', () => {
  const metaService = (readFile: () => Promise<string | null>) =>
    ({ readFile }) as never

  test('parses the report', async () => {
    const report = await readAuditReport(
      metaService(async () => JSON.stringify({ schemaVersion: 1, tool: 'bun' }))
    )
    assert.equal(report?.tool, 'bun')
  })

  test('is null when there is no report yet', async () => {
    assert.equal(await readAuditReport(metaService(async () => null)), null)
    assert.equal(await readAuditReport(metaService(async () => '')), null)
  })

  test('is null rather than throwing on a malformed report', async () => {
    assert.equal(
      await readAuditReport(metaService(async () => '{ truncated')),
      null
    )
  })

  test('is null rather than throwing when the read itself fails', async () => {
    assert.equal(
      await readAuditReport(
        metaService(async () => {
          throw new Error('EACCES')
        })
      ),
      null
    )
  })
})
