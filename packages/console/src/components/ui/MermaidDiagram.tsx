import React, { useEffect, useId, useRef, useState } from 'react'
import { Box, Text, useComputedColorScheme } from '@pikku/mantine/core'
import type { I18nString } from '@pikku/react'
import { TriangleAlert } from 'lucide-react'
import { m } from '@/i18n/messages'
import { ScrollRegion } from './ScrollRegion'
import classes from './console.module.css'

/**
 * Mermaid is ~1MB of parser and layout engine, and most documents have no
 * diagram in them. Imported on the first fence that needs it and held in a
 * module-level promise, so a note with six diagrams loads it once and a note with
 * none never pays for it at all.
 */
let mermaidModule: Promise<typeof import('mermaid').default> | null = null

const loadMermaid = () => {
  mermaidModule ??= import('mermaid').then((module) => module.default)
  return mermaidModule
}

/**
 * The diagram is drawn from the console's own CSS variables rather than one of
 * mermaid's built-in themes, read off the live element instead of imported from
 * ThemeProvider: this component renders inside the fabric console too, which
 * supplies its own values for the same variables. Reading the computed value is
 * what makes one diagram look native in both.
 */
const themeVariablesFrom = (element: HTMLElement) => {
  const style = getComputedStyle(element)
  const read = (name: string, fallback: string) =>
    style.getPropertyValue(name).trim() || fallback

  const surface = read('--app-panel-bg-raised', '#ffffff')
  const text = read('--app-meta-value', '#1e293b')
  const accent = read('--app-accent', '#0891b2')
  const border = read('--app-glass-border', 'transparent')
  const line = read('--app-text-faint', '#6b7280')

  return {
    fontFamily: read('--mantine-font-family', 'Inter, sans-serif'),
    fontSize: '13px',
    background: 'transparent',
    // Nodes: the console's raised panel, outlined in the accent that means
    // "this is the subject" everywhere else in the UI.
    primaryColor: surface,
    primaryTextColor: text,
    primaryBorderColor: accent,
    secondaryColor: read('--app-panel-bg-soft', '#f8f9fa'),
    secondaryTextColor: text,
    secondaryBorderColor: border,
    tertiaryColor: read('--app-panel-bg', '#f1f3f5'),
    tertiaryTextColor: text,
    tertiaryBorderColor: border,
    // Edges and the labels riding on them.
    lineColor: line,
    textColor: text,
    edgeLabelBackground: read('--app-panel-bg', '#f1f3f5'),
    // Sequence and state diagrams draw their own furniture.
    actorBkg: surface,
    actorBorder: accent,
    actorTextColor: text,
    actorLineColor: line,
    signalColor: text,
    signalTextColor: text,
    labelBoxBkgColor: surface,
    labelBoxBorderColor: border,
    labelTextColor: text,
    loopTextColor: text,
    noteBkgColor: read('--app-surface-info', 'rgba(37,99,235,0.06)'),
    noteTextColor: text,
    noteBorderColor: read('--app-blue', '#2563eb'),
    // Journey, timeline and gitGraph draw banded backgrounds and titles.
    altBackground: read('--app-panel-bg-soft', '#f8f9fa'),
    titleColor: text,
  }
}

/**
 * The series palette, in the order mermaid assigns colours to journey sections,
 * timeline periods and gitGraph branches. Distinct in hue and ordered so
 * neighbours stay apart at a glance — the console's accent leads, since the
 * first series is usually the subject. Each one carries white text at ≥4.5:1,
 * because mermaid writes labels on top of them.
 */
const SERIES_COLORS = [
  '#0e7490',
  '#6d28d9',
  '#15803d',
  '#b45309',
  '#b91c1c',
  '#1d4ed8',
  '#be185d',
  '#0f766e',
]

