import { useCallback, useEffect, useRef, useState } from 'react'
import { Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'

import { parseHelpText } from './parseHelpText'

import './helpAnchor.css'

const MARK = 'data-help-active'

function findAnchor(name: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-help="${CSS.escape(name)}"]`
  )
}

function offScreen(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return (
    r.bottom < 0 ||
    r.top > window.innerHeight ||
    r.right < 0 ||
    r.left > window.innerWidth
  )
}

function canHover(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches
  )
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * A phrase in the help copy that points at a real control on the screen behind
 * the panel. An anchor whose target is not in the DOM renders as ordinary text —
 * that is what stops the panel promising something the screen does not show.
 */
export function HelpAnchor({
  name,
  children,
}: {
  name: string
  children: string
}) {
  const [live, setLive] = useState(false)
  const marked = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setLive(canHover() && findAnchor(name) != null)
  }, [name])

  const clear = useCallback(() => {
    marked.current?.removeAttribute(MARK)
    marked.current = null
  }, [])

  useEffect(() => clear, [clear])

  const enter = useCallback(() => {
    const el = findAnchor(name)
    if (!el) {
      setLive(false)
      return
    }
    if (offScreen(el)) {
      el.scrollIntoView({
        block: 'center',
        behavior: reducedMotion() ? 'auto' : 'smooth',
      })
    }
    el.setAttribute(MARK, '')
    marked.current = el
  }, [name])

  if (!live) return <>{asI18n(children)}</>

  return (
    <Text
      span
      inherit
      style={{
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: 3,
        textDecorationColor: 'var(--app-accent)',
        cursor: 'help',
      }}
      onMouseEnter={enter}
      onMouseLeave={clear}
      onFocus={enter}
      onBlur={clear}
      tabIndex={0}
    >
      {asI18n(children)}
    </Text>
  )
}

export function HelpText({ children }: { children: string }) {
  return (
    <>
      {parseHelpText(children).map((seg, i) =>
        seg.anchor ? (
          <HelpAnchor key={i} name={seg.anchor}>
            {seg.text}
          </HelpAnchor>
        ) : (
          <span key={i}>{asI18n(seg.text)}</span>
        )
      )}
    </>
  )
}
