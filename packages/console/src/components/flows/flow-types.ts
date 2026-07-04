import type { PersonaRef } from '../personas/persona-types'

export interface FlowEntry {
  name: string
  displayName: string
  description?: string
  cast: PersonaRef[]
  stepCount: number
}