/**
 * The diagram types a note may draw.
 *
 * Every one of these says something about STRUCTURE — an order, a branch, a
 * relationship — which is the thing prose is worst at and a picture is best at.
 * Mermaid also renders charts (`pie`, `xychart`, `sankey`, `quadrantChart`), and
 * those are deliberately not here: a chart spends the reader's screen on a
 * handful of numbers a sentence or a table carries better, and it puts the
 * loudest typography on the page around the least important content. A chart
 * fence still renders — as its own source, which is what a note is for.
 */
const DRAWN_DIAGRAMS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'classDiagram',
  'journey',
  'timeline',
  'mindmap',
  'gitGraph',
] as const

/**
 * The diagram's own words about itself: mermaid's accessibility directives. They
 * are the note's alt text, and the only form of the diagram available to a
 * screen reader or to a reader on a screen too narrow to lay it out.
 */
const ACC_TITLE = /^\s*accTitle\s*:\s*(.+)$/m
const ACC_DESCR = /^\s*accDescr\s*:\s*(.+)$/m

const declaredKind = (code: string): string | null => {
  for (const raw of code.split('\n')) {
    const line = raw.trim()
    // Directives, front-matter and comments all precede the declaration.
    if (
      !line ||
      line.startsWith('%%') ||
      line.startsWith('---') ||
      line.startsWith('config:') ||
      line.startsWith('title:')
    ) {
      continue
    }
    return /^([A-Za-z][\w-]*)/.exec(line)?.[1] ?? null
  }
  return null
}

const isDrawn = (code: string): boolean => {
  const kind = declaredKind(code)
  return kind !== null && DRAWN_DIAGRAMS.some((drawn) => drawn === kind)
}

const describe = (code: string): string | null =>
  ACC_TITLE.exec(code)?.[1]?.trim() ?? ACC_DESCR.exec(code)?.[1]?.trim() ?? null

type MermaidDiagramProps = {
  /** The fence's contents, exactly as the author wrote them. */
  code: string
}

type RenderState =
  | { status: 'pending' }
  | { status: 'ready'; svg: string }
  | { status: 'failed' }

/**
 * One ```mermaid fence, drawn.
 *
 * A knowledge note describing a flow in prose is a paragraph the reader has to
 * hold in their head; the same flow as a diagram is a glance. Mermaid is the
 * form that keeps the note plain markdown — GitHub renders these fences too, and
 * anywhere that doesn't, the fence degrades to readable source rather than to
 * nothing.
 *
 * A fence that does not parse renders as its own source with a line saying so.
 * Notes are written by agents and by people, and a diagram that fails silently
 * (or takes the page down with it) is worse than one that shows its working.
 */
