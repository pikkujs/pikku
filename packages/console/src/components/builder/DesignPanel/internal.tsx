import { type I18nString } from '@pikku/react'
import { type ThemeTokens } from '../themeModel'

export type ComponentMeta = {
  props: string[]
  variantOptions: string[]
  sizeOptions: string[]
}

export const DEFAULT_TOKENS: ThemeTokens = {
  spacing: ['xs', 'sm', 'md', 'lg', 'xl'],
  radius: ['xs', 'sm', 'md', 'lg', 'xl'],
  fontSizes: ['xs', 'sm', 'md', 'lg', 'xl'],
}

export type PropMeta = {
  label: I18nString
  description: I18nString
  options?: readonly string[]
  tokenScale?: keyof ThemeTokens
  type?: 'color'
}

export type SelectedElementInfo = {
  omId: string
  tag: string
  component: string
  rect: { top: number; left: number; width: number; height: number } | null
}

export const SWATCH_SIZE = 20

export const TOKEN_SCALE_LABELS: Record<string, string> = {
  xs: 'X Small',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
  xl: 'X Large',
}
