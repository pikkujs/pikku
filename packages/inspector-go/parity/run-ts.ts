import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TsRunResult } from './ts-run.ts'

const TS_RUN = fileURLToPath(new URL('./ts-run.ts', import.meta.url))

/** Runs `ts-run.ts` in a fresh node process and reads back its result. */
export const runTypeScript = (
  mode: 'reference' | 'roundtrip',
  projectDir: string
): TsRunResult => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-parity-'))
  const outFile = join(dir, 'out.json')
  try {
    // The schema pass imports the project's sources through tsx, which reads
    // the tsconfig in the working directory for `paths`. Run where the CLI
    // runs, in the project, or `#pikku/*` falls back to package.json
    // `imports` and needs a built dist/.
    const run = spawnSync(
      'node',
      [TS_RUN, mode, resolve(projectDir), outFile],
      {
        cwd: resolve(projectDir),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      }
    )
    if (run.status !== 0) {
      throw new Error(
        `ts-run ${mode} ${projectDir} exited with ${run.status}:\n${run.stderr}`
      )
    }
    return JSON.parse(readFileSync(outFile, 'utf8'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
