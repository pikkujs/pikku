import { spawnSync } from 'node:child_process'
import { parseErrors } from './parse-check.mjs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

// pi extension: `edit_files` — many anchored edits, in ONE call, resolved against the
// file as it was when the call started.
//
// Measured over four killed milestone-1 runs (hmt57cooy, hmt57cj74, hmt56bkyh,
// hmt54afyh): 51 anchored edits failed, ~30% of every edit attempted, and each one costs a
// full model roundtrip. The cause is staleness, not carelessness -- the median failing
// anchor is against a file the agent last saw SEVEN calls earlier, and only 7 of the 51
// were within two calls. The file moved underneath it in between: `write_files` runs oxfmt
// (19 of the 51 had a write as the last touch), or the agent's own earlier edits replaced
// the text, or it had never opened the file at all (9 of the 51).
//
// So resolve every anchor against what is on disk AT CALL TIME, take a whole batch at once
// so a file's edits cannot invalidate each other, fall back to a whitespace-insensitive
// match when only formatting moved, and when nothing matches say WHERE the near miss was so
// the retry happens in the same turn instead of costing a re-read plus another roundtrip.
// Anchors are located in the original text and spliced back-to-front, which is what stops
// edit #1 from invalidating edit #3 -- the `edits[N] could not be found` family.
const FORMATTABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const GENERATED = /\.gen\.[jt]sx?$|[/\\]\.pikku[/\\]/

function formatWritten(cwd, paths) {
  const targets = paths.filter((p) => FORMATTABLE.test(p) && !GENERATED.test(p))
  if (targets.length === 0) return false
  const bin = join(cwd, 'node_modules/.bin/oxfmt')
  if (!existsSync(bin) || !existsSync(join(cwd, '.oxfmtrc.json'))) return false
  const run = spawnSync(bin, targets, { cwd, stdio: 'ignore', timeout: 30_000 })
  return run.error == null
}

const WS = /\s+/g

/**
 * Text with formatting removed, plus the original offset every surviving character came
 * from. Whitespace between two word characters collapses to one space (so `const fn` never
 * becomes `constfn` and cannot match a different identifier); everywhere else it is dropped
 * outright, which is what makes `(a,b)` match a formatter's `(a, b)`.
 */
function normalize(text) {
  const isWord = (c) => c !== undefined && /[A-Za-z0-9_$]/.test(c)
  let out = ''
  const map = []
  let wsStart = -1
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      if (wsStart < 0) wsStart = i
      continue
    }
    if (wsStart >= 0) {
      if (out.length > 0 && isWord(out[out.length - 1]) && isWord(ch)) {
        out += ' '
        map.push(wsStart)
      }
      wsStart = -1
    }
    out += ch
    map.push(i)
  }
  return { out, map }
}

function allIndexes(haystack, needle) {
  const hits = []
  if (!needle) return hits
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return hits
    hits.push(at)
    from = at + 1
  }
}

/** The line whose word set best overlaps the anchor's first non-blank line. */
function nearMiss(content, old) {
  const anchor = old
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 3)
  if (!anchor) return null
  const want = new Set(anchor.split(WS).filter((w) => w.length > 0))
  if (want.size === 0) return null
  const lines = content.split('\n')
  let best = -1
  let bestScore = 0
  lines.forEach((line, i) => {
    let score = 0
    for (const w of new Set(line.trim().split(WS))) if (want.has(w)) score++
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })
  if (best < 0 || bestScore < 2) return null
  const from = Math.max(0, best - 2)
  const slice = lines.slice(from, Math.min(lines.length, best + 3))
  return slice.map((l, i) => `${String(from + i + 1).padStart(5)}| ${l}`).join('\n')
}

function locate(content, old, replaceAll) {
  const exact = allIndexes(content, old)
  if (exact.length === 1 || (replaceAll && exact.length > 0)) {
    return { spans: exact.map((at) => ({ start: at, end: at + old.length })) }
  }
  if (exact.length > 1) {
    return {
      error: `matched ${exact.length} places exactly. Add surrounding lines until the anchor is unique, or pass "replace_all": true.`,
    }
  }

  const hay = normalize(content)
  const needle = normalize(old).out
  const loose = allIndexes(hay.out, needle)
  if (loose.length === 1 || (replaceAll && loose.length > 0)) {
    return {
      spans: loose.map((at) => ({
        start: hay.map[at],
        end: (hay.map[at + needle.length - 1] ?? hay.map[hay.map.length - 1]) + 1,
      })),
      loose: true,
    }
  }
  if (loose.length > 1) {
    return {
      error: `no exact match, and ignoring whitespace it matched ${loose.length} places. Add surrounding lines until the anchor is unique.`,
    }
  }
  return { error: 'not found, even ignoring whitespace.', near: nearMiss(content, old) }
}

const parameters = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      description:
        'Every anchored change this step makes, across as many files as needed, in one call.',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root.' },
          old: {
            type: 'string',
            description:
              'The text to replace. Whitespace does not have to match the file exactly; ' +
              'the anchor only has to be unique.',
          },
          new: { type: 'string', description: 'The replacement text.' },
          replace_all: {
            type: 'boolean',
            description: 'Replace every occurrence instead of requiring a unique anchor.',
          },
        },
        required: ['path', 'old'],
      },
    },
  },
  required: ['edits'],
}

