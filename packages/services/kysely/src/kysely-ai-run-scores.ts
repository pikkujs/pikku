import type { Kysely } from 'kysely'
import type { KyselyPikkuDB } from './kysely-tables.js'
import type { SaveScoreInput } from '@pikku/core/services'
import type { AIRunScore } from '@pikku/core/ai-scorer'
import { parseJson } from './kysely-json.js'

/**
 * Shared by the two Kysely services that implement `AIRunStateService` — they
 * differ in how they store approvals, not in how they store grades.
 */
export const saveRunScore = async (
  db: Kysely<KyselyPikkuDB>,
  score: SaveScoreInput
): Promise<void> => {
  await db
    .insertInto('aiRunScore')
    .values({
      id: crypto.randomUUID(),
      runId: score.runId,
      scorerName: score.scorerName,
      score: score.score,
      reason: score.reason ?? null,
      metadata: score.metadata ? JSON.stringify(score.metadata) : null,
    })
    .execute()
}

export const getRunScores = async (
  db: Kysely<KyselyPikkuDB>,
  runId: string
): Promise<AIRunScore[]> => {
  const rows = await db
    .selectFrom('aiRunScore')
    .selectAll()
    .where('runId', '=', runId)
    .orderBy('createdAt', 'asc')
    .execute()

  return rows.map((row) => ({
    runId: row.runId,
    scorerName: row.scorerName,
    score: Number(row.score),
    reason: row.reason ?? undefined,
    metadata: parseJson(row.metadata),
    createdAt: new Date(row.createdAt),
  }))
}
