//~ name: queue-worker
//~ title: Background queue worker (wireQueueWorker + sessionless func)
//~ when: Work that should run OFF the request — send-later, image/report processing, a retryable job. Enqueue from any function; the worker runs it in the background. For a MULTI-STEP durable process use {name: workflow} instead.
//~ entity: todo
//~ steps:
//~ NEXT STEP — a worker only runs when something ENQUEUES onto it. Nothing does yet.
//~ From whichever function starts the work (the RPC behind a button, an HTTP wire, a
//~ scheduler), use the injected `queue` service — the first argument is the `name` from
//~ wireQueueWorker, the second is the func's input:
//~     await queue.add('todo-reminders', { todoId, userId })
//~ Do NOT reach for a scheduler to trigger this. A wireScheduler fires on a clock and
//~ nobody can start it on demand; if the user asked for a button, the button's function
//~ calls queue.add and returns immediately. A schedule is only right when the trigger
//~ genuinely IS the clock.
//~ To report progress back while the job runs, publish to the event hub from inside the
//~ worker and subscribe in the UI — see {name: sse}.

// ===== FILE: packages/functions/src/functions/process-todo-reminder.function.ts =====
import { z } from 'zod'
import { pikkuSessionlessFunc } from '#pikku/function'

//~ The job payload IS the func input. A worker is sessionless (no user session)
//~ — pass every id it needs in the payload. `deploy: 'server'` keeps it off the
//~ serverless path. Keep the output small (it's the job result).
export const ProcessTodoReminderInput = z.object({
  todoId: z.string(),
  userId: z.string(),
})
//~ output is a named const too — never inline at the output: site (PKU489).
export const ProcessTodoReminderOutput = z.object({ processed: z.boolean(), message: z.string() })

export const processTodoReminder = pikkuSessionlessFunc({
  deploy: 'server',
  input: ProcessTodoReminderInput,
  output: ProcessTodoReminderOutput,
  func: async ({ kysely, logger }, { todoId, userId }) => {
    //~ Do the real work — read/update rows, call a service, send an email.
    const todo = await kysely
      .selectFrom('todo')
      .select(['id', 'title', 'done'])
      .where('id', '=', todoId)
      .where('userId', '=', userId)
      .executeTakeFirst()
    if (!todo) return { processed: false, message: `Todo ${todoId} not found` }
    if (todo.done) return { processed: true, message: `Todo ${todoId} already done` }
    logger.info(`Reminder: "${todo.title}" is due`)
    return { processed: true, message: `Reminder sent for ${todo.title}` }
  },
})

// ===== FILE: packages/functions/src/wires/queue/todo-reminders.queue.ts =====
import { wireQueueWorker } from '#pikku/queue'
import { processTodoReminder } from '../../functions/process-todo-reminder.function.js'

//~ `name` is a literal string — it is the queue other code enqueues onto.
//~ ENQUEUE a job from any other function via the injected queue service:
//~   await queue.add('todo-reminders', { todoId, userId })
wireQueueWorker({
  name: 'todo-reminders',
  func: processTodoReminder,
})
