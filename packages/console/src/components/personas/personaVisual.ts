import type { LucideIcon } from 'lucide-react'
import {
  ShoppingCart,
  Headset,
  Briefcase,
  Wrench,
  CreditCard,
  Stethoscope,
  GraduationCap,
  Truck,
  Building2,
  UserRound,
  Smile,
  Package,
} from 'lucide-react'

const PALETTE = [
  'yellow',
  'violet',
  'blue',
  'teal',
  'grape',
  'cyan',
  'pink',
  'orange',
  'lime',
  'indigo',
] as const

export type PersonaColor = (typeof PALETTE)[number]

const stableHash = (value: string): number => {
  let h = 0
  for (let i = 0; i < value.length; i++) {
    h = (Math.imul(h, 31) + value.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const ICON_KEYWORDS: Array<[RegExp, LucideIcon]> = [
  [/shop|buy|cart|checkout|customer|order/, ShoppingCart],
  [/support|agent|help|service|desk/, Headset],
  [/admin|manager|owner|exec|lead|boss/, Briefcase],
  [/dev|engineer|tech|build/, Wrench],
  [/pay|bill|finance|account/, CreditCard],
  [/doctor|nurse|clinic|patient|health/, Stethoscope],
  [/teach|student|tutor|learn/, GraduationCap],
  [/ship|deliver|courier|logistics|driver/, Truck],
  [/company|org|business|enterprise/, Building2],
]

const FALLBACK_ICONS: LucideIcon[] = [UserRound, Smile, Package, Building2]

export interface PersonaVisual {
  color: PersonaColor
  Icon: LucideIcon
}

export const personaVisual = (
  key: string,
  jobTitle?: string,
  name?: string
): PersonaVisual => {
  const color = PALETTE[stableHash(key) % PALETTE.length]
  const haystack = `${key} ${jobTitle ?? ''} ${name ?? ''}`.toLowerCase()
  const matched = ICON_KEYWORDS.find(([re]) => re.test(haystack))?.[1]
  const Icon =
    matched ?? FALLBACK_ICONS[stableHash(key) % FALLBACK_ICONS.length]
  return { color, Icon }
}
