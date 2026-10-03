import { useCallback, useEffect, useRef } from 'react'

export function useColorResolver(probeRef: React.RefObject<HTMLElement | null>) {
  const cache = useRef(new Map<string, string>())
  const resolve = useCallback(
    (input: string) => {
      const probe = probeRef.current
      if (!probe) return input
      const hit = cache.current.get(input)
      if (hit) return hit
      probe.style.color = ''
      probe.style.color = input
      const value = getComputedStyle(probe).color || input
      cache.current.set(input, value)
      return value
    },
    [probeRef],
  )
  // Theme toggles stamp `data-theme` / `data-mantine-color-scheme` / `class` on
  // <html>; OS theme flips via matchMedia. On either, drop the cache so the next
  // frame re-resolves. (Deliberately NOT watching `style` — inline var writes on
  // :root would thrash the cache mid-animation and force getComputedStyle.)
  useEffect(() => {
    const clear = () => cache.current.clear()
    const mo = new MutationObserver(clear)
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-mantine-color-scheme', 'class'],
    })
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener?.('change', clear)
    return () => {
      mo.disconnect()
      mq?.removeEventListener?.('change', clear)
    }
  }, [])
  return resolve
}
