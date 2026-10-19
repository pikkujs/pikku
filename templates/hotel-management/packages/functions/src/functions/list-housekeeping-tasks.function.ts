import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const ListHousekeepingTasksInput = z.object({
  /**
   * Defaults to the outstanding board — `open` and `in_progress`. A housekeeper
   * asking "what is left" does not want the ones already closed, and a list
   * that grows forever is a list nobody reads.
   */
  status: z.enum(['open', 'in_progress', 'done']).optional(),
})

export const ListHousekeepingTasksOutput = z.object({
  tasks: z.array(
    z.object({
      taskId: z.string(),
      roomId: z.string(),
      roomNumber: z.string(),
      kind: z.string(),
      status: z.string(),
      notes: z.string().nullable(),
    })
  ),
})

/**
 * The housekeeping board.
 *
 * `completeHousekeepingTask` takes a `taskId` and, until this existed, there
 * was no way for a person to obtain one — the coverage scenario had to name the
 * seeded `hk_1` by hand and left a comment saying so. A close action whose
 * argument can only come from the seed file is not an action anybody can
 * perform, which is why the room board could show 102 as dirty and nobody could
 * say it was clean.
 *
 * `housekeeping:read`, not `housekeeping:complete`: the front desk needs to see
 * what is outstanding to know when a room will be ready, and seeing the work is
 * not the same permission as declaring it done.
 */
export const listHousekeepingTasks = pikkuFunc({
  expose: true,
  readonly: true,
  description: 'Housekeeping tasks, outstanding ones by default.',
  input: ListHousekeepingTasksInput,
  output: ListHousekeepingTasksOutput,
  scopes: ['housekeeping:read'],
  func: async ({ kysely }, { status }) => {
    let query = kysely
      .selectFrom('housekeepingTask')
      .innerJoin('room', 'room.roomId', 'housekeepingTask.roomId')
      .select([
        'housekeepingTask.taskId',
        'housekeepingTask.roomId',
        'housekeepingTask.kind',
        'housekeepingTask.status',
        'housekeepingTask.notes',
        'room.number as roomNumber',
      ])
      .orderBy('room.number')

    query = status
      ? query.where('housekeepingTask.status', '=', status)
      : query.where('housekeepingTask.status', 'in', ['open', 'in_progress'])

    const rows = await query.execute()

    return {
      tasks: rows.map((row) => ({
        taskId: row.taskId,
        roomId: row.roomId,
        roomNumber: row.roomNumber,
        kind: row.kind,
        status: row.status,
        notes: row.notes ?? null,
      })),
    }
  },
})