export default function (pi) {
  pi.registerTool({
    name: 'edit_files',
    label: 'Edit files',
    description:
      'Apply MANY anchored edits in one call, across one or more files — the primary way ' +
      'to change existing code. Every anchor is resolved against the file as it is on ' +
      'disk right now, so edits in the same call never invalidate each other and you can ' +
      'fix a whole verify run at once. Whitespace in the anchor does not have to match the ' +
      'file character-for-character; it only has to be unique. Prefer this over repeated ' +
      'single-file `edit` calls, and use `write_files` when you are regenerating whole files.',
    promptSnippet:
      'edit_files: apply a BATCH of anchored edits in one call (a whole round of fixes, ' +
      'across several files) — prefer it over repeated single-file edit calls.',
    parameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const byPath = new Map()
      const applied = []
      const failed = []
      // A malformed edit is REPORTED, never skipped, and the schema no longer rejects the
      // call outright. A truncated tool call — the generation cut mid-JSON, so the last
      // edit lost its `new` — used to come back as a bare validation error naming a field
      // the model could not see it had dropped; with `minItems: 1` also enforced, its
      // recovery attempt of `{"edits": []}` was rejected in the same unhelpful shape.
      // support-desk's realtime-progress turn spent its last four calls in exactly that
      // loop and settled with no reply, no commit and fifteen files stranded uncommitted.
      // A schema rejection carries no per-edit detail and teaches nothing; a tool RESULT
      // names the edit, the missing field, and the way back, and leaves the rest of the
      // batch applied.
      params.edits?.forEach((edit, i) => {
        if (typeof edit?.path !== 'string' || !edit.path) {
          failed.push(`edit #${i + 1}: no \`path\` — every edit needs the file it belongs to.`)
          return
        }
        const missing = ['old', 'new'].filter((field) => typeof edit?.[field] !== 'string')
        if (missing.length > 0) {
          failed.push(
            `${edit.path} edit #${i + 1}: missing ${missing.map((f) => `\`${f}\``).join(' and ')}. ` +
              `Send the edit again with both — \`old\` is the text to find and \`new\` is what ` +
              `replaces it (use an empty string to delete). If the call was cut short, re-send ` +
              `just this edit rather than an empty batch.`,
          )
          return
        }
        if (!byPath.has(edit.path)) byPath.set(edit.path, [])
        byPath.get(edit.path).push(edit)
      })
      const written = []
      const loosely = []

      for (const [path, edits] of byPath) {
        const abs = isAbsolute(path) ? path : resolve(ctx.cwd, path)
        let content
        try {
          content = readFileSync(abs, 'utf8')
        } catch (err) {
          for (let i = 0; i < edits.length; i++)
            failed.push(`${path}: ${err?.message ?? String(err)}`)
          continue
        }

        const spans = []
        let blocked = false
        edits.forEach((edit, i) => {
          if (edit.new === edit.old) {
            blocked = true
            failed.push(
              `${path} edit #${i + 1}: \`old\` and \`new\` are IDENTICAL — this edit changes ` +
                `nothing, and reporting it as an edit is how a turn ends up claiming a fix it never ` +
                `made. If the file already does what you want, the behaviour is already there: say ` +
                `so, and do not checkpoint it as a change.`,
            )
            return
          }
          const found = locate(content, edit.old, edit.replace_all === true)
          if (found.error) {
            blocked = true
            failed.push(
              `${path} edit #${i + 1}: ${found.error}` +
                (found.near ? `\nClosest text in the file right now:\n${found.near}` : ''),
            )
            return
          }
          if (found.loose) loosely.push(`${path} edit #${i + 1}`)
          for (const span of found.spans)
            spans.push({ ...span, replacement: edit.new, index: i + 1 })
        })
        if (blocked) continue

        spans.sort((a, b) => a.start - b.start)
        let overlap = null
        for (let i = 1; i < spans.length; i++) {
          if (spans[i].start < spans[i - 1].end) overlap = [spans[i - 1].index, spans[i].index]
        }
        if (overlap) {
          failed.push(
            `${path}: edit #${overlap[0]} and edit #${overlap[1]} cover overlapping text. Combine them into one edit.`,
          )
          continue
        }

        let next = content
        for (let i = spans.length - 1; i >= 0; i--) {
          next = next.slice(0, spans[i].start) + spans[i].replacement + next.slice(spans[i].end)
        }
        try {
          writeFileSync(abs, next, 'utf8')
        } catch (err) {
          failed.push(`${path}: ${err?.message ?? String(err)}`)
          continue
        }
        written.push(abs)
        applied.push(`${path} (${spans.length} edit(s))`)
      }

      const formatted = formatWritten(ctx.cwd, written)
      const unparseable = parseErrors(ctx.cwd, written)
      const parts = []
      if (applied.length) parts.push(`Edited ${applied.length} file(s):\n${applied.join('\n')}`)
      if (loosely.length)
        parts.push(
          `Matched ignoring whitespace (the file was formatted since you last saw it): ${loosely.join(', ')}.`,
        )
      if (failed.length)
        parts.push(
          `FAILED ${failed.length} edit(s) — the files they belong to were left untouched:\n${failed.join('\n\n')}`,
        )
      if (formatted)
        parts.push(
          'Source was reformatted after editing, so the text on disk is no longer ' +
            'character-for-character what you sent.',
        )
      if (unparseable) parts.push(unparseable)
      return {
        content: [
          {
            type: 'text',
            text:
              parts.join('\n\n') ||
              'No edits applied — the batch was empty. An empty `edits` array is never the ' +
                'way out of a failed call: send the edits you meant, or say what you are ' +
                'doing instead and move on.',
          },
        ],
        details: { applied: applied.length, failed: failed.length },
        isError: unparseable != null || (failed.length > 0 && applied.length === 0),
      }
    },
  })
}
