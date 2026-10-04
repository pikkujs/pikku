import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

const PARSEABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const SKIP = /\.gen\.[jt]sx?$|[/\\]\.pikku[/\\]/
const SYNTAX_EXIT = 2

/**
 * Syntax errors in source that was just written, from oxfmt's parser (~15ms, already
 * installed). Exit 2 is a parse failure; exit 1 is only a style diff and is not an error
 * here. Without this a broken file lands silently and surfaces a whole codegen later as a
 * truncated `TS1005: ',' expected` with no line — the parse-error family was 4 of the TS
 * codes across five killed milestone-1 runs.
 */
export function parseErrors(cwd, paths) {
  const targets = paths.filter((p) => PARSEABLE.test(p) && !SKIP.test(p) && existsSync(p))
  if (targets.length === 0) return null
  const bin = join(cwd, 'node_modules/.bin/oxfmt')
  if (!existsSync(bin)) return null
  let run
  try {
    run = spawnSync(bin, ['--check', ...targets.map((p) => relative(cwd, p) || p)], {
      cwd,
      encoding: 'utf8',
      timeout: 30_000,
    })
  } catch {
    return null
  }
  if (run.error || run.status !== SYNTAX_EXIT) return null
  const lines = stripVTControlCharacters(`${run.stdout ?? ''}\n${run.stderr ?? ''}`).split('\n')
  const first = lines.findIndex((line) => /^\s*[x×] /.test(line))
  if (first === -1) return null
  const output = lines
    .slice(first)
    .filter((line) => !/^(Finished in|Error occurred when checking)/.test(line))
    .join('\n')
    .trim()
  if (!output) return null
  return (
    'THE FILE(S) BELOW DO NOT PARSE. They were written to disk exactly as you sent them, ' +
    'so nothing is lost — but nothing that imports them will compile, and `pikku all` ' +
    'will report this as a bare `TS1005`/`TS1128` with no context, a whole codegen from ' +
    'now. Fix it with an `edit_files` anchored at the line below, in this turn.\n\n' +
    output
  )
}
