import { isDependencyFile, schemaFiles } from '../lib/migration-files.js'
import { commitFixes } from './commit.js'
import { HarnessInfraError, type Finding } from './finding.js'
import { gitIn } from './git.js'
import { cleanOutput, runCli, type RawOutput } from './run-cli.js'
import { guardWrites, snapshotTree } from './write-guard.js'

/**
 * The db step before a changeset's check, with the pinned local pikku CLI: `pikku db generate` writes the migrations
 * `db/tables.ts` asks for (never with `--allowDestructive`), the engine commits the ones it wrote, then `pikku db
 * migrate` applies them to the worktree's dev database and regenerates the database types (`pikku db reset
 * --no-seed` rebuilds that database when it applied a migration the builder since deleted or edited), and `pikku
 * all` the rest.
 * Without it the check type-checks against a database migrated when the worktree was prepared.
 */
export type HarnessMigrate = {
  /** Absolute path of the local pikku CLI (its dist/bin/pikku.js), never the worktree's own. */
  binary: string
  /** Longest each command may take. Defaults to 10 minutes. */
  timeoutMs?: number
}

/** The step's name in events and feedback. */
export const DB_STEP = 'db'

/** Generated code; the dev database is git-ignored and never seen by the guard. */
const GENERATED = ['.pikku/**', '**/.pikku/**']
/** What `db generate` may write besides generated code: SQL migrations, committed by the engine. */
const MIGRATIONS = ['db/*/*.sql', '**/db/*/*.sql']

/**
 * Whether the worktree needs the db step: the changeset's commits (against the commit it was cut from) touch a
 * Pikku project's `db/tables.ts` or one of its migrations, a package.json or the lockfile.
 */
export const needsMigrate = async (
  worktree: string,
  base: string,
  gitBinary?: string
): Promise<boolean> => {
  const git = gitIn(worktree, gitBinary)
  const changed = (await git(['diff', '--name-only', `${base}...HEAD`]))
    .split('\n')
    .map((file) => file.trim())
    .filter(Boolean)
  if (changed.some(isDependencyFile)) return true
  return (await schemaFiles(git, [base, 'HEAD'], changed)).length > 0
}

const LOSES_DATA = /db\/tables\.ts asks for changes that lose data/
const REFUSED = /refused to write the migration for db\/tables\.ts/

/**
 * `db generate` refuses a declaration that loses data (it asks only on a terminal) or one it cannot write: the
 * builder's to settle, so a finding. Anything else that fails is the command's, and runCli throws it as infra.
 */
export const parseDbGenerate = ({
  stdout,
  stderr,
  code,
}: RawOutput): Finding[] => {
  if (code === 0) return []
  const lines = cleanOutput(`${stdout}\n${stderr}`).split('\n')
  const destructive = lines.some((line) => LOSES_DATA.test(line))
  const refused = lines.some((line) => REFUSED.test(line))
  if (!destructive && !refused) return []
  const said = [
    ...new Set(
      lines
        .filter(
          (line) => /^\s{2}\S/.test(line) && !/--allowDestructive/.test(line)
        )
        .map((line) => `  ${line.trim()}`)
    ),
  ].join('\n')
  return [
    {
      file: 'db/tables.ts',
      severity: 'high',
      rule: destructive ? 'harness/db-destructive' : 'harness/db-generate',
      message: destructive
        ? `db/tables.ts asks for changes that lose data (a DROP), which pikku db generate writes only with a person's approval:\n${said}\nNever pass --allowDestructive. If the change needs this, stop and say so in your reply: a person decides. Otherwise change db/tables.ts so nothing is dropped, commit, and stop.`
        : `pikku db generate refused to write the migration for db/tables.ts:\n${said}\nFix the declaration in db/tables.ts, run pikku db generate and pikku db migrate, commit, and stop.`,
    },
  ]
}

const ran = () => []

const DRIFT = /\[PKU-DB-DRIFT\]/

/**
 * `db migrate` refuses a dev database that applied a migration which is now gone or changed on disk: the builder
 * deleted or edited one it had migrated. That database is the worktree's own scratch (git-ignored), so it is
 * rebuilt from the committed migrations instead of judged; any other failure is infra.
 */
const parseDbMigrate = ({ stdout, stderr, code }: RawOutput): Finding[] =>
  code !== 0 && DRIFT.test(`${stdout}\n${stderr}`)
    ? [{ severity: 'low', rule: 'harness/db-drift', message: 'drift' }]
    : []

export type DbStepResult = {
  /** Findings for the builder (a refused `db generate`); migrate and codegen did not run. */
  findings: Finding[]
  /** The engine's commit of the migrations `db generate` wrote, when it wrote any. */
  commit?: string
}

/**
 * Runs the db step in the worktree. Run twice in a row, the second run writes and commits nothing. A command that
 * fails (other than a refusal of `db generate`), or a write outside generated code and a project's SQL migrations,
 * throws a HarnessInfraError with redacted output.
 */
export const runDbStep = async ({
  worktree,
  migrate,
  shortId,
  changeId,
  changeset,
  gitBinary,
  signal,
}: {
  worktree: string
  migrate: HarnessMigrate
  shortId: string
  changeId: string
  changeset: string
  gitBinary?: string
  signal?: AbortSignal
}): Promise<DbStepResult> => {
  const timeoutMs = migrate.timeoutMs ?? 600_000
  const pikku = (args: string[], parse: (raw: RawOutput) => Finding[] = ran) =>
    runCli(args, {
      cwd: worktree,
      binary: migrate.binary,
      parse,
      okCodes: [0],
      timeoutMs,
      ...(signal ? { signal } : {}),
    })
  const before = await snapshotTree(worktree, gitBinary)
  const findings = await pikku(['db', 'generate'], parseDbGenerate)
  const wrote = (
    await guardWrites({
      worktree,
      before,
      writes: [...GENERATED, ...MIGRATIONS],
      gate: `${DB_STEP} (pikku db generate)`,
      gitBinary,
    })
  ).filter((path) => path.endsWith('.sql'))
  let commit: string | undefined
  if (wrote.length) {
    const migrations = await schemaFiles(
      gitIn(worktree, gitBinary),
      ['HEAD'],
      wrote
    )
    const stray = wrote.filter((path) => !migrations.includes(path))
    if (stray.length)
      throw new HarnessInfraError(
        'write-outside-allowlist',
        `pikku db generate wrote SQL outside a Pikku project's db/<dir>/: ${stray.join(', ')}`
      )
    commit = await commitFixes({
      worktree,
      paths: wrote,
      gate: DB_STEP,
      shortId,
      changeId,
      changeset,
      message: 'generate migrations',
      gitBinary,
    })
  }
  if (findings.length) return { findings, ...(commit ? { commit } : {}) }
  const settled = await snapshotTree(worktree, gitBinary)
  const drift = await pikku(['db', 'migrate'], parseDbMigrate)
  if (drift.length) await pikku(['db', 'reset', '--no-seed'])
  await pikku(['all'])
  await guardWrites({
    worktree,
    before: settled,
    writes: GENERATED,
    gate: `${DB_STEP} (pikku db migrate, pikku all)`,
    gitBinary,
  })
  return { findings: [], ...(commit ? { commit } : {}) }
}
