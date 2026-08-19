import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const reportPath = join(packageRoot, 'api-report.md')

/**
 * `public-surface.json` pins the *names* a consumer can reach. That catches an
 * export appearing or vanishing and nothing else — adding a method to
 * `MetaService`, or making a field on `ChannelMeta` required, sails past it,
 * as does every type-only export. Those are the changes that break a
 * consumer's build, and the report's summary counts how many more of them
 * there are than there are names.
 *
 * So `api-report.md` records what each symbol *is*, and this fails when the
 * committed report and the code disagree.
 *
 * knowledge: decisions/internals/the-api-report-pins-members-not-just-names.md
 */
describe('the API report matches the code', () => {
  test('regenerating produces no diff', () => {
    const committed = readFileSync(reportPath, 'utf-8')

    execFileSync(
      'npx',
      ['tsx', join(packageRoot, 'scripts', 'generate-api-report.mts')],
      { cwd: packageRoot, stdio: 'pipe' }
    )
    const regenerated = readFileSync(reportPath, 'utf-8')

    if (committed !== regenerated) {
      // Restore, so a failing run does not leave the tree dirty.
      const committedLines = committed.split('\n')
      const regeneratedLines = regenerated.split('\n')
      const firstDiff = regeneratedLines.findIndex(
        (line, i) => line !== committedLines[i]
      )
      writeFileSync(reportPath, committed)

      assert.fail(
        'the public API changed but api-report.md was not regenerated.\n' +
          `First difference at line ${firstDiff + 1}:\n` +
          `  committed:   ${committedLines[firstDiff] ?? '(end of file)'}\n` +
          `  regenerated: ${regeneratedLines[firstDiff] ?? '(end of file)'}\n` +
          'Run `yarn api-report` and review the diff — a member added to an ' +
          'exported interface or class is a change consumers compile against.'
      )
    }
  })

  test('the report actually contains member-level detail', () => {
    // Guards the test above: a report of bare names would match itself forever
    // while pinning nothing that public-surface.json does not already pin.
    const report = readFileSync(reportPath, 'utf-8')

    assert.ok(
      /export interface MetaService \{[^}]*getHttpMeta/.test(report),
      'expected MetaService to be reported with its members'
    )
    assert.ok(
      !/^\w+: any$/m.test(report),
      'symbols reported as `any` mean re-export aliases are not being followed'
    )
  })
})

/**
 * Every branch that touches the public surface rewrites the whole report, so
 * two of them meeting is a ~9000-line conflict with no meaningful resolution
 * in it. A merge driver takes the conflict away; the test above is what still
 * insists on a report that matches the code.
 *
 * knowledge: decisions/internals/the-api-report-pins-members-not-just-names.md
 */
describe('merging the API report is not hand work', () => {
  const repoRoot = join(packageRoot, '..', '..')

  test('.gitattributes routes the report through the driver', () => {
    const attributes = readFileSync(join(repoRoot, '.gitattributes'), 'utf-8')

    assert.match(
      attributes,
      /^packages\/core\/api-report\.md\s+merge=api-report\b/m,
      'the report must name the merge driver, or git conflicts on it as usual'
    )
  })

  test('the setup script registers the driver as a plain take-one-side', () => {
    // Against a throwaway repository rather than this one: a driver is written
    // to `.git/config`, which every worktree of a checkout shares, so running
    // this in place would reach into whatever else is checked out beside it.
    const sandbox = mkdtempSync(join(tmpdir(), 'pikku-merge-driver-'))
    try {
      execFileSync('git', ['init', '--quiet', sandbox], { stdio: 'pipe' })
      execFileSync(
        'node',
        [join(repoRoot, 'scripts', 'setup-merge-drivers.mjs')],
        { cwd: sandbox, stdio: 'pipe' }
      )
      const driver = execFileSync(
        'git',
        ['config', '--local', 'merge.api-report.driver'],
        { cwd: sandbox, stdio: 'pipe' }
      )
        .toString()
        .trim()

      // `true` writes nothing and succeeds, which is how a driver tells git to
      // keep the side already in %A. Anything that regenerates the report is
      // the trap this pins shut: git runs a driver while merging that one
      // path, with the rest of the tree still unmerged, so the generator reads
      // the old sources and resolves to a report missing exactly the API the
      // incoming branch adds — conflict-free and wrong, which is worse than a
      // conflict. The regeneration belongs to the guard above, which runs
      // against a finished tree.
      assert.equal(
        driver,
        'true',
        'the driver must resolve to one side verbatim and run nothing'
      )
    } finally {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })

  test('postinstall runs the setup, so a fresh clone is not left without it', () => {
    const manifest = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf-8')
    )

    assert.match(manifest.scripts.postinstall, /setup-merge-drivers\.mjs/)
  })
})
