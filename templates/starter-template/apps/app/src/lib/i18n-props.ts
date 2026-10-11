import type { I18nNode, I18nString } from '@pikku/react'

type LabelKey = 'aria-label' | 'title' | 'placeholder'

export type WithLabels<P> = { [K in keyof P]: K extends LabelKey ? I18nString : P[K] }

export type WithText<P> = {
  [K in keyof P]: K extends 'children' ? I18nNode : K extends LabelKey ? I18nString : P[K]
}
