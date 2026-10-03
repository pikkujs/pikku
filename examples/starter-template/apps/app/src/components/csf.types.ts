import type { ComponentType } from 'react'

// Component Story Format types for the Design tab. Every `*.stories.tsx` beside a
// component is read by the design server's Library lens (`*.app.stories.tsx` →
// the App lens). These types are structural only — the design server never
// imports this file, it reads the shapes at runtime.

export interface ArgType {
  description?: string
  control?: string | false
  defaultValue?: unknown
}

export interface StoryMeta {
  title: string
  component: ComponentType<any>
  description?: string
  // Left-menu grouping in the Design tab. Falls back to the first tag.
  group?: string
  tags?: string[]
  argTypes?: Record<string, ArgType>
}

export interface Story {
  args?: Record<string, unknown>
  render?: ComponentType<any>
  name?: string
}

// An app-level widget's meta: same as StoryMeta plus the queries/mutations the
// PAGE owns and feeds in as props.
export interface AppStoryMeta extends StoryMeta {
  inputs?: { name: string; kind: 'query' | 'mutation'; type?: string; description?: string }[]
}

// One named data state of an app widget (pending / error / empty / loaded).
export interface AppStory extends Story {
  tag?: string
}
