import { spawnSync } from 'node:child_process'
import { parseErrors } from './parse-check.mjs'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

// pi extension: `write_files` — author MANY files in ONE model roundtrip.
//
// The whole cost of a build is serialized model calls: run therapy-sessions-651061
// (2026-08-11) spent 36 minutes on 82 calls averaging 26s each, and most of those
// calls carried a single one-file `write` or `edit`. The per-call price (TTFT +
// context re-read) is flat whatever the call carries, so the lever is not a faster
// single write — it is fewer, bigger generations: leap-style "apply" turns that emit
// a whole feature's files at once. The builtin `write` is one file per call and
// prose exhortations to batch ("ONE TURN, EVERY TOOL CALL YOU ALREADY KNOW YOU
// NEED") measurably did not move the models, so the batch shape is a tool now.
//
// Path policy is NOT enforced here on purpose: guard-extension.mjs is the single
// definition of what may be written where (generated output, the design/ fence,
// knowledge/, .env), and it checks `write_files` calls file-by-file exactly like
// `write` calls. Keeping zero rules here means the two can never disagree.
//
// Loaded via `pi -e <path>` (PI_WRITE_FILES_EXTENSION; see entrypoint.sh + pi-drive.ts).

// The models write MINIFIED source — a whole function, its schemas and its body on one
// physical line — and nothing downstream ever put the newlines back. Run hmt37a2cj died
// on six TypeScript errors that were all reported as `get-pet.function.ts:6`, columns 139
// to 659: a model editing by string match cannot act on that, every attempted fix
// regenerated the same six, and the run burned its whole milestone-1 budget there.
//
// The project already depends on oxfmt and already ships a `format` script; it had simply
// never been run on anything the agent wrote. Formatting here is what makes a compiler
// diagnostic addressable at all, so it happens at the moment of writing rather than at a
// gate — by gate time the agent has already re-read the unreadable file a dozen times.
//
// Best-effort by construction: oxfmt leaves a file it cannot parse exactly as written
// (and still formats the rest of the batch), so a syntax error surfaces from the
// typechecker as it always did rather than from a failed write.
const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const GENERATED = /\.gen\.[jt]sx?$|[/\\]\.pikku[/\\]/

// Formatting a file REWRITES the text the agent is holding anchors against: across four
// killed milestone-1 runs, 19 of 51 failed anchored edits had a write as the last touch on
// that file. But the reason oxfmt runs at write time at all is that a MINIFIED file makes
// every compiler diagnostic unactionable (hmt37a2cj: six errors all at `:6`, columns 139
// to 659), and that is only true of minified files. So reformat exactly those, and leave a
// file the model wrote at a sane width character-for-character as it sent it. `pikku
// all` does not reformat it either.
const MINIFIED_LINE = 200

function isMinified(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').some((l) => l.length > MINIFIED_LINE)
  } catch {
    return false
  }
}

function formatWritten(cwd, paths) {
  const targets = paths.filter((p) => FORMATTABLE.test(p) && !GENERATED.test(p) && isMinified(p))
  if (targets.length === 0) return false
  const bin = join(cwd, 'node_modules/.bin/oxfmt')
  // No project config means oxfmt's own defaults — semicolons and double quotes, the
  // opposite of what every file in the template already uses. Formatting into a style
  // the rest of the repo contradicts is worse than leaving the line long, so projects
  // cloned before the template shipped its .oxfmtrc.json are left alone.
  if (!existsSync(bin) || !existsSync(join(cwd, '.oxfmtrc.json'))) return false
  const run = spawnSync(bin, targets, { cwd, stdio: 'ignore', timeout: 30_000 })
  return run.error == null
}

const MESSAGE_CATALOG = /(^|[/\\])messages[/\\][a-z]{2}(-[A-Za-z]{2,})?\.json$/

function mergeCatalog(abs, content) {
  let next
  try {
    next = JSON.parse(content)
  } catch {
    return null
  }
  if (!next || typeof next !== 'object' || Array.isArray(next)) return null
  let prev
  try {
    prev = JSON.parse(readFileSync(abs, 'utf8'))
  } catch {
    return null
  }
  if (!prev || typeof prev !== 'object' || Array.isArray(prev)) return null
  const kept = Object.keys(prev).filter((k) => !k.startsWith('$') && !(k in next))
  if (kept.length === 0) return null
  const merged = { ...prev, ...next }
  return { content: `${JSON.stringify(merged, null, 2)}\n`, kept }
}

