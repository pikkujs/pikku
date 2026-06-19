import {
  Package,
  KeyRound,
  CreditCard,
  Database,
  Bot,
  Mail,
  Server,
  TrendingUp,
  Activity,
  Radio,
  Search,
  Wrench,
} from 'lucide-react'
import type { PackageMeta } from '../../pages/PackagesPage'

export interface CategoryMeta {
  icon: React.ComponentType<{ size?: number }>
  color: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  auth: { icon: KeyRound, color: 'violet' },
  payments: { icon: CreditCard, color: 'green' },
  database: { icon: Database, color: 'blue' },
  agents: { icon: Bot, color: 'orange' },
  ai: { icon: Bot, color: 'orange' },
  email: { icon: Mail, color: 'cyan' },
  storage: { icon: Server, color: 'grape' },
  analytics: { icon: TrendingUp, color: 'teal' },
  observability: { icon: Activity, color: 'red' },
  observe: { icon: Activity, color: 'red' },
  realtime: { icon: Radio, color: 'cyan' },
  search: { icon: Search, color: 'yellow' },
  devtools: { icon: Wrench, color: 'gray' },
}

export const DEFAULT_CATEGORY_META: CategoryMeta = {
  icon: Package,
  color: 'gray',
}

export function getCategoryMeta(category: string | undefined): CategoryMeta {
  if (!category) return DEFAULT_CATEGORY_META
  return CATEGORY_META[category.toLowerCase()] ?? DEFAULT_CATEGORY_META
}

export function prettyCategory(category: string): string {
  return category.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function isOfficialAddon(name: string): boolean {
  return /^@pikku(fabric)?\//.test(name)
}

export function addonPrimaryCategory(addon: PackageMeta): string | undefined {
  return addon.categories?.[0]
}

export interface CategoryBucket {
  id: string
  label: string
  count: number
}

export function deriveCategories(addons: PackageMeta[]): CategoryBucket[] {
  const counts = new Map<string, number>()
  for (const addon of addons) {
    const cat = addonPrimaryCategory(addon)
    if (!cat) continue
    counts.set(cat, (counts.get(cat) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: prettyCategory(id), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}
