/**
 * The pure half of `pikku scenario mutate`: splicing a mutant into source,
 * choosing a diverse sample, classifying a run, and scoring. No IO, so it is
 * tested without Stryker, a server or a project.
 */

export interface MutantLocation {
  start: { line: number; column: number }
  end: { line: number; column: number }
}

/** A mutant as Stryker's JSON report describes it (1-based line and column). */
export interface Mutant {
  /** Path relative to the project root, forward slashes. */
  file: string
  mutator: string
  line: number
  location: MutantLocation
  replacement: string
}

/** Replace `location` (1-based, end-exclusive) of `source` with `replacement`. */
export const spliceMutant = (
  source: string,
  location: MutantLocation,
  replacement: string
): string => {
  const lines = source.split('\n')
  const sl = location.start.line - 1
  const sc = location.start.column - 1
  const el = location.end.line - 1
  const ec = location.end.column - 1
  const head = [...lines.slice(0, sl), lines[sl]!.slice(0, sc)].join('\n')
  const tail = [lines[el]!.slice(ec), ...lines.slice(el + 1)].join('\n')
  return head + replacement + tail
}

/**
 * Lines that are configuration, schema or wiring rather than behaviour. A
 * mutant there only proves the type system or the inspector noticed, not that
 * a scenario did.
 */
export const DEFAULT_SKIP_LINE =
  /\bz\.|expose:|auth:|description:|title:|tags:|^\s*(import|export type|export interface)\b/

/**
 * Up to `perFile` mutants per file, taken round-robin across mutator types so
 * one type (usually ConditionalExpression) cannot fill the sample.
 */
export const pickMutants = (mutants: Mutant[], perFile: number): Mutant[] => {
  const byFile = new Map<string, Map<string, Mutant[]>>()
  for (const mutant of mutants) {
    const byMutator = byFile.get(mutant.file) ?? new Map<string, Mutant[]>()
    byFile.set(mutant.file, byMutator)
    byMutator.set(mutant.mutator, [
      ...(byMutator.get(mutant.mutator) ?? []),
      mutant,
    ])
  }
  const picked: Mutant[] = []
  for (const byMutator of byFile.values()) {
    const queues = [...byMutator.values()].map((queue) => [...queue])
    let taken = 0
    while (taken < perFile && queues.some((queue) => queue.length > 0)) {
      for (const queue of queues) {
        if (taken >= perFile) break
        const next = queue.shift()
        if (next) {
          picked.push(next)
          taken++
        }
      }
    }
  }
  return picked
}

export type MutantOutcome =
  /** The scenario ran against the mutant and failed. */
  | 'killed'
  /** The scenario ran against the mutant and still passed. */
  | 'survived'
  /** Codegen, type-check or boot failed: the mutant says nothing about the suite. */
  | 'inconclusive'

export type InconclusiveStage = 'codegen' | 'tsc' | 'boot' | 'setup' | 'timeout'

export interface MutantResult extends Pick<
  Mutant,
  'file' | 'mutator' | 'line' | 'replacement'
> {
  outcome: MutantOutcome
  /** Why a mutant was inconclusive. */
  stage?: InconclusiveStage
}

/** What running one stage of the pipeline produced. */
export interface StageRun {
  code: number | null
  output: string
  timedOut?: boolean
}

/**
 * Read a `pikku scenario run` outcome. The scenario formatter prints one
 * `PASS <name>` / `FAIL <name>` line per scenario and a closing
 * `n/m scenarios passed`; a run that printed none of those never got to run the
 * scenario (setup failure, or the spawned server died).
 */
export const classifyScenarioRun = (
  run: StageRun
): 'killed' | 'survived' | InconclusiveStage => {
  if (run.timedOut) return 'timeout'
  const out = run.output
  const failed = /^\s*FAIL /m.test(out)
  const reported =
    /\d+\/\d+ scenarios passed/.test(out) || failed || /^\s*PASS /m.test(out)
  if (!reported) return /Server exited/.test(out) ? 'boot' : 'setup'
  if (/Server exited/.test(out) && !failed && run.code !== 0) return 'boot'
  if (failed) return 'killed'
  return run.code === 0 ? 'survived' : 'killed'
}

export interface MutationScore {
  killed: number
  survived: number
  inconclusive: number
  /** killed / (killed + survived), 0..100 rounded to one place; null when nothing was conclusive. */
  score: number | null
}

export const scoreMutants = (results: MutantResult[]): MutationScore => {
  const count = (outcome: MutantOutcome) =>
    results.filter((result) => result.outcome === outcome).length
  const killed = count('killed')
  const survived = count('survived')
  const total = killed + survived
  return {
    killed,
    survived,
    inconclusive: count('inconclusive'),
    score: total === 0 ? null : Math.round((killed / total) * 1000) / 10,
  }
}

/** Survivors grouped by file, ordered by line, for the report. */
export const groupSurvivors = (
  results: MutantResult[]
): Record<string, { line: number; mutator: string; replacement: string }[]> => {
  const grouped: Record<
    string,
    { line: number; mutator: string; replacement: string }[]
  > = {}
  for (const result of results) {
    if (result.outcome !== 'survived') continue
    ;(grouped[result.file] ??= []).push({
      line: result.line,
      mutator: result.mutator,
      replacement: result.replacement,
    })
  }
  for (const list of Object.values(grouped))
    list.sort((a, b) => a.line - b.line)
  return grouped
}
