import { randomUUID } from './agent-utils.js'
import {
  AbandonedError,
  runInAbortScope,
  type AbortScope,
} from '../../function/abort-scope.js'
import type { AgentStorageService } from '../../services/agent-storage-service.js'

/**
 * Why an in-flight agent run was cut short.
 *
 * Deliberately carries no interjection text. A voice interruption is not a
 * cancel button — it is the user starting to talk — but what they said arrives
 * a second later as an ordinary next turn on the same thread, and that turn
 * already has a working path through `streamAgent`. The model then sees its
 * own truncated message (marked `interrupted`) followed by the interjection and
 * decides for itself whether to resume, correct itself or drop the thread.
 * Nothing here classifies the interjection; a second delivery path for the same
 * text would only give the two ways to disagree about ordering.
 */
export interface AgentInterruption {
  /** `'speech'` — the user started talking over the agent (voice barge-in).
   *  `'user'` — an explicit stop (a button). `'timeout'` — a caller-side deadline. */
  reason: 'speech' | 'user' | 'timeout'
}

/**
 * Thrown out of the step loop when a run is interrupted, so an interruption is
 * distinguishable from a genuine failure at the one `catch` that would
 * otherwise mark the run `failed`.
 */
export class AgentInterruptedError extends Error {
  constructor(
    public readonly runId: string,
    public readonly interruption: AgentInterruption
  ) {
    super(`Agent run ${runId} interrupted (${interruption.reason})`)
    this.name = 'AgentInterruptedError'
  }
}

/**
 * A tool call that settled after its run was interrupted, so its result never
 * reached the model.
 *
 * These are not failures, and they are only ever mutations. The tool ran, its
 * side effect happened, and the only thing the interrupt cost was the reply
 * describing it — so the result is worth mentioning on the next turn. Reads are
 * excluded at the call site: nothing changed, so there is nothing to account
 * for, and a stale answer is worse than re-reading.
 */
export interface OrphanedToolResult {
  toolCallId: string
  toolName: string
  result: unknown
  /** Set instead of `result` when the tool threw after the interrupt. */
  error?: string
}

/** What an authorized interrupt actually achieved. */
export interface AgentInterruptResult {
  /**
   * Whether a generating run was stopped. `false` is routine, not an error:
   * racing a run that finishes on its own is the normal case in voice.
   */
  stopped: boolean
  /**
   * Tools that were still executing when the interrupt landed. Their side
   * effects have already happened and cannot be undone from here — this is for
   * saying something true ("the deploy is still going"), not for offering to
   * roll it back. Each will surface as an `undelivered` tool message on the
   * thread once it settles.
   */
  inFlightTools: string[]
}

export interface InterruptibleRunHandle {
  readonly signal: AbortSignal
  /** Set at the moment the run is interrupted; `undefined` on a clean run. */
  readonly interruption: AgentInterruption | undefined
  /** Names of tools executing right now — what an interrupt would talk over. */
  readonly inFlightTools: string[]
  /**
   * Wrap a tool execution so it survives an interrupt. Before the interrupt
   * this is a pass-through; after one, the settled value is collected as an
   * {@link OrphanedToolResult} rather than vanishing with the aborted stream.
   */
  trackTool<T>(
    toolName: string,
    toolCallId: string,
    exec: () => Promise<T>,
    opts?: { collectResult?: boolean }
  ): Promise<T>
  /**
   * Resolves once every tool still running at the moment of the interrupt has
   * settled, with the results the model never got to see.
   *
   * Deliberately not awaited before the stream closes: barge-in has to stop the
   * agent talking immediately, and a tool holding that up for its own duration
   * is the one thing voice cannot tolerate.
   */
  settle(timeoutMs?: number): Promise<OrphanedToolResult[]>
  release(): void
}

type Entry = {
  controller: AbortController
  interruption?: AgentInterruption
  inFlight: Map<string, string>
  orphaned: OrphanedToolResult[]
  pending: Set<Promise<void>>
}

