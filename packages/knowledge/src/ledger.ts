import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { noteHash, type KnowledgeNote } from './notes.js'

/**
 * The frontmatter key the ledger keeps its entries under: `seat@bodyHash`
 * entries, comma-separated.
 *
 * It lives on the note rather than in a sentinel beside it for two reasons: the
 * seat that is retrying already reads the note, so it can see what it has tried;
 * and the hash makes the budget reset itself the moment the note is rewritten,
 * because failures recorded against content nobody has now are not failures
 * against this note.
 */
export const ATTEMPTS_KEY = 'attempts'

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * Set or clear frontmatter scalars on a note, leaving its body and every other
 * key alone.
 *
 * The one writer, because the three this replaced each anchored their edit on a
 * `status:` line matched by regex: none could add a key that was not already
 * there without picking a line to insert after, a miss wrote nothing and the
 * caller could not tell, and a new key inserted after `status:` landed between it
 * and the `statusAt:` beside it. Parsing the fence instead makes replace-and-append
 * the same operation, and makes a note with no frontmatter an error rather than a
 * silent no-op.
 *
 * A `null` value removes the key. Values are written verbatim: a profile scalar is
 * a single line by construction, so nothing here needs to quote or escape, and a
 * value carrying a newline is a bug in the caller rather than a case to handle.
 *
 * @param require names keys that must ALREADY be there. Appending is right for a
 * key a note has simply never carried, and wrong for a lifecycle move: a note with
 * no `status:` was never `proposed`, so writing `dispatched` onto it would skip the
 * state machine and leave a malformed note looking legitimate.
 */
export function setNoteScalars(
  root: string,
  notePath: string,
  fields: Record<string, string | null>,
  require: readonly string[] = []
): void {
  const full = join(root, notePath)
  const raw = readFileSync(full, 'utf8')
  const fence = FENCE.exec(raw)
  if (!fence) throw new Error(`${notePath} has no frontmatter block to update`)
  const lines = fence[1]!.split(/\r?\n/)
  for (const key of require) {
    if (!lines.some((line) => line.startsWith(`${key}:`))) {
      throw new Error(`${notePath} has no \`${key}:\` line to update`)
    }
  }
  for (const [key, value] of Object.entries(fields)) {
    const at = lines.findIndex((line) => line.startsWith(`${key}:`))
    if (value === null) {
      if (at !== -1) lines.splice(at, 1)
    } else if (at === -1) {
      lines.push(`${key}: ${value}`)
    } else {
      lines[at] = `${key}: ${value}`
    }
  }
  writeFileSync(
    full,
    `---\n${lines.join('\n')}\n---\n${raw.slice(fence[0].length)}`
  )
}

/** One turn a seat has spent on a note, against the note as it then read. */
export type NoteAttempt = { seat: string; hash: string }

/** How a fingerprint is taken, and which attempts count against it. */
export interface AttemptOptions {
  /**
   * A profile's own frontmatter keys, so a note is fingerprinted over the keys
   * the profile's gates actually refuse on. `attempts` is excluded whether or not
   * it is named here.
   */
  profileScalars?: readonly string[]
  /**
   * Count attempts made against any earlier reading of the note too.
   *
   * For the one kind of seat where a rewritten note is not new work. A seat
   * ANSWERING the note's content has genuinely been handed a new problem, so the
   * reset is right. A seat waiting on a person to say yes is not answering
   * content, and its own turn is what triggers the note to be re-filed — which
   * rewrote the note, reset the budget, and settled the same question forever. A
   * bound the bounded thing can reset is not a bound.
   */
  anyBody?: boolean
}

/** The turns already spent on this note, oldest first. */
export function noteAttempts(note: KnowledgeNote): NoteAttempt[] {
  if (!note.attempts) return []
  return note.attempts
    .split(',')
    .map((entry) => {
      const at = entry.indexOf('@')
      return at === -1
        ? { seat: entry.trim(), hash: '' }
        : { seat: entry.slice(0, at).trim(), hash: entry.slice(at + 1).trim() }
    })
    .filter((attempt) => attempt.seat !== '')
}

/**
 * The OKF scalars a gate can refuse on, and so the ones a fingerprint always
 * covers. A profile's own keys are added at the call.
 */
const FINGERPRINTED = [
  'type',
  'title',
  'description',
  'resource',
  'status',
  'entities',
] as const

/**
 * What a seat is answering: the note's body AND the frontmatter it is asked to fix.
 *
 * The body alone was the old key, and it quietly made most repairs count for
 * nothing. A gate refusal is nearly always about a frontmatter line — `status:`,
 * `entities:` — so a seat that fixed exactly what it was told hashed the same and
 * spent budget without moving. Two DIFFERENT refusals then shared one budget, and
 * the second escalated straight past repair to asking the user to settle a line
 * they cannot see. `attempts` is excluded: it changes on every record, so counting
 * it would hand back a full budget every turn and bound nothing.
 */
export function noteFingerprint(
  note: KnowledgeNote,
  profileScalars: readonly string[] = []
): string {
  const keys = [
    ...new Set([
      ...FINGERPRINTED,
      ...profileScalars.filter((key) => key !== ATTEMPTS_KEY),
    ]),
  ].sort()
  const scalars = keys.map(
    (key) => `${key}: ${(note as Record<string, unknown>)[key] ?? ''}`
  )
  return noteHash([...scalars, '', note.body].join('\n'))
}

/**
 * How many turns this seat has spent on the note AS IT NOW READS.
 *
 * Attempts against an older reading are left in place and deliberately not
 * counted: they are the history the seat reads to avoid answering a refusal the
 * way it already did, while the budget they no longer bind is what lets an answer
 * unstick a note the loop had given up on, with nothing having to notice that it
 * did.
 */
export function attemptsSpent(
  note: KnowledgeNote,
  seat: string,
  { profileScalars = [], anyBody = false }: AttemptOptions = {}
): number {
  const hash = noteFingerprint(note, profileScalars)
  return noteAttempts(note).filter(
    (attempt) => attempt.seat === seat && (anyBody || attempt.hash === hash)
  ).length
}

/** How an attempt is recorded. */
export interface RecordAttemptOptions extends AttemptOptions {
  /**
   * How many entries the log keeps.
   *
   * Capped because every seat reads this note in full: an unbounded log of a note
   * nothing can satisfy would grow into the context of every turn that then fails
   * to satisfy it.
   */
  cap?: number
}

/** Record one turn against a note, keeping the list at `cap` entries. */
export function recordNoteAttempt(
  root: string,
  note: KnowledgeNote,
  seat: string,
  { profileScalars = [], cap = 8 }: RecordAttemptOptions = {}
): void {
  const entries = [
    ...noteAttempts(note),
    { seat, hash: noteFingerprint(note, profileScalars) },
  ].slice(-cap)
  setNoteScalars(root, note.path, {
    [ATTEMPTS_KEY]: entries.map((a) => `${a.seat}@${a.hash}`).join(', '),
  })
}
