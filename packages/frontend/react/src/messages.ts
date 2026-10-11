import { createContext, createElement, useContext, useMemo } from 'react'
import type { FC, ReactNode } from 'react'
import type { I18nString } from './i18n-types.js'

/**
 * The shape a library author writes its words in: one plain-English function
 * per key, taking a single params object when the sentence has a hole in it.
 * Plain `string` returns are fine here — this is the one place bare English is
 * allowed to live.
 */
export type MessageDefaults = Record<string, (params?: any) => string>

/**
 * What a host must supply, derived only from the author's `defaults`: same keys,
 * same parameter types, but every function returns `I18nString`. A Paraglide
 * `m.x()` already returns that brand, so it fits as is; a hand-written plain
 * string does not, which keeps untranslated text out of a host's map.
 */
export type MessagesOf<D extends MessageDefaults> = {
  [K in keyof D]: (...args: Parameters<D[K]>) => I18nString
}

/** What a caller may pass: any subset, the rest falls back to English. */
export type MessagesInput<M> = Partial<M>

/** What a host passes when it must cover every key (a missing one fails to compile). */
export type CompleteMessages<M> = M

/**
 * Identity at runtime. Its job is the annotation: `completeMessages<CompleteMessages<M>>({...})`
 * checks the literal against the full type, so a host that forgets a key (or
 * adds one that does not exist) fails to compile instead of silently showing
 * English. A plain `const x: Partial<M>` would accept the gap.
 */
export const completeMessages = <M>(map: M): M => map

/** Merge a host's subset over the defaults; same object back when there is nothing to merge. */
export const mergeMessages = <M extends object>(
  defaults: M,
  messages?: Partial<M>
): M => (messages ? { ...defaults, ...messages } : defaults)

/**
 * Make a typed message set for one library. Everything is derived from
 * `defaults`, and the context is created here, per call, so two libraries
 * using this never share one.
 *
 * ```ts
 * const defaults = { loop: () => 'Loop', elif: ({ n }: { n: number }) => `elif ${n}` }
 * export const { MessagesProvider, useM, defaultM } = createMessages(defaults)
 * export type Messages = MessagesOf<typeof defaults>
 * ```
 */
export const createMessages = <D extends MessageDefaults>(defaults: D) => {
  type M = MessagesOf<D>

  const defaultM = Object.fromEntries(
    Object.entries(defaults).map(([key, fn]) => [
      key,
      // The `asI18n` cast, inlined: tested modules here take no runtime
      // relative imports (node runs the .ts directly, without extensions).
      (params?: unknown) => fn(params) as I18nString,
    ])
  ) as unknown as M

  const MessagesContext = createContext<M>(defaultM)

  const MessagesProvider: FC<{
    messages?: Partial<M>
    children?: ReactNode
  }> = ({ messages, children }) => {
    const value = useMemo(() => mergeMessages(defaultM, messages), [messages])
    return createElement(MessagesContext.Provider, { value }, children)
  }

  const useM = (): M => useContext(MessagesContext)

  return { MessagesProvider, useM, defaultM }
}
