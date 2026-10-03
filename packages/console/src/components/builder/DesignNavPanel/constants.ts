import { Box as BoxIcon, Grid3x3, type LucideIcon } from 'lucide-react'
import type { DesignLens } from './types.js'

export const DESIGN_LENSES: { id: DesignLens; icon: LucideIcon }[] = [
  { id: 'app', icon: BoxIcon },
  { id: 'library', icon: Grid3x3 },
]