const SINGLE_FILE_WRITE_TOOLS = ['write', 'edit', 'multi_edit', 'apply_patch']

const parameters = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      minItems: 1,
      description:
        'Every file this step produces, in one call — a whole feature (functions, wires, ' +
        'page, components, stories), a whole contract, a whole batch of fixes.',
      items: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path relative to the project root. Parent dirs are created.',
          },
          content: {
            type: 'string',
            description: 'The COMPLETE file contents. The file is replaced, never appended — except a ' +
              '`messages/<locale>.json` catalog, which MERGES, so send only the keys you are ' +
              'adding or changing.',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  required: ['files'],
}

export default function (pi) {
  pi.registerTool({
    name: 'write_files',
    label: 'Write files',
    description:
      'Write MANY files in one call — the primary way to author code. Each entry replaces ' +
      'the whole file at its path (parent directories are created). Use this whenever you ' +
      "already know the contents of more than one file: all of a feature's files together, " +
      'the whole declared contract, every fix from a verify run. Reach for the single-file ' +
      '`write` only for a genuinely lone file, and `edit` only to change part of an ' +
      'existing file you did not fully regenerate. Keep one call to roughly a feature ' +
      '(~10-15 files): a call that would not fit the output budget gets truncated and ' +
      'fails validation, so split a whole app into a few feature-sized calls, never into ' +
      'dozens of one-file calls.',
    promptSnippet:
      'write_files: write a BATCH of files in one call (a whole feature, a whole contract, ' +
      'a whole round of fixes) — prefer it over repeated single-file write calls.',
    parameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const written = []
      const formattable = []
      const failed = []
      const preserved = []
      for (const file of params.files ?? []) {
        const path = file?.path
        let content = file?.content
        if (typeof path !== 'string' || !path || typeof content !== 'string') {
          failed.push(`${String(path)}: entry must have a string path and string content`)
          continue
        }
        try {
          const abs = isAbsolute(path) ? path : resolve(ctx.cwd, path)
          const merged = MESSAGE_CATALOG.test(path) ? mergeCatalog(abs, content) : null
          if (merged) {
            content = merged.content
            preserved.push({ path, kept: merged.kept })
          }
          mkdirSync(dirname(abs), { recursive: true })
          writeFileSync(abs, content, 'utf8')
          formattable.push(abs)
          const lines = content.length === 0 ? 0 : content.split('\n').length
          written.push(`${path} (${lines} lines)`)
        } catch (err) {
          failed.push(`${path}: ${err?.message ?? String(err)}`)
        }
      }
      const formatted = formatWritten(ctx.cwd, formattable)
      const unparseable = parseErrors(ctx.cwd, formattable)
      const parts = []
      if (written.length) parts.push(`Wrote ${written.length} file(s):\n${written.join('\n')}`)
      if (failed.length) parts.push(`FAILED ${failed.length} file(s):\n${failed.join('\n')}`)
      if (formatted)
        parts.push(
          'Source was reformatted on write, so line and column numbers in later diagnostics ' +
            'are real. Read a file before you `edit` it — the text on disk is no longer ' +
            'character-for-character what you sent.',
        )
      for (const row of preserved)
        parts.push(
          `${row.path}: MERGED — ${row.kept.length} key(s) already in the catalog that you ` +
            `did not send were kept (${row.kept.slice(0, 8).join(', ')}` +
            `${row.kept.length > 8 ? ', …' : ''}). A message catalog write never drops keys: ` +
            'the template pages you have not opened call them, and the deploy compiles the ' +
            'catalog from scratch. Send only the keys you are adding or changing.',
        )
      if (unparseable) parts.push(unparseable)
      return {
        content: [{ type: 'text', text: parts.join('\n\n') || 'No files written.' }],
        details: { written: written.length, failed: failed.length },
        isError: unparseable != null || (failed.length > 0 && written.length === 0),
      }
    },
  })

  // `write` and `edit` bypass the tool above, and an edit spliced into a minified line
  // leaves it minified. Same pass, applied once the builtin has actually written.
  pi.on('tool_result', (event) => {
    if (!SINGLE_FILE_WRITE_TOOLS.includes(event.toolName) || event.isError) return
    const input = event.input ?? {}
    const path = input.path ?? input.file_path ?? input.filePath ?? input.filename
    if (typeof path !== 'string' || !path) return
    const cwd = process.cwd()
    formatWritten(cwd, [isAbsolute(path) ? path : resolve(cwd, path)])
  })
}
