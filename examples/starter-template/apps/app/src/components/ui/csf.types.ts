import type { ComponentType } from 'react'

export interface ArgType {
  description?: string
  control?: string | false
  defaultValue?: unknown
}

export interface StoryMeta {
  title: string
  component: ComponentType<any>
  description?: string
  group?: string
  tags?: string[]
  argTypes?: Record<string, ArgType>
}

export interface Story {
  args?: Record<string, unknown>
  render?: ComponentType<any>
  name?: string
}

export interface AppStoryMeta extends StoryMeta {
  inputs?: { name: string; kind: 'query' | 'mutation'; type?: string; description?: string }[]
}

export interface AppStory extends Story {
  tag?: string
}