/**
 * Live runs, keyed by runId.
 *
 * Module-level rather than `pikkuState` because the value is an
 * `AbortController` — a process-local object that cannot be serialised or
 * shared. That is also this registry's limit: an interrupt only reaches a run
 * executing in the same process. Single-process and channel-attached callers
 * (where the interrupt arrives on the socket already carrying the run) are
 * covered; a horizontally-scaled deployment interrupting over a *separate* HTTP
 * request needs the interrupt fanned out over `eventHub` to every instance
 * first, with each instance calling `signalRunInterrupt` locally.
 */
const runs = new Map<string, Entry>()

/**
 * Make a run interruptible for the duration of its stream. The returned signal
 * is threaded into the model call, so an interrupt cancels the upstream HTTP
 * request rather than merely stopping delivery of tokens we are still paying
 * for.
 */
export const registerInterruptibleRun = (
  runId: string
): InterruptibleRunHandle => {
  const entry: Entry = {
    controller: new AbortController(),
    inFlight: new Map(),
    orphaned: [],
    pending: new Set(),
  }
  runs.set(runId, entry)
  return {
    signal: entry.controller.signal,
    get interruption() {
      return entry.interruption
    },
    get inFlightTools() {
      return [...entry.inFlight.values()]
    },
    trackTool: async <T>(
      toolName: string,
      toolCallId: string,
      exec: () => Promise<T>,
      opts?: { collectResult?: boolean }
    ): Promise<T> => {
      entry.inFlight.set(toolCallId, toolName)
      const call = exec()
      // Tracked separately from the returned promise so an interrupt can wait
      // on the tool without the caller's rejection becoming an unhandled one.
      const tracked = call.then(
        (result) => {
          entry.inFlight.delete(toolCallId)
          // Read now rather than at call time: a tool that uses
          // `beginChanges()` only reveals partway through whether it mutated.
          if (
            (opts?.collectResult ?? true) &&
            entry.controller.signal.aborted
          ) {
            entry.orphaned.push({ toolCallId, toolName, result })
          }
        },
        (err: unknown) => {
          entry.inFlight.delete(toolCallId)
          // A tool that stopped *at* its own checkpoint changed nothing by
          // construction, so it never files a note — reporting "it aborted"
          // is exactly the noise `beginChanges()` exists to remove.
          if (err instanceof AbandonedError) return
          if (
            (opts?.collectResult ?? true) &&
            entry.controller.signal.aborted
          ) {
            entry.orphaned.push({
              toolCallId,
              toolName,
              result: undefined,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }
      )
      entry.pending.add(tracked)
      void tracked.finally(() => entry.pending.delete(tracked))
      return call
    },
    settle: async (timeoutMs = 30_000): Promise<OrphanedToolResult[]> => {
      if (entry.pending.size > 0) {
        // A tool that never settles must not strand the note forever; whatever
        // has landed by the deadline is what gets reported.
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          Promise.all([...entry.pending]),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, timeoutMs)
          }),
        ])
        if (timer) clearTimeout(timer)
      }
      return entry.orphaned
    },
    release: () => {
      if (runs.get(runId) === entry) runs.delete(runId)
    },
  }
}

/**
 * Stop a run that is generating right now.
 *
 * Plumbing: this performs NO authorization, so anyone holding a runId can stop
 * it. Reach for {@link interruptAgent} instead unless the caller has already
 * established that the run belongs to the session — which in practice means
 * only the runner itself and code already inside an authorized run.
 *
 * Returns `false` when the run is not in flight in this process — already
 * finished, never started, or running elsewhere — which callers should treat as
 * "nothing to interrupt", not as an error: racing a run that finishes on its own
 * is the normal case in voice.
 */
export const signalRunInterrupt = (
  runId: string,
  interruption: AgentInterruption = { reason: 'user' }
): boolean => {
  const entry = runs.get(runId)
  if (!entry || entry.controller.signal.aborted) return false
  entry.interruption = interruption
  entry.controller.abort()
  return true
}

/** Whether a run is currently interruptible in this process. */
export const isRunInterruptible = (runId: string): boolean => runs.has(runId)

/**
 * Tools executing in a run right now. Empty for a run that is merely
 * generating, or one this process does not hold.
 *
 * Callers use this to say something true about work that outlives the reply —
 * "that deploy is still going" — rather than to offer to stop it. By the time a
 * tool is executing its side effect has already happened, and pikku functions
 * receive no abort signal, so there is nothing left to cancel.
 */
