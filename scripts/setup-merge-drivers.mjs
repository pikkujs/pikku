#!/usr/bin/env node
/**
 * Registers the merge drivers `.gitattributes` names.
 *
 * A driver lives in git config, which is per-clone and never travels with the
 * repository, so `.gitattributes` alone leaves `merge=api-report` pointing at
 * nothing and git silently falls back to an ordinary conflict. Running this
 * from `postinstall` is what makes a fresh clone behave like every other one.
 *
 * The only driver so far is the API report, which is generated from
 * packages/core's public surface: two branches that both touch that surface
 * rewrite the same ~9000 lines and collide on every rebase.
 *
 * The obvious driver — regenerate the report from the merged sources — does not
 * work, and quietly produces a wrong answer rather than failing. Git invokes a
 * driver while merging that one path, with the rest of the tree still
 * unmerged, so the generator reads the old sources and writes a report missing
 * exactly the API the incoming branch adds. A conflict-free wrong report is
 * worse than a conflict.
 *
 * So the driver keeps one side verbatim and lets the merge complete, and
 * `packages/core/src/api-report.test.ts` is what holds the line: it regenerates
 * against the finished tree and fails until `yarn api-report` has been run.
 * The conflict goes away; the guard does not.
 */
import { execFileSync } from 'node:child_process'

const DRIVERS = [
  {
    name: 'api-report',
    description: 'keep one side of packages/core/api-report.md and regenerate',
    // Git hands the driver %A already holding the current side and reads the
    // resolution back out of it, so succeeding without writing is how a driver
    // says "take this one".
    driver: 'true',
  },
]

const git = (...args) =>
  execFileSync('git', args, { stdio: 'pipe' }).toString().trim()

const isGitRepository = () => {
  try {
    return git('rev-parse', '--is-inside-work-tree') === 'true'
  } catch {
    return false
  }
}

// A published tarball has no .git, and `npm install`ing this package still runs
// postinstall. Nothing to register, and nothing worth failing over.
if (!isGitRepository()) {
  process.exit(0)
}

for (const { name, description, driver } of DRIVERS) {
  git('config', `merge.${name}.name`, description)
  git('config', `merge.${name}.driver`, driver)
}
