#!/usr/bin/env node
// A stand-in for `pikku ui pages compare` in the page gate's tests: it opens no browser and starts no
// server. Only `ui pages compare --reference <dir> --app <app> --page <ids> [--widths <w>] --out <dir>`.
//
// What it does comes from the JSON file named by FAKE_COMPARE:
//   mode     report (default): writes <out>/report.json and an <id>-<width>.diff.png per row
//            none: writes nothing and exits 0      garbled: writes a report.json that is not JSON
//            exit: prints an error and exits 1     stray: a report, and a file outside <out> too
//            drop: a report without its last row  stale: a report dated before the run
//   rows     { "<id>-<width>": percent | partial row }; a page and width not listed differs `default` % (5)
//   fixed    { file, contains, percent }: when <file> in the checkout holds <contains>, every page differs `percent` %
//   dirty    the report's `dirty`
//   log      a file each call appends its arguments and PIKKU_CHANGES_PARALLEL to
import { execFile } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const args = process.argv.slice(2)
const scenario = process.env.FAKE_COMPARE
  ? JSON.parse(readFileSync(process.env.FAKE_COMPARE, 'utf8'))
  : {}
if (scenario.log)
  appendFileSync(
    scenario.log,
    `${JSON.stringify({
      args,
      parallel: process.env.PIKKU_CHANGES_PARALLEL ?? null,
      chromium: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? null,
      cwd: process.cwd(),
    })}\n`
  )
if (args.slice(0, 3).join(' ') !== 'ui pages compare') {
  process.stderr.write(`fake compare: unexpected ${args.join(' ')}\n`)
  process.exit(2)
}
const flag = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const mode = scenario.mode ?? 'report'
if (mode === 'exit') {
  process.stderr.write(
    'Could not start apps/app for the compare (bun run dev): port in use\n'
  )
  process.exit(1)
}
const out = flag('--out')
mkdirSync(out, { recursive: true })
if (mode === 'none') process.exit(0)
if (mode === 'garbled') {
  writeFileSync(join(out, 'report.json'), '{"rows": [ {"id": "index", "wid')
  process.exit(0)
}
const ids = flag('--page').split(',')
const widths = flag('--widths')?.split(',').map(Number)
const shots = readdirSync(flag('--reference'))
  .map((name) => name.match(/^(.+)-(\d+)\.(jpe?g|png)$/))
  .filter(
    (m) => m && ids.includes(m[1]) && (!widths || widths.includes(Number(m[2])))
  )
  .map((m) => ({ id: m[1], width: Number(m[2]) }))
const fixed =
  scenario.fixed &&
  existsSync(scenario.fixed.file) &&
  readFileSync(join(process.cwd(), scenario.fixed.file), 'utf8').includes(
    scenario.fixed.contains
  )
const rows = shots.map(({ id, width }) => {
  const given = scenario.rows?.[`${id}-${width}`]
  const partial =
    typeof given === 'object'
      ? given
      : {
          changedPercent: fixed
            ? scenario.fixed.percent
            : (given ?? scenario.default ?? 5),
        }
  const status = partial.status ?? 'compared'
  const diff = join(out, `${id}-${width}.diff.png`)
  if (status === 'compared') writeFileSync(diff, 'not really a png')
  return {
    id,
    width,
    path: id === 'index' ? '/' : `/${id}`,
    status,
    changedPercent: status === 'compared' ? 0 : null,
    referenceHeight: status === 'compared' ? 3000 : null,
    ourHeight: status === 'compared' ? 2400 : null,
    heightDiff: status === 'compared' ? -600 : null,
    httpStatus: status === 'missing' ? 404 : 200,
    diff: status === 'compared' ? diff : null,
    ours: null,
    sections: null,
    ...partial,
  }
})
if (mode === 'drop') rows.pop()
if (mode === 'stray')
  writeFileSync(
    join(process.cwd(), 'stray.txt'),
    'written outside the out folder\n'
  )
const gitSha = (
  await promisify(execFile)('git', ['rev-parse', 'HEAD'], {
    cwd: process.cwd(),
  })
).stdout.trim()
writeFileSync(
  join(out, 'report.json'),
  JSON.stringify({
    app: flag('--app'),
    reference: flag('--reference'),
    gitSha,
    dirty: scenario.dirty ?? false,
    generatedAt:
      mode === 'stale' ? '2020-01-01T00:00:00.000Z' : new Date().toISOString(),
    rows,
    failed: [],
  })
)
process.stdout.write(`compared ${rows.length} page(s)\n`)