export const getInFlightTools = (runId: string): string[] => {
  const entry = runs.get(runId)
  return entry ? [...entry.inFlight.values()] : []
}

/**
 * Wrap tool definitions so their results survive an interrupt.
 *
 * Applied by the runner after the handle exists rather than in `buildToolDefs`,
 * which builds tools before there is a runId to attach them to.
 */
export const trackToolExecution = <
  T extends {
    name: string
    readonly?: boolean
    execute: (input: any) => Promise<any>
  },
>(
  tools: T[],
  handle: InterruptibleRunHandle
): T[] =>
  tools.map((tool) => {
    // Reads run outside the scope entirely: they never produce a note and have
    // nothing to declare, so `beginChanges()` inside one is a no-op rather than
    // a contradiction to resolve.
    if (tool.readonly) {
      return {
        ...tool,
        execute: (input: unknown) =>
          handle.trackTool(tool.name, randomUUID(), () => tool.execute(input), {
            collectResult: false,
          }),
      }
    }

    return {
      ...tool,
      execute: (input: unknown) => {
        // Assumed to have changed something unless it says otherwise — the tool
        // that never declares its checkpoint is the one that cannot be assumed
        // harmless. `beginChanges()` can only ever make this more precise.
        const call = { mutating: true }
        const scope: AbortScope = {
          get abandoned() {
            return handle.signal.aborted
          },
          get reason() {
            return handle.interruption?.reason
          },
          onBeginChanges: () => {
            call.mutating = true
          },
        }
        return handle.trackTool(
          tool.name,
          randomUUID(),
          () => runInAbortScope(scope, () => tool.execute(input)),
          {
            get collectResult() {
              return call.mutating
            },
          }
        )
      },
    }
  })

/**
 * Threads with an interrupted tool call still settling.
 *
 * The note describing that result has to be in the thread before the turn that
 * ought to mention it loads its context, and the user's next sentence usually
 * arrives well inside a slow tool. Runs await this for their own thread first,
 * so the ordering holds without the interrupt itself blocking on anything.
 */
const pendingNotes = new Map<string, Promise<void>>()

export const trackInterruptNote = (
  threadId: string,
  write: Promise<void>
): void => {
  const done = write.finally(() => {
    if (pendingNotes.get(threadId) === done) pendingNotes.delete(threadId)
  })
  pendingNotes.set(threadId, done)
}

/** Await an interrupted tool result still being written to this thread. */
export const awaitPendingInterruptNote = async (
  threadId: string
): Promise<void> => {
  await pendingNotes.get(threadId)
}

/**
 * Write the results of tools that were still running when a run was cut off.
 *
 * Saved as an ordinary tool message so it reaches the model through the same
 * context load as everything else — there is no separate "notes" channel to
 * keep in sync, and storage that drops the `undelivered` flag still keeps the
 * result itself.
 *
 * Callers should hand this to {@link trackInterruptNote} rather than awaiting
 * it: an interrupt has to end the reply immediately, and a slow tool must not
 * hold that up.
 */
export const persistOrphanedToolResults = async (
  handle: InterruptibleRunHandle,
  storage: AgentStorageService,
  threadId: string
): Promise<void> => {
  let orphaned: OrphanedToolResult[]
  try {
    orphaned = await handle.settle()
  } finally {
    handle.release()
  }
  if (orphaned.length === 0) return
  await storage.saveMessages(threadId, [
    {
      id: randomUUID(),
      role: 'tool',
      toolResults: orphaned.map((entry) => ({
        id: entry.toolCallId,
        name: entry.toolName,
        result: entry.error
          ? `Error: ${entry.error}`
          : typeof entry.result === 'string'
            ? entry.result
            : JSON.stringify(entry.result),
        ...(entry.error ? { error: entry.error } : {}),
      })),
      undelivered: true,
      createdAt: new Date(),
    },
  ])
}

/**
 * Whether a thrown value is an abort rather than a failure. The AI SDK
 * surfaces cancellation as a DOMException/Error named `AbortError`, so the
 * name is the only portable signal — there is no shared error class to
 * `instanceof` against across fetch, undici and the provider SDKs.
 */
export const isAbortError = (err: unknown): boolean =>
  err instanceof Error &&
  (err.name === 'AbortError' || err.name === 'TimeoutError')
