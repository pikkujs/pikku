import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { I18nString } from '@pikku/react'
import classes from './console.module.css'

type ScrollRegionProps = {
  /** Named for the reader who reaches it by keyboard rather than by pointer. */
  label: I18nString
  /**
   * What the box is when it is NOT scrolling. A table needs nothing — the table
   * inside it is already the landmark — while a diagram is an image whose only
   * text is this label, and has to be announced as one either way.
   */
  restingRole?: 'img'
  className?: string
  children?: React.ReactNode
  ref?: React.Ref<HTMLDivElement>
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'children' | 'className'>

/**
 * A box that content is allowed to be wider than.
 *
 * Two things in a document refuse to fit a narrow column honestly — a wide table
 * and a diagram — and the usual answer, scaling them down, trades legibility for
 * the appearance of fitting. This keeps them at full size and lets them scroll,
 * which costs two things that have to be paid for: the region has to be
 * reachable without a pointer, and it has to LOOK like it continues, or a reader
 * simply never learns there is a third column.
 *
 * Both are only true while the content actually overflows, so the box measures
 * itself: a table that fits is a table, not a scrolling region announcing itself
 * to a screen reader for nothing.
 */
export const ScrollRegion: React.FC<ScrollRegionProps> = ({
  label,
  restingRole,
  className,
  children,
  ref: forwardedRef,
  ...props
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: false, end: false })
  const scrollable = edges.start || edges.end

  // Which side still has content behind it, so the fade marks the direction
  // there is more in rather than dimming both ends of a table that is already
  // showing its last column.
  const measure = useCallback(() => {
    const element = ref.current
    if (!element) return
    const offset = Math.abs(element.scrollLeft)
    const hidden = element.scrollWidth - element.clientWidth
    setEdges((current) => {
      const next = { start: offset > 1, end: hidden - offset > 1 }
      return current.start === next.start && current.end === next.end
        ? current
        : next
    })
  }, [])

  useEffect(() => {
    measure()
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    // Fires on the box narrowing AND on the content landing inside it, which is
    // what makes this work for a diagram that arrives a second after the note.
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of Array.from(element.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [measure, children])

  return (
    <div
      ref={(node) => {
        ref.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      }}
      className={
        className
          ? `${classes.scrollRegion} ${className}`
          : classes.scrollRegion
      }
      onScroll={measure}
      data-scrollable={scrollable || undefined}
      data-fade-start={edges.start || undefined}
      data-fade-end={edges.end || undefined}
      tabIndex={scrollable ? 0 : undefined}
      role={scrollable ? 'region' : restingRole}
      aria-label={label}
      {...props}
    >
      {children}
    </div>
  )
}
