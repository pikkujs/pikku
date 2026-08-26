import { useEffect, useState } from 'react'

const TICK_MS = 250

/**
 * Milliseconds left until `deadline`, ticking down to 0. A deadline of 0 means
 * no countdown is running.
 *
 * The window this counts is what `retryAfterMs` exists for: a guess made while
 * it is open is itself a failure and extends it, so the form stays disabled
 * until this reaches 0 rather than letting someone find out by trying.
 */
export const useCountdown = (deadline: number): number => {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, deadline - Date.now())
  )

  useEffect(() => {
    const left = Math.max(0, deadline - Date.now())
    setRemaining(left)
    if (left === 0) {
      return
    }

    const timer = setInterval(() => {
      const next = Math.max(0, deadline - Date.now())
      setRemaining(next)
      if (next === 0) {
        clearInterval(timer)
      }
    }, TICK_MS)

    return () => clearInterval(timer)
  }, [deadline])

  return remaining
}
