import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

export const CompleteHousekeepingTaskInput = z.object({
  taskId: z.string(),
  notes: z.string().optional(),
})

export const CompleteHousekeepingTaskOutput = z.object({
  taskId: z.string(),
  roomId: z.string(),
  roomNumber: z.string(),
})

// @snippet start permissionFunction
export const completeHousekeepingTask = pikkuFunc({
  expose: true,
  description: 'Mark a housekeeping task done and put the room back in service.',
  input: CompleteHousekeepingTaskInput,
  output: CompleteHousekeepingTaskOutput,
  // Only housekeeping closes housekeeping work. A receptionist holds
  // `housekeeping:read` and can see that 204 is still dirty; they cannot
  // declare it clean because they are not the one who cleaned it.
  scopes: ['housekeeping:complete'],
  audit: true,
  func: async ({ kysely, eventHub }, { taskId, notes }) => {
    const task = await kysely
      .selectFrom('housekeepingTask')
      .innerJoin('room', 'room.roomId', 'housekeepingTask.roomId')
      .select([
        'housekeepingTask.taskId',
        'housekeepingTask.roomId',
        'housekeepingTask.kind',
        'room.number as roomNumber',
      ])
      .where('housekeepingTask.taskId', '=', taskId)
      .executeTakeFirstOrThrow()

    await kysely
      .updateTable('housekeepingTask')
      .set({ status: 'done', notes: notes ?? null })
      .where('taskId', '=', taskId)
      .execute()

    // Maintenance leaves a room out of service; a turnover makes it clean.
    await kysely
      .updateTable('room')
      .set({
        housekeepingStatus: task.kind === 'maintenance' ? 'out_of_service' : 'clean',
      })
      .where('roomId', '=', task.roomId)
      .execute()

    // The front desk is watching this board in real time — a receptionist
    // should not have to refresh to find out a room is ready.
    await eventHub?.publish('housekeeping', null, {
      type: 'task-completed',
      roomId: task.roomId,
      roomNumber: task.roomNumber,
    })

    return { taskId, roomId: task.roomId, roomNumber: task.roomNumber }
  },
})
// @snippet end permissionFunction
