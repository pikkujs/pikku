//~ name: scheduled-task
//~ title: Scheduled/recurring task (wireScheduler + sessionless func)
//~ when: Something must run on a schedule — cleanup, rollup, reminder sweep. For a MULTI-STEP process use {name: workflow} instead (a cron can start a workflow).
//~ entity: todo
//~ The two-file split below is not a style preference: co-locating the wireScheduler
//~ call with the func makes pikku SKIP the task at runtime ("Skipping scheduled task —
//~ metadata not found"), which fails silently in production. It used to be a paragraph
//~ of prose the agent had to remember; writing both files is what retires the paragraph.

// ===== FILE: packages/functions/src/functions/archive-stale-todos.function.ts =====
import { pikkuVoidFunc } from '#pikku/function'

//~ A scheduled func MUST use pikkuVoidFunc — void→void, no input:/output:
//~ schemas, no session (pikkuSessionlessFunc/pikkuFunc do NOT typecheck against
//~ wireScheduler). Keep the body idempotent — the scheduler may retry.
export const archiveStaleTodos = pikkuVoidFunc({
  title: 'Archive stale todos',
  func: async ({ kysely, logger }) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const res = await kysely
      .updateTable('todo')
      .set({ updatedAt: new Date().toISOString() })
      .where('updatedAt', '<', cutoff)
      .executeTakeFirst()
    logger.info(`archiveStaleTodos: touched ${res.numUpdatedRows}`)
  },
})

// ===== FILE: packages/functions/src/wires/cron/archive-stale-todos.scheduler.ts =====
import { wireScheduler } from '#pikku/scheduler'
import { archiveStaleTodos } from '../../functions/archive-stale-todos.function.js'

//~ Standard 5-field cron. Examples: '*/15 * * * *' every 15 min · '0 7 * * *'
//~ daily 07:00 UTC · '0 9 * * 1' Mondays 09:00 UTC.
wireScheduler({
  name: 'archiveStaleTodos',
  schedule: '0 3 * * *',
  func: archiveStaleTodos,
})