export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ code }) => {
  const hostRef = useRef<HTMLDivElement>(null)
  const drawn = isDrawn(code)
  const [state, setState] = useState<RenderState>(() =>
    drawn ? { status: 'pending' } : { status: 'failed' }
  )
  // What the last successful draw was worth in pixels. Re-rendering on a theme
  // flip empties the host for a frame, and without this the page jumps by the
  // full height of every diagram on it.
  const heightRef = useRef<number>(0)
  // Re-rendered on a theme change: the SVG bakes its colours in at draw time, so
  // a diagram drawn in dark and left alone stays dark on a white page.
  const colorScheme = useComputedColorScheme('dark')
  // `mermaid.render` needs a DOM id that is unique per call — it mounts the
  // diagram off-screen under that id to measure it.
  const baseId = useId().replace(/[^a-zA-Z0-9]/g, '')

  useEffect(() => {
    if (!drawn) return
    let cancelled = false
    setState({ status: 'pending' })

    void (async () => {
      const host = hostRef.current
      if (!host) return
      try {
        const mermaid = await loadMermaid()
        if (cancelled) return
        mermaid.initialize({
          startOnLoad: false,
          // Strict is mermaid's default and the reason this is safe on note
          // content we did not write: labels are rendered as text, never as HTML,
          // so a diagram cannot carry script or markup into the page.
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            ...themeVariablesFrom(host),
            ...Object.fromEntries(
              SERIES_COLORS.flatMap((color, index) => [
                [`cScale${index}`, color],
                [`cScaleLabel${index}`, '#ffffff'],
              ])
            ),
          },
          // Intrinsic width, not fit-to-container: a fitted diagram keeps its
          // aspect ratio by scaling the type down with it, and a flowchart in a
          // narrow pane arrives as an unreadable strip. At full size it stays
          // legible and the host scrolls.
          flowchart: { curve: 'basis', useMaxWidth: false },
          // Mermaid sizes each diagram type's type independently, and its
          // defaults run 16–18px — larger than this document's own headings, on
          // a figure that supports the prose rather than leads it. Every
          // renderer with its own knob gets the 13px the flowchart uses.
          sequence: {
            useMaxWidth: false,
            actorFontSize: 13,
            messageFontSize: 13,
            noteFontSize: 12,
            actorMargin: 60,
          },
          class: { useMaxWidth: false },
          state: { useMaxWidth: false },
          er: { useMaxWidth: false, fontSize: 13 },
          journey: { useMaxWidth: false },
          timeline: { useMaxWidth: false },
          gitGraph: { useMaxWidth: false },
        })
        // Parsed before rendering: `render` reports a bad fence by writing an
        // error graphic into the document body and leaving it there, which
        // outlives this component. `parse` just throws.
        await mermaid.parse(code)
        const { svg } = await mermaid.render(`mermaid-${baseId}`, code)
        if (!cancelled) setState({ status: 'ready', svg })
      } catch (error) {
        // Expected often enough to be part of the design — an agent mid-edit
        // leaves half a diagram behind — so it is shown, not thrown. Logged at
        // debug level because the source is on screen either way.
        console.debug('[markdown] mermaid fence did not render', error)
        if (!cancelled) setState({ status: 'failed' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [code, colorScheme, baseId, drawn])

  // Remembered for the next draw, which starts from an empty host.
  useEffect(() => {
    const host = hostRef.current
    if (state.status === 'ready' && host && host.clientHeight > 0) {
      heightRef.current = host.clientHeight
    }
  }, [state])

  if (state.status === 'failed') {
    // Two ways to end up here, and the reader is owed the difference: a fence
    // that does not parse is a mistake to fix, a chart is a choice this renderer
    // made. Both keep the source, which is the note's actual content.
    return (
      <Box className={classes.mermaidFallback} role="status">
        <Text component="div" className={classes.mermaidFallbackLabel}>
          {drawn ? <TriangleAlert size={13} /> : null}
          {drawn ? m.markdown_diagram_failed() : m.markdown_diagram_undrawn()}
        </Text>
        <pre>
          <code>{code}</code>
        </pre>
      </Box>
    )
  }

  const label = describe(code)

  return (
    <ScrollRegion
      ref={hostRef}
      className={classes.mermaidDiagram}
      restingRole="img"
      data-testid="mermaid-diagram"
      data-status={state.status}
      // `accTitle:`/`accDescr:` in the fence, which is the only text form of the
      // diagram that exists. Without one it is announced as a diagram rather
      // than as an unnamed image — true, and all this component knows.
      label={(label as I18nString | null) ?? m.markdown_diagram_label()}
      style={
        state.status === 'pending' && heightRef.current
          ? { minHeight: heightRef.current }
          : undefined
      }
      // The SVG comes from mermaid's own serializer, built from a parse tree it
      // produced under securityLevel 'strict' — there is no path from the fence
      // text to markup here. It is set as HTML because that is the only way to
      // put a foreign SVG document into the page.
      dangerouslySetInnerHTML={
        state.status === 'ready' ? { __html: state.svg } : undefined
      }
    >
      {/* Holds a diagram's worth of space while mermaid loads, so a note full of
          diagrams does not jump as each one lands. */}
      {state.status === 'pending' ? (
        <Box className={classes.mermaidPending} />
      ) : null}
    </ScrollRegion>
  )
}
