import { useCallback } from 'react'
import { useSearchParams as useConsoleSearchParams } from '../router'
import type { ConsoleRouter } from '../router'

export type UrlState = [string | null, (next: string | null) => void]

export type UrlWrite = (
  next: Record<string, string | null>,
  options?: { replace?: boolean }
) => void

export interface UrlStateOptions {
  /**
   * Replaces by default: the URL tracks what is on screen so it can be copied
   * and reloaded, but scanning a list must not fill the back stack. A tab is
   * the exception — going back to the one you came from is what the button is
   * for — so those pass `false`.
   */
  replace?: boolean
}

/**
 * The rules for keeping what is on screen in the URL, over whichever router is
 * reading it.
 *
 * The console reads the host's router through the shim; a host with pages of
 * its own (Fabric) has those pages outside the shim's provider and reads its
 * own. Both want the same rules — merge rather than overwrite the other params,
 * clear on null, fall back to the first row when the value names one that is
 * gone — so the rules live here once and each side binds its `useSearchParams`.
 */
/** Merged, never overwritten: a param this surface does not own stays put. */
export const applyUrlParams = (
  prev: URLSearchParams,
  next: Record<string, string | null>
): URLSearchParams => {
  const updated = new URLSearchParams(prev)
  for (const [key, value] of Object.entries(next)) {
    if (value === null || value === '') updated.delete(key)
    else updated.set(key, value)
  }
  return updated
}

/** An absent or unknown value falls back to the first option. */
export const resolveUrlSelection = (
  value: string | null,
  options: readonly string[]
): string | null =>
  value !== null && options.includes(value) ? value : (options[0] ?? null)

export const createUrlState = (
  useSearchParams: ConsoleRouter['useSearchParams']
) => {
  /** Several params in one write, for a change that means nothing by halves. */
  const useUrlWrite = (): UrlWrite => {
    const [, setSearchParams] = useSearchParams()
    return useCallback(
      (next, options) => {
        setSearchParams((prev) => applyUrlParams(prev, next), {
          replace: options?.replace ?? true,
        })
      },
      [setSearchParams]
    )
  }

  const useUrlState = (key: string, options?: UrlStateOptions): UrlState => {
    const [searchParams] = useSearchParams()
    const write = useUrlWrite()
    const replace = options?.replace
    const set = useCallback(
      (next: string | null) => write({ [key]: next }, { replace }),
      [write, key, replace]
    )
    return [searchParams.get(key), set]
  }

  /**
   * A value that has to name one of `options` — an absent or unknown one falls
   * back to the first, so a bare URL lands on something and a link to a row
   * that has since gone does not leave the surface empty.
   */
  const useUrlSelection = (
    key: string,
    options: readonly string[],
    stateOptions?: UrlStateOptions
  ): UrlState => {
    const [value, set] = useUrlState(key, stateOptions)
    return [resolveUrlSelection(value, options), set]
  }

  return { useUrlWrite, useUrlState, useUrlSelection }
}

export const { useUrlWrite, useUrlState, useUrlSelection } = createUrlState(
  useConsoleSearchParams
)
