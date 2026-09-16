//~ name: sse
//~ title: Server-Sent Events — stream progress/updates one-way to the client
//~ when: The app streams server→client over plain HTTP GET — a progress bar for a long job, a live-updating count/feed. For two-way realtime (chat, presence) use {name: channel} instead.
//~ entity: todo

// ===== FILE: packages/functions/src/functions/stream-todo-progress.function.ts =====
import { z } from 'zod'
import { pikkuFunc } from '#pikku/function'

//~ An SSE func is a normal pikkuFunc; the 3rd arg carries `channel` when the
//~ request is an SSE stream. Emit interim frames with channel.send(...) and the
//~ final value via return. The output zod types BOTH the frames and the return.
//~ input/output are named consts — never inline at input:/output: (PKU489).
export const StreamTodoProgressInput = z.object({})
export const StreamTodoProgressOutput = z.object({
  status: z.enum(['started', 'processing', 'complete']),
  processed: z.number(),
  total: z.number(),
})

export const streamTodoProgress = pikkuFunc({
  input: StreamTodoProgressInput,
  output: StreamTodoProgressOutput,
  func: async ({ kysely, logger }, _input, { session, channel }) => {
    const todos = await kysely
      .selectFrom('todo')
      .select(['id', 'title'])
      .where('userId', '=', session!.userId)
      .where('done', '=', 0)
      .execute()
    const total = todos.length
    logger.info(`streaming ${total} todos`)
    //~ channel is present only for the SSE request — guard it.
    if (channel) {
      channel.send({ status: 'started', processed: 0, total })
      for (let i = 0; i < total; i++) {
        channel.send({ status: 'processing', processed: i + 1, total })
      }
    }
    return { status: 'complete' as const, processed: total, total }
  },
})

// ===== FILE: packages/functions/src/wires/http/todo-progress.http.ts =====
import { wireHTTP } from '#pikku/http'
import { streamTodoProgress } from '../../functions/stream-todo-progress.function.js'

//~ `sse: true` on a GET route turns it into a stream; the client reads it with an
//~ EventSource / the generated SSE client.
wireHTTP({
  method: 'get',
  route: '/todos/progress',
  func: streamTodoProgress,
  sse: true,
  tags: ['sse', 'realtime'],
})
